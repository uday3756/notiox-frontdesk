import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { doctorToOwner, linkToClient, referralToCode, type DoctorRow } from '~/lib/doctor-owner'
import { env, hasSupabase } from '~/lib/env'
import type { DashboardInsights, Owner, OwnerClient, OwnerCode } from '~/lib/types'
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

export function insightsFromOwnerData(
  clients: OwnerClient[],
  codes: OwnerCode[],
): DashboardInsights {
  const activeClients = clients.filter((c) => c.status === 'active').length
  const invitedClients = clients.filter((c) => c.status === 'invited').length
  const inactiveClients = clients.filter(
    (c) => c.status === 'inactive' || c.status === 'churned',
  ).length
  return {
    totalClients: clients.length,
    activeClients,
    invitedClients,
    inactiveClients,
    taskCompletionRate: 0,
    openTasks: 0,
    completedAssignments: 0,
    totalAssignments: 0,
    activeCodes: codes.filter((c) => c.active).length,
    revenuePlaceholder: {
      mtdCents: 0,
      currency: 'USD',
      note: 'Stripe not configured — revenue placeholder.',
    },
  }
}
