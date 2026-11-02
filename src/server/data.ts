import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { demoStore } from '~/lib/demo-data'
import { hasSupabase, missingKeys } from '~/lib/env'
import { isHostAllowed } from '~/lib/hostAllowlist'
import { getSupabaseAdmin } from '~/lib/supabase.server'
import { normalizeAudience } from '~/lib/audience'
import { buildProgressBoard } from '~/lib/task-progress'
import {
  DEFAULT_VIRTUAL_DOMAIN,
  insertTaskWithAssignments,
  insertTopic,
  loadWorkspace,
  newApiKey,
  saveAudienceConfig,
  saveSmtpConfig,
  splitDoctorNotes,
  updateAssignmentStatus,
  upsertAppConnection,
} from '~/server/fd-store'
import { normalizeSmtpInput, publicSmtp, sendMailSmtp } from '~/server/smtp'
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
    const db = createOwnerSupabase(data.accessToken)
    const { blob } = await loadWorkspace(db, ctx.doctor.id, ctx.doctor.notes)
    return {
      ...base,
      owner: ctx.owner,
      audience: normalizeAudience(blob.audience),
      authenticated: true as const,
    }
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
    const db = createOwnerSupabase(data.accessToken)
    const [{ blob }, clients, codes] = await Promise.all([
      loadWorkspace(db, ctx.doctor.id, ctx.doctor.notes),
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
      insights: insightsFromOwnerData(clients, codes, {
        assignments: blob.assignments,
        tasks: blob.tasks,
        topics: blob.topics,
      }),
      recentClients: clients.slice(0, 8),
      codeBreakdown,
      audience: normalizeAudience(blob.audience),
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
    const db = createOwnerSupabase(data.accessToken)
    const [{ blob }, clients] = await Promise.all([
      loadWorkspace(db, ctx.doctor.id, ctx.doctor.notes),
      loadOwnerClients(ctx.doctor.id, data.accessToken),
    ])
    return {
      clients,
      audience: normalizeAudience(blob.audience),
      authenticated: true as const,
    }
  })

export const getClient = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({ id: z.string() }))
  .handler(async ({ data }) => {
    if (!data.accessToken) throw new Error('Sign in required')
    if (!hasSupabase()) throw new Error('Supabase is not configured')

    const ctx = await resolveOwnerFromToken(data.accessToken)
    const clients = await loadOwnerClients(ctx.doctor.id, data.accessToken)
    const client = clients.find((c) => c.id === data.id) ?? null
    const db = createOwnerSupabase(data.accessToken)
    const { blob } = await loadWorkspace(db, ctx.doctor.id, ctx.doctor.notes)
    const assignments = blob.assignments.filter((a) => a.client_id === data.id)
    const tasks = blob.tasks.filter((t) => assignments.some((a) => a.task_id === t.id))
    const progress = buildProgressBoard({
      assignments,
      tasks: blob.tasks,
      topics: blob.topics,
      clients,
    })
    const person = progress.people.find((p) => p.clientId === data.id) || null
    return {
      client,
      assignments,
      tasks,
      person,
      audience: normalizeAudience(blob.audience),
      authenticated: true as const,
    }
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
    const db = createOwnerSupabase(data.accessToken)
    const { blob, source } = await loadWorkspace(db, ctx.doctor.id, ctx.doctor.notes)
    const progress = buildProgressBoard({
      assignments: blob.assignments,
      tasks: blob.tasks,
      topics: blob.topics,
      clients,
    })
    return {
      topics: blob.topics,
      tasks: blob.tasks,
      assignments: blob.assignments,
      clients,
      progress,
      audience: normalizeAudience(blob.audience),
      storage: source,
      authenticated: true as const,
    }
  })

export const updateAssignment = createServerFn({ method: 'POST' })
  .validator(
    tokenInput.extend({
      assignmentId: z.string().min(1),
      status: z.enum(['pending', 'in_progress', 'completed', 'skipped']).optional(),
      ownerSignal: z.enum(['on_track', 'needs_attention', 'at_risk']).nullable().optional(),
      clearOwnerSignal: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    if (!data.accessToken) throw new Error('Sign in required')
    if (!hasSupabase()) throw new Error('Supabase is not configured')
    if (!data.status && data.ownerSignal === undefined && !data.clearOwnerSignal) {
      throw new Error('Nothing to update')
    }
    const ctx = await resolveOwnerFromToken(data.accessToken)
    const db = createOwnerSupabase(data.accessToken)
    return updateAssignmentStatus(db, ctx.doctor.id, ctx.doctor.notes, {
      assignmentId: data.assignmentId,
      status: data.status,
      ownerSignal: data.ownerSignal,
      clearOwnerSignal: data.clearOwnerSignal,
    })
  })

export const createTopic = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({ title: z.string().min(1), description: z.string().optional() }))
  .handler(async ({ data }) => {
    if (!data.accessToken) throw new Error('Sign in required')
    if (!hasSupabase()) throw new Error('Supabase is not configured')
    const ctx = await resolveOwnerFromToken(data.accessToken)
    const db = createOwnerSupabase(data.accessToken)
    return insertTopic(db, ctx.doctor.id, ctx.doctor.notes, data.title, data.description)
  })

export const createTask = createServerFn({ method: 'POST' })
  .validator(
    tokenInput.extend({
      title: z.string().min(1),
      description: z.string().optional(),
      priority: z.enum(['low', 'medium', 'high']).default('medium'),
      dueAt: z.string().optional(),
      topicId: z.string().optional(),
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
    const db = createOwnerSupabase(data.accessToken)
    return insertTaskWithAssignments(db, ownerId, ctx.doctor.notes, {
      title: data.title,
      description: data.description,
      priority: data.priority,
      topicId: data.topicId,
      dueAt: data.dueAt,
      clientIds,
    })
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
    const db = createOwnerSupabase(data.accessToken)
    const { blob, source } = await loadWorkspace(db, ctx.doctor.id, ctx.doctor.notes)
    const virtualDomain =
      blob.app?.virtual_domain ||
      process.env.APP_HOST ||
      DEFAULT_VIRTUAL_DOMAIN
    return {
      owner: ctx.owner,
      allowedHosts,
      missingKeys: missingKeys(),
      app: blob.app,
      smtp: publicSmtp(blob.smtp),
      audience: normalizeAudience(blob.audience),
      virtualDomain,
      storage: source,
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
    const patch: Record<string, unknown> = {}
    if (data.fullName !== undefined) patch.full_name = data.fullName
    if (data.brandName !== undefined) patch.clinic_organization = data.brandName
    if (data.specialty !== undefined) patch.specialty = data.specialty
    if (data.country !== undefined) patch.country = data.country
    if (data.timezone !== undefined) patch.timezone = data.timezone
    if (data.notes !== undefined) {
      const { blob } = splitDoctorNotes(ctx.doctor.notes)
      patch.notes = JSON.stringify({
        bio: data.notes,
        __nxfd__: {
          topics: blob.topics,
          tasks: blob.tasks,
          assignments: blob.assignments,
          app: blob.app,
          smtp: blob.smtp,
          audience: blob.audience,
        },
      })
    }

    const admin = getSupabaseAdmin()
    if (!admin) {
      throw new Error(
        'Profile save needs SUPABASE_SERVICE_ROLE_KEY on the server (owner JWT cannot update doctors).',
      )
    }

    if (data.newPassword) {
      const { error: pwErr } = await admin.auth.admin.updateUserById(ctx.userId, {
        password: data.newPassword,
      })
      if (pwErr) throw new Error(pwErr.message)
      patch.password_must_change = false
    }

    if (Object.keys(patch).length) {
      const { data: updated, error } = await admin
        .from('doctors')
        .update(patch)
        .eq('id', ctx.doctor.id)
        .select('id')
      if (error) throw new Error(error.message)
      if (!updated?.length) throw new Error('Could not update doctor profile (no matching row).')
    }
    const refreshed = await resolveOwnerFromToken(data.accessToken)
    return { owner: refreshed.owner }
  })

export const saveAudienceSettings = createServerFn({ method: 'POST' })
  .validator(
    tokenInput.extend({
      kind: z.enum(['client', 'patient', 'student', 'member', 'custom']),
      singular: z.string().optional(),
      plural: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    if (!data.accessToken) throw new Error('Sign in required')
    if (!hasSupabase()) throw new Error('Supabase is not configured')
    const ctx = await resolveOwnerFromToken(data.accessToken)
    const db = createOwnerSupabase(data.accessToken)
    const audience = await saveAudienceConfig(db, ctx.doctor.id, ctx.doctor.notes, {
      kind: data.kind,
      singular: data.singular,
      plural: data.plural,
    })
    return { audience: normalizeAudience(audience) }
  })

export const saveSmtpSettings = createServerFn({ method: 'POST' })
  .validator(
    tokenInput.extend({
      host: z.string().optional(),
      port: z.number().int().positive().optional(),
      secure: z.boolean().optional(),
      user: z.string().optional(),
      pass: z.string().optional(),
      from: z.string().optional(),
      testTo: z.string().optional(),
      clear: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    if (!data.accessToken) throw new Error('Sign in required')
    if (!hasSupabase()) throw new Error('Supabase is not configured')
    const ctx = await resolveOwnerFromToken(data.accessToken)
    const db = createOwnerSupabase(data.accessToken)
    const { blob } = await loadWorkspace(db, ctx.doctor.id, ctx.doctor.notes)

    if (data.clear) {
      await saveSmtpConfig(db, ctx.doctor.id, ctx.doctor.notes, null)
      return { smtp: publicSmtp(null), cleared: true as const }
    }

    const user = (data.user || '').trim()
    if (!user.includes('@')) {
      throw new Error('SMTP user must be your full mailbox address (e.g. you@gmail.com)')
    }
    const smtp = normalizeSmtpInput({
      host: data.host,
      port: data.port,
      secure: data.secure,
      user,
      pass: data.pass,
      from: data.from,
      existing: blob.smtp,
    })
    if (!smtp.pass) {
      throw new Error('Paste a Gmail app password (not your normal Gmail password)')
    }
    await saveSmtpConfig(db, ctx.doctor.id, ctx.doctor.notes, smtp)

    let test: { ok: boolean; demo?: boolean; error?: string; id?: string } | undefined
    const testTo = data.testTo?.trim()
    if (testTo && testTo.includes('@')) {
      test = await sendMailSmtp({
        to: testTo,
        subject: 'Front Desk mailbox test',
        html: '<p>Your Front Desk SMTP mailbox is connected. You can send campaigns from AI Studio.</p>',
        text: 'Your Front Desk SMTP mailbox is connected.',
        smtp,
      })
    }

    return { smtp: publicSmtp(smtp), test, cleared: false as const }
  })

export const saveAppConnection = createServerFn({ method: 'POST' })
  .validator(
    tokenInput.extend({
      schoolDomain: z.string().optional(),
      rotateKey: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    if (!data.accessToken) throw new Error('Sign in required')
    if (!hasSupabase()) throw new Error('Supabase is not configured')
    const ctx = await resolveOwnerFromToken(data.accessToken)
    const db = createOwnerSupabase(data.accessToken)
    const { blob } = await loadWorkspace(db, ctx.doctor.id, ctx.doctor.notes)
    const virtualDomain = process.env.APP_HOST || DEFAULT_VIRTUAL_DOMAIN
    const school = (data.schoolDomain || blob.app?.school_domain || '').trim() || null
    const apiKey =
      data.rotateKey || !blob.app?.api_key ? newApiKey() : blob.app.api_key
    return upsertAppConnection(db, ctx.doctor.id, ctx.doctor.notes, {
      virtual_domain: virtualDomain,
      school_domain: school,
      api_key: apiKey,
      updated_at: new Date().toISOString(),
    })
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
