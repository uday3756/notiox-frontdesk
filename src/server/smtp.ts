import nodemailer from 'nodemailer'
import { env } from '~/lib/env'
import type { OwnerSmtpConfig } from '~/lib/types'

export type SmtpSendResult = {
  ok: boolean
  id?: string
  error?: string
  demo?: boolean
  sent?: number
  skipped?: number
}

function sanitizePass(pass: string) {
  return pass.replace(/\s+/g, '')
}

export function smtpConfigured(cfg?: OwnerSmtpConfig | null) {
  return Boolean(cfg?.host && cfg?.user && cfg?.pass)
}

export function publicSmtp(cfg?: OwnerSmtpConfig | null) {
  const host = cfg?.host || 'smtp.gmail.com'
  const port = cfg?.port || 587
  const user = cfg?.user || ''
  const from = cfg?.from || ''
  const hasPass = Boolean(cfg?.pass)
  return {
    host,
    port,
    secure: Boolean(cfg?.secure) || port === 465,
    user,
    from,
    hasPass,
    configured: Boolean(host && user && hasPass),
  }
}

function envSmtp(): OwnerSmtpConfig | null {
  const host = env.smtpHost()
  const user = env.smtpUser()
  const pass = env.smtpPass()
  if (!host || !user || !pass) return null
  const port = env.smtpPort()
  return {
    host,
    port,
    secure: env.smtpSecure() || port === 465,
    user,
    pass,
    from: env.smtpFrom() || user,
  }
}

function resolveAccount(override?: OwnerSmtpConfig | null): OwnerSmtpConfig | null {
  if (smtpConfigured(override)) return override!
  return envSmtp()
}

function transporter(cfg: OwnerSmtpConfig) {
  const port = cfg.port || 587
  return nodemailer.createTransport({
    host: cfg.host,
    port,
    secure: cfg.secure || port === 465,
    auth: {
      user: cfg.user,
      pass: sanitizePass(cfg.pass),
    },
  })
}

/**
 * Open-source SMTP send (Nodemailer). Prefers the signed-in owner's
 * Settings mailbox, then project env, otherwise a simulated send.
 */
export async function sendMailSmtp(opts: {
  to: string | string[]
  subject: string
  html: string
  text?: string
  smtp?: OwnerSmtpConfig | null
}): Promise<SmtpSendResult> {
  const recipients = (Array.isArray(opts.to) ? opts.to : [opts.to])
    .map((e) => e.trim())
    .filter((e) => e.includes('@'))

  if (!recipients.length) {
    return { ok: false, error: 'No valid recipient emails' }
  }

  const account = resolveAccount(opts.smtp)
  if (!account) {
    return {
      ok: true,
      demo: true,
      id: `sim_${Date.now()}`,
      sent: 0,
      skipped: recipients.length,
      error:
        'SMTP not configured — simulated send. Save your Gmail/clinic mailbox in Settings (SMTP user, app password, from).',
    }
  }

  const from = account.from || account.user
  const mailer = transporter(account)
  let sent = 0
  const ids: string[] = []

  try {
    for (const to of recipients) {
      const info = await mailer.sendMail({
        from,
        to,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      })
      sent += 1
      if (info.messageId) ids.push(info.messageId)
      if (recipients.length > 1) await new Promise((r) => setTimeout(r, 180))
    }
    return { ok: true, id: ids[0], sent, skipped: recipients.length - sent }
  } catch (e) {
    return {
      ok: false,
      sent,
      error: e instanceof Error ? e.message : 'SMTP send failed',
    }
  }
}

export function normalizeSmtpInput(input: {
  host?: string
  port?: number
  secure?: boolean
  user: string
  pass?: string
  from?: string
  existing?: OwnerSmtpConfig | null
}): OwnerSmtpConfig {
  const user = input.user.trim()
  const host = (input.host || input.existing?.host || 'smtp.gmail.com').trim()
  const port = Number(input.port || input.existing?.port || 587) || 587
  const passRaw = (input.pass || '').trim()
  const pass = sanitizePass(passRaw) || input.existing?.pass || ''
  const from =
    (input.from || '').trim() ||
    input.existing?.from ||
    (user ? `Front Desk <${user}>` : '')
  return {
    host,
    port,
    secure: Boolean(input.secure) || port === 465,
    user,
    pass,
    from,
  }
}
