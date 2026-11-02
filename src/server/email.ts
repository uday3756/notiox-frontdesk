import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { wrapCampaignHtml, type EmailMedia } from '~/lib/email-html'
import { env, hasSupabase } from '~/lib/env'
import { loadOwnerClients, resolveOwnerFromToken } from '~/server/owner-scope'
import { sendMailSmtp } from '~/server/smtp'

const mediaInput = z.object({
  imageUrl: z.string().optional(),
  videoUrl: z.string().optional(),
  linkUrl: z.string().optional(),
  linkLabel: z.string().optional(),
})

const campaignInput = z.object({
  accessToken: z.string().min(10),
  subject: z.string().min(1),
  bodyHtml: z.string().min(1),
  bodyText: z.string().optional(),
  extraContent: z.string().optional(),
  recipientMode: z.enum(['all', 'selected']),
  recipientClientIds: z.array(z.string()).default([]),
  testToEmail: z.string().email().optional(),
  media: mediaInput.optional(),
})

function compose(data: z.infer<typeof campaignInput>, brand: string, sampleName?: string) {
  const filled = sampleName
    ? data.bodyHtml.replace(/\{\{\s*name\s*\}\}/gi, sampleName)
    : data.bodyHtml
  return wrapCampaignHtml({
    brand,
    subject: data.subject,
    bodyHtml: filled,
    extraContent: data.extraContent,
    media: data.media as EmailMedia | undefined,
  })
}

export const testSendCampaign = createServerFn({ method: 'POST' })
  .validator(campaignInput)
  .handler(async ({ data }) => {
    if (!hasSupabase()) throw new Error('Supabase is not configured')
    const ctx = await resolveOwnerFromToken(data.accessToken)

    const to = data.testToEmail || env.smtpTestTo()
    if (!to) {
      return {
        ok: false as const,
        error: 'Provide a test email (or set SMTP_TEST_TO).',
      }
    }
    const brand = ctx.owner.brand_name || ctx.owner.full_name || 'Front Desk'
    const html = compose(data, brand, 'there')
    const result = await sendMailSmtp({
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
    const chosen =
      data.recipientMode === 'all'
        ? clients.filter((c) => c.status === 'active')
        : clients.filter((c) => data.recipientClientIds.includes(c.id))

    const recipients = chosen.map((c) => c.email).filter((e): e is string => Boolean(e))
    if (!recipients.length) {
      return { ok: false as const, error: 'No recipients selected (need client emails).' }
    }

    const brand = ctx.owner.brand_name || ctx.owner.full_name || 'Front Desk'
    const html = compose(data, brand)
    const result = await sendMailSmtp({
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
