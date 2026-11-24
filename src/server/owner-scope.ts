import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { doctorToOwner, linkToClient, referralToCode, type DoctorRow } from '~/lib/doctor-owner'
import { env, hasSupabase } from '~/lib/env'
import {
  isPremiumPlan,
  type OwnerPremiumPurchase,
  type OwnerPremiumSummary,
} from '~/lib/premium'
import { buildProgressBoard } from '~/lib/task-progress'
import type {
  DashboardInsights,
  Owner,
  OwnerClient,
  OwnerCode,
  OwnerTask,
  OwnerTaskAssignment,
  OwnerTopic,
} from '~/lib/types'
import { getSupabaseAdmin } from '~/lib/supabase.server'

export type OwnerContext = {
  userId: string
  doctor: DoctorRow
  owner: Owner
}

/** Supabase client authenticated as the signed-in owner (RLS-scoped). */
export function createOwnerSupabase(accessToken: string): SupabaseClient {
  const url = env.supabaseUrl()!
  const anon = env.supabaseAnonKey()!
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

export async function resolveOwnerFromToken(accessToken: string): Promise<OwnerContext> {
  if (!hasSupabase()) throw new Error('Supabase is not configured')
  const userClient = createOwnerSupabase(accessToken)
  const { data: userData, error: userErr } = await userClient.auth.getUser(accessToken)
  if (userErr || !userData.user) throw new Error(userErr?.message || 'Invalid session')

  const { data: doctor, error: docErr } = await userClient
    .from('doctors')
    .select('*')
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (docErr) throw new Error(docErr.message)
  if (!doctor) throw new Error('No Front Desk owner profile for this login. Ask back office to provision you.')
  if (!doctor.active) throw new Error('Owner account is inactive.')

  return {
    userId: userData.user.id,
    doctor: doctor as DoctorRow,
    owner: doctorToOwner(doctor as DoctorRow),
  }
}

export async function loadOwnerClients(
  doctorId: string,
  accessToken: string,
): Promise<OwnerClient[]> {
  const db = createOwnerSupabase(accessToken)
  const { data: links, error } = await db
    .from('patient_doctor_links')
    .select('id, patient_id, doctor_id, referral_code, consent_status, created_at, revoked_at')
    .eq('doctor_id', doctorId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  const rows = links || []
  if (!rows.length) return []

  const patientIds = rows.map((r) => r.patient_id)
  const { data: profiles } = await db
    .from('profiles')
    .select('id, display_name, referral_code_used')
    .in('id', patientIds)

  const profileMap = new Map((profiles || []).map((p) => [p.id, p]))

  const emailMap = new Map<string, string>()
  const admin = getSupabaseAdmin()
  if (admin) {
    await Promise.all(
      patientIds.slice(0, 40).map(async (id) => {
        const { data } = await admin.auth.admin.getUserById(id)
        if (data.user?.email) emailMap.set(id, data.user.email)
      }),
    )
  }

  return rows.map((link) =>
    linkToClient({
      link,
      profile: profileMap.get(link.patient_id) || null,
      email: emailMap.get(link.patient_id) || null,
    }),
  )
}

export async function loadOwnerCodes(doctorId: string, accessToken: string): Promise<OwnerCode[]> {
  const db = createOwnerSupabase(accessToken)
  const { data, error } = await db
    .from('referral_codes')
    .select('id, code, doctor_id, active, campaign, created_at')
    .eq('doctor_id', doctorId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data || []).map(referralToCode)
}

/**
 * Premium buyers among *any* users linked to this owner via *their* referral codes.
 * Not limited to students — upper / other user types count the same way.
 *
 * Path: referral_codes (doctor) → patient_doctor_links (same doctor + matching code)
 * → public.subscriptions (user_id). Optional enrichment from
 * referral_attributions.premium_plan / premium_purchased_at when readable.
 *
 * Does not count users linked to other owners.
 */
export async function loadOwnerPremiumPurchases(
  doctorId: string,
  accessToken: string,
  clients?: OwnerClient[],
): Promise<OwnerPremiumSummary> {
  const empty = (extra?: Partial<OwnerPremiumSummary>): OwnerPremiumSummary => ({
    count: 0,
    byPlan: {},
    purchases: [],
    sourceAvailable: false,
    ...extra,
  })

  const db = createOwnerSupabase(accessToken)
  const { data: codeRows, error: codeErr } = await db
    .from('referral_codes')
    .select('code')
    .eq('doctor_id', doctorId)
  if (codeErr) throw new Error(codeErr.message)

  const ownerCodes = new Set(
    (codeRows || [])
      .map((r) => String(r.code || '').trim().toUpperCase())
      .filter(Boolean),
  )
  if (!ownerCodes.size) {
    return empty({
      sourceAvailable: true,
      note: 'No referral codes for this owner yet — premium tracking needs a code.',
    })
  }

  const { data: links, error: linkErr } = await db
    .from('patient_doctor_links')
    .select('patient_id, referral_code, created_at, revoked_at')
    .eq('doctor_id', doctorId)
  if (linkErr) throw new Error(linkErr.message)

  const codeLinked = (links || []).filter((l) => {
    const code = String(l.referral_code || '').trim().toUpperCase()
    return code && ownerCodes.has(code) && !l.revoked_at
  })
  if (!codeLinked.length) {
    return empty({
      sourceAvailable: true,
      note: 'No users have joined with this owner’s referral code yet.',
    })
  }

  const linkByPatient = new Map<string, { referralCode: string }>()
  for (const l of codeLinked) {
    if (!linkByPatient.has(l.patient_id)) {
      linkByPatient.set(l.patient_id, {
        referralCode: String(l.referral_code || '').trim().toUpperCase(),
      })
    }
  }
  const patientIds = [...linkByPatient.keys()]

  const clientMap = new Map((clients || []).map((c) => [c.id, c]))
  const admin = getSupabaseAdmin()
  const reader = admin || db

  const { data: subs, error: subErr } = await reader
    .from('subscriptions')
    .select('user_id, plan, status, current_period_end, updated_at')
    .in('user_id', patientIds)

  if (subErr) {
    return empty({
      note: admin
        ? `Could not read subscriptions: ${subErr.message}`
        : 'Premium plan data needs SUPABASE_SERVICE_ROLE_KEY on the server (owners cannot read other users’ subscriptions via RLS).',
    })
  }

  type SubRow = {
    user_id: string
    plan: string
    status: string | null
    current_period_end: string | null
    updated_at: string | null
  }
  const premiumSubs = ((subs || []) as SubRow[]).filter((s) => isPremiumPlan(s.plan))

  // Attribution timestamps (conversion), still scoped to this doctor + code-linked users.
  const purchasedAt = new Map<string, string>()
  const attrPlan = new Map<string, string>()
  if (admin) {
    const { data: attrs } = await admin
      .from('referral_attributions')
      .select('user_id, premium_plan, premium_purchased_at, doctor_id')
      .eq('doctor_id', doctorId)
      .not('premium_plan', 'is', null)
      .in('user_id', patientIds)
    for (const a of attrs || []) {
      if (!a.user_id || !isPremiumPlan(a.premium_plan)) continue
      if (a.premium_purchased_at) purchasedAt.set(a.user_id, a.premium_purchased_at)
      if (a.premium_plan) attrPlan.set(a.user_id, a.premium_plan)
    }
  }

  // Include attribution-only premium buyers who are code-linked but maybe already on a free row.
  const premiumUserIds = new Set<string>([
    ...premiumSubs.map((s) => s.user_id),
    ...attrPlan.keys(),
  ])

  const subByUser = new Map(premiumSubs.map((s) => [s.user_id, s]))
  const premiumIds = [...premiumUserIds].filter((id) => linkByPatient.has(id))

  const { data: profiles } = premiumIds.length
    ? await db.from('profiles').select('id, display_name').in('id', premiumIds)
    : { data: [] as { id: string; display_name: string | null }[] }
  const profileMap = new Map((profiles || []).map((p) => [p.id, p.display_name]))

  const emailMap = new Map<string, string>()
  if (admin) {
    await Promise.all(
      premiumIds.slice(0, 60).map(async (id) => {
        const client = clientMap.get(id)
        if (client?.email && !client.email.endsWith('@client.local')) {
          emailMap.set(id, client.email)
          return
        }
        const { data } = await admin.auth.admin.getUserById(id)
        if (data.user?.email) emailMap.set(id, data.user.email)
      }),
    )
  }

  const purchases: OwnerPremiumPurchase[] = []
  for (const userId of premiumIds) {
    const link = linkByPatient.get(userId)!
    const sub = subByUser.get(userId)
    const plan = sub?.plan || attrPlan.get(userId)
    if (!plan || !isPremiumPlan(plan)) continue
    const client = clientMap.get(userId)
    const email =
      emailMap.get(userId) ||
      client?.email ||
      `${userId.slice(0, 8)}@client.local`
    purchases.push({
      clientId: userId,
      email,
      fullName: client?.full_name || profileMap.get(userId) || null,
      referralCode: link.referralCode,
      plan,
      status: sub?.status ?? null,
      currentPeriodEnd: sub?.current_period_end ?? null,
      updatedAt: sub?.updated_at ?? null,
      purchasedAt: purchasedAt.get(userId) || sub?.updated_at || null,
    })
  }

  purchases.sort((a, b) => {
    const ta = a.purchasedAt || a.updatedAt || ''
    const tb = b.purchasedAt || b.updatedAt || ''
    return tb.localeCompare(ta)
  })

  const byPlan: Record<string, number> = {}
  for (const p of purchases) {
    byPlan[p.plan] = (byPlan[p.plan] || 0) + 1
  }

  return {
    count: purchases.length,
    byPlan,
    purchases,
    sourceAvailable: true,
    note:
      purchases.length === 0
        ? 'No code-linked users have purchased premium yet.'
        : undefined,
  }
}

export function insightsFromOwnerData(
  clients: OwnerClient[],
  codes: OwnerCode[],
  workspace?: {
    assignments: OwnerTaskAssignment[]
    tasks: OwnerTask[]
    topics: OwnerTopic[]
  },
  premiumPurchases = 0,
): DashboardInsights {
  const activeClients = clients.filter((c) => c.status === 'active').length
  const invitedClients = clients.filter((c) => c.status === 'invited').length
  const inactiveClients = clients.filter(
    (c) => c.status === 'inactive' || c.status === 'churned',
  ).length
  const board = workspace
    ? buildProgressBoard({
        assignments: workspace.assignments,
        tasks: workspace.tasks,
        topics: workspace.topics,
        clients,
      })
    : null
  return {
    totalClients: clients.length,
    activeClients,
    invitedClients,
    inactiveClients,
    taskCompletionRate: board ? board.totals.avgCompletionRate : 0,
    openTasks: board ? board.totals.openTasks : 0,
    completedAssignments: board ? board.totals.completed : 0,
    totalAssignments: board ? board.totals.assigned : 0,
    activeCodes: codes.filter((c) => c.active).length,
    premiumPurchases,
    revenuePlaceholder: {
      mtdCents: 0,
      currency: 'USD',
      note: 'Stripe not configured — revenue placeholder.',
    },
  }
}
