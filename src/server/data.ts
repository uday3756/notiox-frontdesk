import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { demoStore } from '~/lib/demo-data'
import { hasSupabase, missingKeys } from '~/lib/env'
import { isHostAllowed } from '~/lib/hostAllowlist'
import { getSupabaseAdmin } from '~/lib/supabase.server'
import {
  createOwnerSupabase,
  insightsFromOwnerData,
  loadOwnerClients,
  loadOwnerCodes,
  resolveOwnerFromToken,
} from '~/server/owner-scope'

const tokenInput = z.object({
  accessToken: z.string().min(10).optional(),
})

function randomCode(prefix = 'NX'): string {
  const chunk = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `${prefix}-${chunk}`
}

export const getBootstrap = createServerFn({ method: 'POST' })
  .validator(tokenInput)
  .handler(async ({ data }) => {
    const base = {
      mode: hasSupabase() ? ('supabase' as const) : ('demo' as const),
      missingKeys: missingKeys(),
      notioxClientUrl:
        process.env.VITE_NOTIOX_CLIENT_URL ||
        process.env.NOTIOX_CLIENT_URL ||
        'https://www.notiolive.com',
    }

    if (!data.accessToken) throw new Error('Sign in required')
    if (!hasSupabase()) throw new Error('Supabase is not configured')

    const ctx = await resolveOwnerFromToken(data.accessToken)
    return { ...base, owner: ctx.owner, authenticated: true as const }
  })

export const getDashboard = createServerFn({ method: 'POST' })
  .validator(tokenInput)
  .handler(async ({ data }) => {
    // Authenticated owners: live Supabase only — never inject hardcoded demo clients
    if (!data.accessToken) {
      throw new Error('Sign in required')
    }
    if (!hasSupabase()) throw new Error('Supabase is not configured')

    const ctx = await resolveOwnerFromToken(data.accessToken)
    const [clients, codes] = await Promise.all([
      loadOwnerClients(ctx.doctor.id, data.accessToken),
      loadOwnerCodes(ctx.doctor.id, data.accessToken),
    ])
    const codeCounts = new Map<string, number>()
    for (const c of codes) codeCounts.set(c.code, 0)
    for (const cl of clients) {
      const code = cl.tags[0]
      if (code) codeCounts.set(code, (codeCounts.get(code) || 0) + 1)
    }
    const codeBreakdown = [...codeCounts.entries()].map(([code, count]) => ({ code, count }))
    return {
      insights: insightsFromOwnerData(clients, codes),
      recentClients: clients.slice(0, 8),
      codeBreakdown,
      mode: 'supabase' as const,
      authenticated: true as const,
      owner: ctx.owner,
    }
  })

export const listClients = createServerFn({ method: 'POST' })
  .validator(tokenInput)
  .handler(async ({ data }) => {
    if (!data.accessToken) throw new Error('Sign in required')
    if (!hasSupabase()) throw new Error('Supabase is not configured')
    const ctx = await resolveOwnerFromToken(data.accessToken)
    const clients = await loadOwnerClients(ctx.doctor.id, data.accessToken)
    return { clients, authenticated: true as const }
  })

export const getClient = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({ id: z.string() }))
  .handler(async ({ data }) => {
    if (!data.accessToken) throw new Error('Sign in required')
    if (!hasSupabase()) throw new Error('Supabase is not configured')

    const ctx = await resolveOwnerFromToken(data.accessToken)
    const clients = await loadOwnerClients(ctx.doctor.id, data.accessToken)
    const client = clients.find((c) => c.id === data.id) ?? null
    // Tasks not yet in shared NotioX schema for Front Desk — empty until owner_tasks exists
    return { client, assignments: [], tasks: [], authenticated: true as const }
  })

export const listCodes = createServerFn({ method: 'POST' })
  .validator(tokenInput)
  .handler(async ({ data }) => {
    if (!data.accessToken) throw new Error('Sign in required')
    if (!hasSupabase()) throw new Error('Supabase is not configured')
    const ctx = await resolveOwnerFromToken(data.accessToken)
    const codes = await loadOwnerCodes(ctx.doctor.id, data.accessToken)
    return { codes, authenticated: true as const }
  })

export const createCode = createServerFn({ method: 'POST' })
  .validator(
    tokenInput.extend({
      label: z.string().optional(),
      codeType: z.enum(['promo', 'referral', 'invite']).default('referral'),
      code: z.string().optional(),
      maxUses: z.number().int().positive().optional(),
    }),
  )
  .handler(async ({ data }) => {
    if (!data.accessToken) throw new Error('Sign in required')
    if (!hasSupabase()) throw new Error('Supabase is not configured')

    const ctx = await resolveOwnerFromToken(data.accessToken)
    const db = createOwnerSupabase(data.accessToken)
    const value = (data.code?.trim() || randomCode('REF')).toUpperCase()
    const { data: row, error } = await db
      .from('referral_codes')
      .insert({
        code: value,
        doctor_id: ctx.doctor.id,
        active: true,
        campaign: data.label || null,
      })
      .select('id, code, doctor_id, active, campaign, created_at')
      .single()
    if (error) throw new Error(error.message)
    return {
      code: {
        id: row.id,
        owner_id: row.doctor_id,
        code: row.code,
        label: row.campaign,
        code_type: 'referral' as const,
        max_uses: null,
        use_count: 0,
        active: row.active,
        expires_at: null,
        created_at: row.created_at,
      },
      authenticated: true as const,
    }
  })

export const listTasks = createServerFn({ method: 'POST' })
  .validator(tokenInput)
  .handler(async ({ data }) => {
    if (!data.accessToken) throw new Error('Sign in required')
    if (!hasSupabase()) throw new Error('Supabase is not configured')
    const ctx = await resolveOwnerFromToken(data.accessToken)
    const clients = await loadOwnerClients(ctx.doctor.id, data.accessToken)
    // Task rows are session-local until owner_tasks exists; clients always from DB
    const ownerTasks = demoStore.tasks.filter((t) => t.owner_id === ctx.doctor.id)
    const ownerAssignments = demoStore.assignments.filter((a) => a.owner_id === ctx.doctor.id)
    return {
      tasks: ownerTasks,
      assignments: ownerAssignments,
      clients,
      authenticated: true as const,
    }
  })

export const createTask = createServerFn({ method: 'POST' })
  .validator(
    tokenInput.extend({
      title: z.string().min(1),
      description: z.string().optional(),
      priority: z.enum(['low', 'medium', 'high']).default('medium'),
      dueAt: z.string().optional(),
      clientIds: z.array(z.string()).default([]),
    }),
  )
  .handler(async ({ data }) => {
    if (!data.accessToken) throw new Error('Sign in required')
    if (!hasSupabase()) throw new Error('Supabase is not configured')
    const ctx = await resolveOwnerFromToken(data.accessToken)
    const ownerId = ctx.doctor.id
    const myClients = await loadOwnerClients(ownerId, data.accessToken)
    const allowed = new Set(myClients.map((c) => c.id))
    const clientIds = data.clientIds.filter((id) => allowed.has(id))
    const task = {
      id: `t_${Date.now()}`,
      owner_id: ownerId,
      title: data.title,
      description: data.description ?? null,
      due_at: data.dueAt ?? null,
      priority: data.priority,
      status: 'open' as const,
      created_at: new Date().toISOString(),
    }
    demoStore.tasks.unshift(task)
    const assignments = clientIds.map((clientId, i) => ({
      id: `a_${Date.now()}_${i}`,
      owner_id: ownerId,
      task_id: task.id,
      client_id: clientId,
      status: 'pending' as const,
      completed_at: null,
    }))
    demoStore.assignments.push(...assignments)
    return { task, assignments }
  })

export const getSettings = createServerFn({ method: 'POST' })
  .validator(tokenInput)
  .handler(async ({ data }) => {
    if (!data.accessToken) throw new Error('Sign in required')
    if (!hasSupabase()) throw new Error('Supabase is not configured')
    const allowedHosts = (process.env.ALLOWED_HOSTS || 'localhost:3000,127.0.0.1:3000')
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean)

    const ctx = await resolveOwnerFromToken(data.accessToken)
    return {
      owner: ctx.owner,
      allowedHosts,
      missingKeys: missingKeys(),
      authenticated: true as const,
    }
  })

export const updateSettings = createServerFn({ method: 'POST' })
  .validator(
    tokenInput.extend({
      fullName: z.string().optional(),
      brandName: z.string().optional(),
      specialty: z.string().optional(),
      country: z.string().optional(),
      timezone: z.string().optional(),
      notes: z.string().optional(),
      newPassword: z.string().min(6).optional(),
      role: z
        .enum(['coach', 'adhd_trainer', 'mental_health_doctor', 'ugc_creator', 'other'])
        .optional(),
      customDomain: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    if (!data.accessToken) throw new Error('Sign in required')
    if (!hasSupabase()) throw new Error('Supabase is not configured')

    const ctx = await resolveOwnerFromToken(data.accessToken)
    const db = createOwnerSupabase(data.accessToken)
    const patch: Record<string, unknown> = {}
    if (data.fullName !== undefined) patch.full_name = data.fullName
    if (data.brandName !== undefined) patch.clinic_organization = data.brandName
    if (data.specialty !== undefined) patch.specialty = data.specialty
    if (data.country !== undefined) patch.country = data.country
    if (data.timezone !== undefined) patch.timezone = data.timezone
    if (data.notes !== undefined) patch.notes = data.notes

    if (data.newPassword) {
      const admin = getSupabaseAdmin()
      if (!admin) throw new Error('Password change requires server SUPABASE_SERVICE_ROLE_KEY')
      const { error: pwErr } = await admin.auth.admin.updateUserById(ctx.userId, {
        password: data.newPassword,
      })
      if (pwErr) throw new Error(pwErr.message)
      patch.password_must_change = false
    }

    if (Object.keys(patch).length) {
      const { error } = await db.from('doctors').update(patch).eq('id', ctx.doctor.id)
      if (error) throw new Error(error.message)
    }
    const refreshed = await resolveOwnerFromToken(data.accessToken)
    return { owner: refreshed.owner }
  })

export const checkHost = createServerFn({ method: 'GET' })
  .validator(z.object({ host: z.string() }))
  .handler(async ({ data }) => {
    const verified = demoStore.owner.custom_domain_verified
      ? [demoStore.owner.custom_domain!].filter(Boolean)
      : []
    return {
      host: data.host,
      allowed: isHostAllowed(data.host, verified),
    }
  })
