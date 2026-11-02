import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'
import { useOwnerQuery } from '~/components/useOwnerQuery'
import { EMAIL_TEMPLATE_STORAGE_KEY, wrapCampaignHtml } from '~/lib/email-html'
import { getAccessToken } from '~/lib/session'
import { getBootstrap } from '~/server/data'
import { generateEmailTemplate } from '~/server/email-ai'

export const Route = createFileRoute('/email/studio')({
  component: EmailStudioPage,
})

function EmailStudioPage() {
  const navigate = useNavigate()
  const fetchBoot = useCallback(async (accessToken: string | undefined) => {
    return getBootstrap({ data: { accessToken } })
  }, [])
  const state = useOwnerQuery(fetchBoot, { requireAuth: true })

  const [prompt, setPrompt] = useState(
    'Write a weekly check-in for ADHD coaching clients. Encourage one small win and invite them back to NotioX.',
  )
  const [tone, setTone] = useState<'warm' | 'professional' | 'brief' | 'celebratory'>('warm')
  const [imageUrl, setImageUrl] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [linkUrl, setLinkUrl] = useState('https://www.notiolive.com')
  const [linkLabel, setLinkLabel] = useState('Open NotioX')
  const [subject, setSubject] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<string | null>(null)
  const [previewWidth, setPreviewWidth] = useState<'desktop' | 'mobile'>('desktop')

  const brand =
    state.status === 'ready' ? state.data.owner.brand_name || 'NotioX Front Desk' : 'NotioX Front Desk'

  const previewHtml = useMemo(
    () =>
      wrapCampaignHtml({
        brand,
        subject: subject || 'Preview',
        bodyHtml: bodyHtml || '<p style="color:#64748b">Generate a template to preview it here.</p>',
        media: {
          imageUrl: imageUrl || undefined,
          videoUrl: videoUrl || undefined,
          linkUrl: linkUrl || undefined,
          linkLabel: linkLabel || undefined,
        },
      }),
    [brand, subject, bodyHtml, imageUrl, videoUrl, linkUrl, linkLabel],
  )

  async function onGenerate() {
    setBusy(true)
    setLog(null)
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) throw new Error('Sign in required')
      const result = await generateEmailTemplate({
        data: {
          accessToken,
          prompt,
          tone,
          imageUrl: imageUrl || undefined,
          videoUrl: videoUrl || undefined,
          linkUrl: linkUrl || undefined,
          linkLabel: linkLabel || undefined,
          brand,
        },
      })
      if (!result.ok) throw new Error('Generate failed')
      setSubject(result.subject)
      setBodyHtml(result.html)
      setLog(
        result.source === 'llm'
          ? 'AI wrote this HTML template. Edit anything, then use it in a campaign.'
          : result.warning
            ? `Studio fallback (${result.warning}). Add AI_API_KEY (Groq free) for full AI copy.`
            : 'Studio built a starter template. Add AI_API_KEY (Groq free) for generated copy.',
      )
    } catch (err) {
      setLog(err instanceof Error ? err.message : 'Generate failed')
    } finally {
      setBusy(false)
    }
  }

  function useInCampaign() {
    sessionStorage.setItem(
      EMAIL_TEMPLATE_STORAGE_KEY,
      JSON.stringify({
        subject,
        bodyHtml,
        imageUrl,
        videoUrl,
        linkUrl,
        linkLabel,
      }),
    )
    navigate({ to: '/email' })
  }

  if (state.status === 'loading') return <p style={{ color: 'var(--nx-muted)' }}>Loading…</p>
  if (state.status === 'error') return <div className="nx-callout">{state.message}</div>

  return (
    <div className="nx-split">
      <div className="nx-panel nx-form-grid nx-animate-in">
        <h2 className="nx-panel-title">AI Studio</h2>
        <p className="nx-panel-muted" style={{ margin: 0 }}>
          Describe the email. Attach an image, a video (YouTube plays as a tap-to-watch button in inboxes),
          and a hyperlink. AI returns HTML you can edit.
        </p>
        <div>
          <label className="nx-label" htmlFor="prompt">
            What should this email say?
          </label>
          <textarea
            id="prompt"
            className="nx-textarea"
            style={{ minHeight: 110 }}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>
        <div>
          <label className="nx-label" htmlFor="tone">
            Tone
          </label>
          <select
            id="tone"
            className="nx-select"
            value={tone}
            onChange={(e) => setTone(e.target.value as typeof tone)}
          >
            <option value="warm">Warm</option>
            <option value="professional">Professional</option>
            <option value="brief">Brief</option>
            <option value="celebratory">Celebratory</option>
          </select>
        </div>
        <div>
          <label className="nx-label" htmlFor="studioImage">
            Image URL
          </label>
          <input
            id="studioImage"
            className="nx-input"
            type="url"
            placeholder="https://…/photo.jpg"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
          />
        </div>
        <div>
          <label className="nx-label" htmlFor="studioVideo">
            Video URL
          </label>
          <input
            id="studioVideo"
            className="nx-input"
            type="url"
            placeholder="https://www.youtube.com/watch?v=…"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
          />
        </div>
        <div>
          <label className="nx-label" htmlFor="studioLink">
            Hyperlink
          </label>
          <input
            id="studioLink"
            className="nx-input"
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
          />
          <input
            className="nx-input"
            style={{ marginTop: '0.4rem' }}
            value={linkLabel}
            onChange={(e) => setLinkLabel(e.target.value)}
            placeholder="Button label"
          />
        </div>
        <div>
          <label className="nx-label" htmlFor="studioSubject">
            Subject (editable)
          </label>
          <input
            id="studioSubject"
            className="nx-input"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>
        <div>
          <label className="nx-label" htmlFor="studioHtml">
            HTML template
          </label>
          <textarea
            id="studioHtml"
            className="nx-textarea"
            style={{ minHeight: 160, fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.82rem' }}
            value={bodyHtml}
            onChange={(e) => setBodyHtml(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem' }}>
          <button
            className="nx-btn nx-btn-primary"
            type="button"
            disabled={busy || prompt.trim().length < 8}
            onClick={onGenerate}
          >
            {busy ? 'Generating…' : 'Generate with AI'}
          </button>
          <button
            className="nx-btn nx-btn-ghost"
            type="button"
            disabled={!bodyHtml}
            onClick={useInCampaign}
          >
            Use in campaign
          </button>
        </div>
        {log && <p style={{ margin: 0, fontSize: '0.92rem' }}>{log}</p>}
      </div>

      <div className="nx-panel nx-animate-in-delay" style={{ display: 'grid', gap: '0.75rem', alignContent: 'start' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="nx-panel-title" style={{ marginBottom: 0 }}>
            Template preview
          </h2>
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            <button
              type="button"
              className={previewWidth === 'desktop' ? 'nx-chip nx-chip-active' : 'nx-chip'}
              onClick={() => setPreviewWidth('desktop')}
            >
              Desktop
            </button>
            <button
              type="button"
              className={previewWidth === 'mobile' ? 'nx-chip nx-chip-active' : 'nx-chip'}
              onClick={() => setPreviewWidth('mobile')}
            >
              Mobile
            </button>
          </div>
        </div>
        <iframe
          title="Studio preview"
          srcDoc={previewHtml}
          sandbox=""
          style={{
            width: previewWidth === 'mobile' ? '340px' : '100%',
            maxWidth: '100%',
            height: '520px',
            border: '1px solid var(--nx-line)',
            borderRadius: '0.5rem',
            background: '#fff',
            justifySelf: previewWidth === 'mobile' ? 'center' : 'stretch',
          }}
        />
      </div>
    </div>
  )
}
