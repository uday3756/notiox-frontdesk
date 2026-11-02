/** Safe-ish URL for email HTML attributes */
export function safeUrl(value: string | undefined | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!/^https?:\/\//i.test(trimmed)) return null
  return trimmed.replace(/"/g, '%22')
}

export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtu.be')) return u.pathname.replace('/', '') || null
    if (u.hostname.includes('youtube.com')) return u.searchParams.get('v')
    return null
  } catch {
    return null
  }
}

export function videoPoster(videoUrl: string): string | null {
  const id = youtubeId(videoUrl)
  if (id) return `https://img.youtube.com/vi/${id}/hqdefault.jpg`
  return null
}

export type EmailMedia = {
  imageUrl?: string
  videoUrl?: string
  linkUrl?: string
  linkLabel?: string
}

export function mediaBlocksHtml(media: EmailMedia): string {
  const parts: string[] = []
  const image = safeUrl(media.imageUrl)
  const video = safeUrl(media.videoUrl)
  const link = safeUrl(media.linkUrl)
  const label = (media.linkLabel || 'Open link').trim()

  if (image) {
    parts.push(
      `<p style="margin:16px 0"><img src="${image}" alt="" width="520" style="display:block;width:100%;max-width:520px;height:auto;border-radius:12px;border:0"/></p>`,
    )
  }

  if (video) {
    const poster = videoPoster(video)
    parts.push(`<p style="margin:16px 0;text-align:center">
      <a href="${video}" style="display:block;text-decoration:none;color:#0f766e">
        ${
          poster
            ? `<img src="${poster}" alt="Watch video" width="520" style="display:block;width:100%;max-width:520px;height:auto;border-radius:12px;border:0"/>`
            : ''
        }
        <span style="display:inline-block;margin-top:10px;padding:10px 16px;background:#0f766e;color:#fff;border-radius:999px;font-weight:650;font-size:14px">▶ Watch video</span>
      </a>
    </p>`)
  }

  if (link) {
    parts.push(`<p style="margin:20px 0;text-align:center">
      <a href="${link}" style="display:inline-block;background:#115e59;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:700;font-size:15px">${escapeHtml(label)}</a>
    </p>`)
  }

  return parts.join('\n')
}

export function wrapCampaignHtml(opts: {
  brand: string
  subject: string
  bodyHtml: string
  extraContent?: string
  media?: EmailMedia
}): string {
  const extra = opts.extraContent?.trim()
    ? `<hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb"/><div style="color:#475569;font-size:14px">${opts.extraContent}</div>`
    : ''
  const media = mediaBlocksHtml(opts.media || {})
  return `<!doctype html>
<html>
<body style="margin:0;padding:20px;font-family:-apple-system,Segoe UI,sans-serif;background:#f8fafc;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:24px">
    <div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#0f766e;margin-bottom:8px">${escapeHtml(opts.brand)}</div>
    <div style="font-size:13px;color:#64748b;margin-bottom:16px">Subject: <strong style="color:#0f172a">${escapeHtml(opts.subject || '(no subject)')}</strong></div>
    <div>${opts.bodyHtml}</div>
    ${media}
    ${extra}
  </div>
</body>
</html>`
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export const EMAIL_TEMPLATE_STORAGE_KEY = 'nx-frontdesk-email-template'
