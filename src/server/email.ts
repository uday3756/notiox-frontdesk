import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { env, hasSupabase } from '~/lib/env'
import { loadOwnerClients, resolveOwnerFromToken } from '~/server/owner-scope'

const campaignInput = z.object({
  accessToken: z.string().min(10),
  subject: z.string().min(1),
  bodyHtml: z.string().min(1),
  bodyText: z.string().optional(),
  extraContent: z.string().optional(),
  recipientMode: z.enum(['all', 'selected']),
  recipientClientIds: z.array(z.string()).default([]),
  testToEmail: z.string().email().optional(),
})

async function sendWithResend(opts: {
  to: string | string[]
  subject: string
  html: string
  text?: string
}): Promise<{ ok: boolean; id?: string; error?: string; demo?: boolean }> {
  const apiKey = env.resendApiKey()
  if (!apiKey) {
    return {
      ok: true,
      demo: true,
      id: `sim_${Date.now()}`,
      error: 'RESEND_API_KEY missing — simulated send only',
    }
  }

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)
    const result = await resend.emails.send({
      from: env.resendFrom(),
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    })
    if (result.error) {
      return { ok: false, error: result.error.message }
    }
    return { ok: true, id: result.data?.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Send failed' }
  }
}

function composeHtml(bodyHtml: string, extraContent?: string) {
  if (!extraContent?.trim()) return bodyHtml
  return `${bodyHtml}<hr style="margin:24px 0;border:none;border-top:1px solid #c5d0e0"/><div>${extraContent}</div>`
}

export const testSendCampaign = createServerFn({ method: 'POST' })
  .validator(campaignInput)
  .handler(async ({ data }) => {
    if (!hasSupabase()) throw new Error('Supabase is not configured')
    await resolveOwnerFromToken(data.accessToken)

    const to = data.testToEmail || env.resendTestTo()
    if (!to) {
      return {
        ok: false as const,
        error: 'Provide testToEmail or set RESEND_TEST_TO_EMAIL',
      }
    }
    const html = composeHtml(data.bodyHtml, data.extraContent)
    const result = await sendWithResend({
      to,
      subject: `[TEST] ${data.subject}`,
      html,
      text: data.bodyText,
    })

    return {
      ...result,
      campaignId: `camp_${Date.now()}`,
      testedTo: to,
    }
  })

export const sendCampaign = createServerFn({ method: 'POST' })
  .validator(
    campaignInput.extend({
      campaignId: z.string().optional(),
      requireTestFirst: z.boolean().default(true),
      tested: z.boolean().default(false),
    }),
  )
  .handler(async ({ data }) => {
    if (!hasSupabase()) throw new Error('Supabase is not configured')
    const ctx = await resolveOwnerFromToken(data.accessToken)
    if (data.requireTestFirst && !data.tested && !data.campaignId) {
      return {
        ok: false as const,
        error: 'Run a TEST send before sending to clients.',
      }
    }

    const clients = await loadOwnerClients(ctx.doctor.id, data.accessToken)
    const recipients =
      data.recipientMode === 'all'
        ? clients.filter((c) => c.status === 'active').map((c) => c.email)
        : clients.filter((c) => data.recipientClientIds.includes(c.id)).map((c) => c.email)

    if (!recipients.length) {
      return { ok: false as const, error: 'No recipients selected.' }
    }

    const html = composeHtml(data.bodyHtml, data.extraContent)
    const result = await sendWithResend({
      to: recipients,
      subject: data.subject,
      html,
      text: data.bodyText,
    })

    return {
      ...result,
      campaignId: data.campaignId || `camp_${Date.now()}`,
      recipientCount: recipients.length,
    }
  })
