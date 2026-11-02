import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { env, hasSupabase } from '~/lib/env'
import { offeringShareUrl } from '~/lib/offerings'
import type {
  OwnerOffering,
  OwnerOfferingSection,
  OwnerOfferingSession,
} from '~/lib/types'
import { loadWorkspace, saveWorkspacePatch, splitDoctorNotes } from '~/server/fd-store'
import {
  decodeGoogleOAuthState,
  encodeGoogleOAuthState,
  exchangeGoogleCode,
  googleCalendarAuthUrl,
  googleCalendarRedirectUri,
  listGoogleEvents,
  sanitizeOAuthOrigin,
  upsertGoogleEvent,
} from '~/server/google-calendar'
import { createOwnerSupabase, resolveOwnerFromToken } from '~/server/owner-scope'
import { getSupabaseAdmin } from '~/lib/supabase.server'
import { sendMailSmtp } from '~/server/smtp'

const tokenInput = z.object({
  accessToken: z.string().min(10).optional(),
})

function catalogFrom(blob: {
  offerings?: OwnerOffering[]
  offeringSections?: OwnerOfferingSection[]
  offeringSessions?: OwnerOfferingSession[]
}) {
  return {
    offerings: blob.offerings || [],
    sections: blob.offeringSections || [],
    sessions: blob.offeringSessions || [],
  }
}

export const listOfferings = createServerFn({ method: 'POST' })
  .validator(tokenInput)
  .handler(async ({ data }) => {
    if (!data.accessToken) throw new Error('Sign in required')
    if (!hasSupabase()) throw new Error('Supabase is not configured')
    const ctx = await resolveOwnerFromToken(data.accessToken)
    const db = createOwnerSupabase(data.accessToken)
    const { blob } = await loadWorkspace(db, ctx.doctor.id, ctx.doctor.notes)
    const catalog = catalogFrom(blob)
    return {
      ...catalog,
      ownerId: ctx.doctor.id,
      appUrl: env.appUrl(),
      google: {
        connected: Boolean(blob.googleCalendar?.access_token),
        email: blob.googleCalendar?.email || null,
        configured: Boolean(env.googleClientId()),
      },
      links: catalog.offerings.map((o) => ({
        offeringId: o.id,
        url: offeringShareUrl(ctx.doctor.id, o.id),
      })),
    }
  })

export const upsertOffering = createServerFn({ method: 'POST' })
  .validator(
    tokenInput.extend({
      id: z.string().optional(),
      title: z.string().min(1),
      description: z.string().optional(),
      kind: z.enum(['class', 'session', 'meeting', 'program', 'other']).default('class'),
    }),
  )
  .handler(async ({ data }) => {
    if (!data.accessToken) throw new Error('Sign in required')
    const ctx = await resolveOwnerFromToken(data.accessToken)
    const db = createOwnerSupabase(data.accessToken)
    const { blob } = await loadWorkspace(db, ctx.doctor.id, ctx.doctor.notes)
    const offerings = [...(blob.offerings || [])]
    const now = new Date().toISOString()
    let offering: OwnerOffering
    if (data.id) {
      const idx = offerings.findIndex((o) => o.id === data.id)
      if (idx < 0) throw new Error('Offering not found')
      offering = {
        ...offerings[idx]!,
        title: data.title.trim(),
        description: data.description?.trim() || null,
        kind: data.kind,
        updated_at: now,
      }
      offerings[idx] = offering
    } else {
      offering = {
        id: crypto.randomUUID(),
        owner_id: ctx.doctor.id,
        title: data.title.trim(),
        description: data.description?.trim() || null,
        kind: data.kind,
        created_at: now,
        updated_at: now,
      }
      offerings.unshift(offering)
    }
    await saveWorkspacePatch(db, ctx.doctor.id, ctx.doctor.notes, { offerings })
    return { offering, url: offeringShareUrl(ctx.doctor.id, offering.id) }
  })

export const deleteOffering = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    if (!data.accessToken) throw new Error('Sign in required')
    const ctx = await resolveOwnerFromToken(data.accessToken)
    const db = createOwnerSupabase(data.accessToken)
    const { blob } = await loadWorkspace(db, ctx.doctor.id, ctx.doctor.notes)
    await saveWorkspacePatch(db, ctx.doctor.id, ctx.doctor.notes, {
      offerings: (blob.offerings || []).filter((o) => o.id !== data.id),
      offeringSections: (blob.offeringSections || []).filter((s) => s.offering_id !== data.id),
      offeringSessions: (blob.offeringSessions || []).filter((s) => s.offering_id !== data.id),
    })
    return { ok: true as const }
  })

export const upsertSection = createServerFn({ method: 'POST' })
  .validator(
    tokenInput.extend({
      id: z.string().optional(),
      offeringId: z.string().min(1),
      title: z.string().min(1),
      description: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    if (!data.accessToken) throw new Error('Sign in required')
    const ctx = await resolveOwnerFromToken(data.accessToken)
    const db = createOwnerSupabase(data.accessToken)
    const { blob } = await loadWorkspace(db, ctx.doctor.id, ctx.doctor.notes)
    if (!(blob.offerings || []).some((o) => o.id === data.offeringId)) throw new Error('Offering not found')
    const sections = [...(blob.offeringSections || [])]
    const now = new Date().toISOString()
    let section: OwnerOfferingSection
    if (data.id) {
      const idx = sections.findIndex((s) => s.id === data.id)
      if (idx < 0) throw new Error('Section not found')
      section = {
        ...sections[idx]!,
        title: data.title.trim(),
        description: data.description?.trim() || null,
      }
      sections[idx] = section
    } else {
      section = {
        id: crypto.randomUUID(),
        offering_id: data.offeringId,
        title: data.title.trim(),
        description: data.description?.trim() || null,
        created_at: now,
      }
      sections.push(section)
    }
    await saveWorkspacePatch(db, ctx.doctor.id, ctx.doctor.notes, { offeringSections: sections })
    return { section }
  })

export const deleteSection = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    if (!data.accessToken) throw new Error('Sign in required')
    const ctx = await resolveOwnerFromToken(data.accessToken)
    const db = createOwnerSupabase(data.accessToken)
    const { blob } = await loadWorkspace(db, ctx.doctor.id, ctx.doctor.notes)
    await saveWorkspacePatch(db, ctx.doctor.id, ctx.doctor.notes, {
      offeringSections: (blob.offeringSections || []).filter((s) => s.id !== data.id),
      offeringSessions: (blob.offeringSessions || []).map((s) =>
        s.section_id === data.id ? { ...s, section_id: null } : s,
      ),
    })
    return { ok: true as const }
  })

export const upsertSession = createServerFn({ method: 'POST' })
  .validator(
    tokenInput.extend({
      id: z.string().optional(),
      offeringId: z.string().min(1),
      sectionId: z.string().optional(),
      title: z.string().min(1),
      startsAt: z.string().min(1),
      endsAt: z.string().optional(),
      location: z.string().optional(),
      meetingUrl: z.string().optional(),
      syncGoogle: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    if (!data.accessToken) throw new Error('Sign in required')
    const ctx = await resolveOwnerFromToken(data.accessToken)
    const db = createOwnerSupabase(data.accessToken)
    const { blob } = await loadWorkspace(db, ctx.doctor.id, ctx.doctor.notes)
    const offering = (blob.offerings || []).find((o) => o.id === data.offeringId)
    if (!offering) throw new Error('Offering not found')
    const sessions = [...(blob.offeringSessions || [])]
    const now = new Date().toISOString()
    let session: OwnerOfferingSession
    if (data.id) {
      const idx = sessions.findIndex((s) => s.id === data.id)
      if (idx < 0) throw new Error('Session not found')
      session = {
        ...sessions[idx]!,
        title: data.title.trim(),
        starts_at: data.startsAt,
        ends_at: data.endsAt || null,
        location: data.location?.trim() || null,
        meeting_url: data.meetingUrl?.trim() || null,
        section_id: data.sectionId || null,
      }
      sessions[idx] = session
    } else {
      session = {
        id: crypto.randomUUID(),
        offering_id: data.offeringId,
        section_id: data.sectionId || null,
        title: data.title.trim(),
        starts_at: data.startsAt,
        ends_at: data.endsAt || null,
        location: data.location?.trim() || null,
        meeting_url: data.meetingUrl?.trim() || null,
        google_event_id: null,
        created_at: now,
      }
      sessions.push(session)
    }

    let google = blob.googleCalendar || null
    if (data.syncGoogle && google?.access_token) {
      const written = await upsertGoogleEvent(google, session, offering.title)
      session = { ...session, google_event_id: written.eventId }
      const idx = sessions.findIndex((s) => s.id === session.id)
      if (idx >= 0) sessions[idx] = session
      google = written.connection
    }

    await saveWorkspacePatch(db, ctx.doctor.id, ctx.doctor.notes, {
      offeringSessions: sessions,
      googleCalendar: google,
    })
    return {
      session,
      url: offeringShareUrl(ctx.doctor.id, offering.id, `session-${session.id}`),
    }
  })

export const deleteSession = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    if (!data.accessToken) throw new Error('Sign in required')
    const ctx = await resolveOwnerFromToken(data.accessToken)
    const db = createOwnerSupabase(data.accessToken)
    const { blob } = await loadWorkspace(db, ctx.doctor.id, ctx.doctor.notes)
    await saveWorkspacePatch(db, ctx.doctor.id, ctx.doctor.notes, {
      offeringSessions: (blob.offeringSessions || []).filter((s) => s.id !== data.id),
    })
    return { ok: true as const }
  })

export const getPublicOffering = createServerFn({ method: 'GET' })
  .validator(z.object({ ownerId: z.string().min(1), offeringId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const admin = getSupabaseAdmin()
    if (!admin) throw new Error('Offering catalog is unavailable')
    const { data: doctor, error } = await admin
      .from('doctors')
      .select('id, full_name, clinic_organization, notes')
      .eq('id', data.ownerId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!doctor) throw new Error('Offering not found')
    const { blob } = splitDoctorNotes(doctor.notes)
    const offering = (blob.offerings || []).find((o) => o.id === data.offeringId)
    if (!offering) throw new Error('Offering not found')
    const sections = (blob.offeringSections || []).filter((s) => s.offering_id === offering.id)
    const sessions = (blob.offeringSessions || []).filter((s) => s.offering_id === offering.id)
    return {
      hostName: doctor.clinic_organization || doctor.full_name || 'Front Desk',
      offering,
      sections,
      sessions,
    }
  })

export const startGoogleCalendar = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({ origin: z.string().url().optional() }))
  .handler(async ({ data }) => {
    if (!data.accessToken) throw new Error('Sign in required')
    const ctx = await resolveOwnerFromToken(data.accessToken)
    const origin = sanitizeOAuthOrigin(data.origin || env.appUrl())
    return {
      url: googleCalendarAuthUrl(encodeGoogleOAuthState(ctx.doctor.id, origin), origin),
      redirectUri: googleCalendarRedirectUri(origin),
    }
  })

export const finishGoogleCalendar = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({ code: z.string().min(1), state: z.string().min(1) }))
  .handler(async ({ data }) => {
    if (!data.accessToken) throw new Error('Sign in required')
    const ctx = await resolveOwnerFromToken(data.accessToken)
    const parsed = decodeGoogleOAuthState(data.state)
    if (parsed.doctorId !== ctx.doctor.id) {
      throw new Error('Google Calendar state did not match this owner')
    }
    const conn = await exchangeGoogleCode(data.code, parsed.origin)
    const db = createOwnerSupabase(data.accessToken)
    await saveWorkspacePatch(db, ctx.doctor.id, ctx.doctor.notes, { googleCalendar: conn })
    return { email: conn.email, connected: true as const }
  })

export const disconnectGoogleCalendar = createServerFn({ method: 'POST' })
  .validator(tokenInput)
  .handler(async ({ data }) => {
    if (!data.accessToken) throw new Error('Sign in required')
    const ctx = await resolveOwnerFromToken(data.accessToken)
    const db = createOwnerSupabase(data.accessToken)
    await saveWorkspacePatch(db, ctx.doctor.id, ctx.doctor.notes, { googleCalendar: null })
    return { connected: false as const }
  })

export const listCalendarBoard = createServerFn({ method: 'POST' })
  .validator(tokenInput)
  .handler(async ({ data }) => {
    if (!data.accessToken) throw new Error('Sign in required')
    const ctx = await resolveOwnerFromToken(data.accessToken)
    const db = createOwnerSupabase(data.accessToken)
    const { blob } = await loadWorkspace(db, ctx.doctor.id, ctx.doctor.notes)
    const sessions = blob.offeringSessions || []
    const offerings = blob.offerings || []
    let googleEvents: { id: string; summary: string; start: string | null }[] = []
    let googleError: string | null = null
    let google = blob.googleCalendar || null
    if (google?.access_token) {
      try {
        const now = new Date()
        const from = new Date(now.getTime() - 7 * 86400000).toISOString()
        const to = new Date(now.getTime() + 60 * 86400000).toISOString()
        const listed = await listGoogleEvents(google, from, to)
        google = listed.connection
        googleEvents = listed.events.map((e) => ({
          id: e.id,
          summary: e.summary || '(no title)',
          start: e.start?.dateTime || e.start?.date || null,
        }))
        await saveWorkspacePatch(db, ctx.doctor.id, ctx.doctor.notes, { googleCalendar: google })
      } catch (e) {
        googleError = e instanceof Error ? e.message : 'Google Calendar read failed'
      }
    }
    return {
      sessions,
      offerings,
      google: {
        connected: Boolean(google?.access_token),
        email: google?.email || null,
        configured: Boolean(env.googleClientId()),
        hasSecret: Boolean(env.googleClientSecret()),
        redirectUri: googleCalendarRedirectUri(env.appUrl()),
        error: googleError,
      },
      googleEvents,
    }
  })

export const testPlatformMail = createServerFn({ method: 'POST' })
  .validator(tokenInput.extend({ to: z.string().email() }))
  .handler(async ({ data }) => {
    if (!data.accessToken) throw new Error('Sign in required')
    await resolveOwnerFromToken(data.accessToken)
    return sendMailSmtp({
      to: data.to,
      subject: 'Front Desk mail test',
      html: '<p>Resend is connected. You can send campaign and offering links from Front Desk.</p>',
      text: 'Resend is connected. You can send campaign and offering links from Front Desk.',
    })
  })
