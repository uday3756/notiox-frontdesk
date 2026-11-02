import { env } from '~/lib/env'
import type { GoogleCalendarConnection, OwnerOfferingSession } from '~/lib/types'

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ')

export function sanitizeOAuthOrigin(origin?: string) {
  const fallback = env.appUrl().replace(/\/$/, '')
  if (!origin) return fallback
  let parsed: URL
  try {
    parsed = new URL(origin)
  } catch {
    return fallback
  }
  const host = parsed.host.toLowerCase()
  const allowed = new Set(env.allowedHosts().map((h) => h.toLowerCase()))
  const ok =
    allowed.has(host) ||
    host.endsWith('.vercel.app') ||
    host === 'localhost:3000' ||
    host === '127.0.0.1:3000'
  if (!ok) return fallback
  return `${parsed.protocol}//${parsed.host}`
}

export function googleCalendarRedirectUri(origin?: string) {
  const base = sanitizeOAuthOrigin(origin)
  return `${base}/auth/google-calendar`
}

export function encodeGoogleOAuthState(doctorId: string, origin: string) {
  return `${doctorId}::${origin}`
}

export function decodeGoogleOAuthState(state: string): { doctorId: string; origin?: string } {
  const idx = state.indexOf('::')
  if (idx === -1) return { doctorId: state }
  return { doctorId: state.slice(0, idx), origin: state.slice(idx + 2) }
}

export function googleCalendarAuthUrl(state: string, origin?: string) {
  const clientId = env.googleClientId()
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID is not set')
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleCalendarRedirectUri(origin),
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export async function exchangeGoogleCode(
  code: string,
  origin?: string,
): Promise<GoogleCalendarConnection> {
  const clientId = env.googleClientId()
  const clientSecret = env.googleClientSecret()
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID is not set')
  if (!clientSecret) throw new Error('GOOGLE_CLIENT_SECRET is not set on the server')
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    redirect_uri: googleCalendarRedirectUri(origin),
    grant_type: 'authorization_code',
    client_secret: clientSecret,
  })
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'notiox-frontdesk/1.0' },
    body,
  })
  const json = (await res.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    error?: string
    error_description?: string
  }
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || 'Google token exchange failed. Confirm GOOGLE_CLIENT_SECRET and the redirect URI in Google Cloud.')
  }
  const email = await googleEmail(json.access_token)
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token || null,
    expiry: Date.now() + (json.expires_in || 3600) * 1000,
    email,
  }
}

async function googleEmail(accessToken: string) {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'notiox-frontdesk/1.0' },
  })
  if (!res.ok) return null
  const json = (await res.json()) as { email?: string }
  return json.email || null
}

export async function refreshGoogleAccess(conn: GoogleCalendarConnection): Promise<GoogleCalendarConnection> {
  if (Date.now() < conn.expiry - 30_000) return conn
  if (!conn.refresh_token) return conn
  const clientId = env.googleClientId()
  const clientSecret = env.googleClientSecret()
  if (!clientId) return conn
  const body = new URLSearchParams({
    refresh_token: conn.refresh_token,
    client_id: clientId,
    grant_type: 'refresh_token',
  })
  if (clientSecret) body.set('client_secret', clientSecret)
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'notiox-frontdesk/1.0' },
    body,
  })
  const json = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!res.ok || !json.access_token) return conn
  return {
    ...conn,
    access_token: json.access_token,
    expiry: Date.now() + (json.expires_in || 3600) * 1000,
  }
}

export async function listGoogleEvents(conn: GoogleCalendarConnection, timeMin: string, timeMax: string) {
  const live = await refreshGoogleAccess(conn)
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50',
  })
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${live.access_token}`, 'User-Agent': 'notiox-frontdesk/1.0' },
  })
  const json = (await res.json()) as {
    items?: { id: string; summary?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } }[]
    error?: { message?: string }
  }
  if (!res.ok) throw new Error(json.error?.message || 'Could not load Google Calendar events')
  return { events: json.items || [], connection: live }
}

export async function upsertGoogleEvent(conn: GoogleCalendarConnection, session: OwnerOfferingSession, offeringTitle: string) {
  const live = await refreshGoogleAccess(conn)
  const event = {
    summary: `${offeringTitle}: ${session.title}`,
    description: session.location || session.meeting_url || '',
    location: session.location || undefined,
    start: { dateTime: session.starts_at },
    end: { dateTime: session.ends_at || session.starts_at },
  }
  const url = session.google_event_id
    ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${session.google_event_id}`
    : 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
  const res = await fetch(url, {
    method: session.google_event_id ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${live.access_token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'notiox-frontdesk/1.0',
    },
    body: JSON.stringify(event),
  })
  const json = (await res.json()) as { id?: string; error?: { message?: string } }
  if (!res.ok) throw new Error(json.error?.message || 'Could not write Google Calendar event')
  return { eventId: json.id || null, connection: live }
}
