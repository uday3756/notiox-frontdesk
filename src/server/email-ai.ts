import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { escapeHtml } from '~/lib/email-html'
import { env, hasSupabase } from '~/lib/env'
import { resolveOwnerFromToken } from '~/server/owner-scope'

const input = z.object({
  accessToken: z.string().min(10),
  prompt: z.string().min(8),
  tone: z.enum(['warm', 'professional', 'brief', 'celebratory']).default('warm'),
  imageUrl: z.string().optional(),
  videoUrl: z.string().optional(),
  linkUrl: z.string().optional(),
  linkLabel: z.string().optional(),
  brand: z.string().optional(),
})

function localTemplate(data: z.infer<typeof input>, brand: string) {
  const toneLine =
    data.tone === 'professional'
      ? 'I wanted to share a concise update from your program.'
      : data.tone === 'brief'
        ? 'A short note for you:'
        : data.tone === 'celebratory'
          ? 'A quick cheer from your team — you are doing great work.'
          : 'Hope you are taking care of yourself this week.'

  const body = escapeHtml(data.prompt.trim()).replace(/\n/g, '<br/>')
  const html = `<h2 style="margin:0 0 12px;font-size:22px">Hi {{name}},</h2>
<p style="margin:0 0 12px;line-height:1.6">${toneLine}</p>
<p style="margin:0 0 12px;line-height:1.6">${body}</p>
<p style="margin:16px 0 0;color:#475569;font-size:14px">— ${escapeHtml(brand)}</p>`

  const subject =
    data.tone === 'celebratory'
      ? `A note of progress from ${brand}`
      : `A note from ${brand}`

  return { subject, html, source: 'local' as const }
}

async function llmTemplate(data: z.infer<typeof input>, brand: string) {
  const apiKey = env.aiApiKey()
  const apiUrl = env.aiApiUrl()
  const model = env.aiModel()
  if (!apiKey || !apiUrl) return null

  const system = `You write HTML email templates for coaches, clinicians, and clinics.
Return ONLY valid JSON: {"subject":"...","html":"..."}.
Rules:
- Use inline CSS only. No scripts.
- Start with <h2>Hi {{name}},</h2>
- Keep it under 180 words.
- Tone: ${data.tone}
- Brand: ${brand}
- Do not add the image, video, or CTA button — those are injected separately.
- Do not invent tracking pixels or extra domains.`

  const user = JSON.stringify({
    brief: data.prompt,
    imageUrl: data.imageUrl || null,
    videoUrl: data.videoUrl || null,
    linkUrl: data.linkUrl || null,
    linkLabel: data.linkLabel || 'Open link',
  })

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.5,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`AI provider error (${res.status}): ${text.slice(0, 180)}`)
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const content = json.choices?.[0]?.message?.content || ''
  const match = content.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('AI did not return JSON')
  const parsed = JSON.parse(match[0]) as { subject?: string; html?: string }
  if (!parsed.html) throw new Error('AI JSON missing html')
  return {
    subject: parsed.subject || `A note from ${brand}`,
    html: parsed.html,
    source: 'llm' as const,
  }
}

export const generateEmailTemplate = createServerFn({ method: 'POST' })
  .validator(input)
  .handler(async ({ data }) => {
    if (!hasSupabase()) throw new Error('Supabase is not configured')
    const ctx = await resolveOwnerFromToken(data.accessToken)
    const brand = data.brand || ctx.owner.brand_name || ctx.owner.full_name || 'Front Desk'

    try {
      const llm = await llmTemplate(data, brand)
      if (llm) return { ok: true as const, ...llm }
    } catch (e) {
      const local = localTemplate(data, brand)
      return {
        ok: true as const,
        ...local,
        warning: e instanceof Error ? e.message : 'AI provider failed; used studio fallback',
      }
    }

    return { ok: true as const, ...localTemplate(data, brand) }
  })
