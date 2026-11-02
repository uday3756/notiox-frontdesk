import nodemailer from 'nodemailer'
import { env } from '~/lib/env'

export type SmtpSendResult = {
  ok: boolean
  id?: string
  error?: string
  demo?: boolean
  sent?: number
  skipped?: number
}

function smtpReady() {
  return Boolean(env.smtpHost() && env.smtpUser() && env.smtpPass())
}

function transporter() {
  const port = env.smtpPort()
  return nodemailer.createTransport({
    host: env.smtpHost(),
    port,
    secure: env.smtpSecure() || port === 465,
    auth: {
      user: env.smtpUser(),
      pass: env.smtpPass(),
    },
  })
}

/**
 * Open-source SMTP send (Nodemailer — same model as bulk-mail-cli:
 * each owner/clinic uses their own mailbox, no per-email SaaS fee).
 */
export async function sendMailSmtp(opts: {
  to: string | string[]
  subject: string
  html: string
  text?: string
}): Promise<SmtpSendResult> {
  const recipients = (Array.isArray(opts.to) ? opts.to : [opts.to])
    .map((e) => e.trim())
    .filter((e) => e.includes('@'))

  if (!recipients.length) {
    return { ok: false, error: 'No valid recipient emails' }
  }

  if (!smtpReady()) {
    return {
      ok: true,
      demo: true,
      id: `sim_${Date.now()}`,
      sent: 0,
      skipped: recipients.length,
      error: 'SMTP not configured — simulated send. Add SMTP_HOST / SMTP_USER / SMTP_PASS (Gmail app password or clinic mailbox).',
    }
  }

  const from = env.smtpFrom() || env.smtpUser()!
  const mailer = transporter()
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
