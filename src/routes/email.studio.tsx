import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOwnerQuery } from '~/components/useOwnerQuery'
import { EMAIL_TEMPLATE_STORAGE_KEY, wrapCampaignHtml } from '~/lib/email-html'
import { getAccessToken } from '~/lib/session'
import { getBootstrap, listClients } from '~/server/data'
import { sendCampaign, testSendCampaign } from '~/server/email'
import { generateEmailTemplate } from '~/server/email-ai'

export const Route = createFileRoute('/email/studio')({
  component: EmailStudioPage,
})

function parseExtraEmails(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
}

function EmailStudioPage() {
  const navigate = useNavigate()
  const fetchPage = useCallback(async (accessToken: string | undefined) => {
    const [boot, clients] = await Promise.all([
      getBootstrap({ data: { accessToken } }),
      listClients({ data: { accessToken } }),
    ])
    return { boot, ...clients }
  }, [])
  const state = useOwnerQuery(fetchPage, { requireAuth: true })

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
  const [testTo, setTestTo] = useState('')
  const [recipientMode, setRecipientMode] = useState<'all' | 'selected'>('selected')
  const [selected, setSelected] = useState<string[]>([])
  const [extraEmails, setExtraEmails] = useState('')
  const [tested, setTested] = useState(false)
  const [campaignId, setCampaignId] = useState<string | undefined>()

  const brand =
    state.status === 'ready' ? state.data.boot.owner.brand_name || 'NotioX Front Desk' : 'NotioX Front Desk'
  const ownerEmail = state.status === 'ready' ? state.data.boot.owner.email : ''
  const clients = state.status === 'ready' ? state.data.clients : []

  useEffect(() => {
    if (ownerEmail && !testTo) setTestTo(ownerEmail)
  }, [ownerEmail, testTo])

  const media = useMemo(
    () => ({
      imageUrl: imageUrl || undefined,
      videoUrl: videoUrl || undefined,
      linkUrl: linkUrl || undefined,
      linkLabel: linkLabel || undefined,
    }),
    [imageUrl, videoUrl, linkUrl, linkLabel],
  )

  const previewHtml = useMemo(
    () =>
      wrapCampaignHtml({
        brand,
        subject: subject || 'Preview',
        bodyHtml: bodyHtml || '<p style="color:#64748b">Generate a template to preview it here.</p>',
        media,
      }),
    [brand, subject, bodyHtml, media],
  )

  function dirty() {
    setTested(false)
  }

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
      setTested(false)
      setLog(
        result.source === 'llm'
          ? 'AI wrote this HTML. Send a test, then bulk to selected clients or extra emails.'
          : result.warning
            ? `Studio fallback (${result.warning}). You can still send a test / bulk from here.`
            : 'Starter template ready. Send a test, then bulk send.',
      )
    } catch (err) {
      setLog(err instanceof Error ? err.message : 'Generate failed')
    } finally {
      setBusy(false)
    }
  }

  function payload(accessToken: string) {
    return {
      accessToken,
      subject,
      bodyHtml,
      recipientMode,
      recipientClientIds: selected,
      extraEmails: parseExtraEmails(extraEmails),
      testToEmail: testTo || undefined,
      media,
    }
  }

  async function onTest() {
    setBusy(true)
    setLog(null)
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) throw new Error('Sign in required')
      if (!subject || !bodyHtml) throw new Error('Generate or paste a template first')
      const result = await testSendCampaign({ data: payload(accessToken) })
      if (!result.ok) {
        setLog(result.error || 'Test send failed')
        setTested(false)
      } else {
        setCampaignId(result.campaignId)
        setTested(true)
        setLog(
          result.demo
            ? `Test verified for ${result.testedTo} (simulated — platform mail not configured).`
            : `Test announcement sent to ${result.testedTo}. Bulk send unlocked.`,
        )
      }
    } catch (err) {
      setLog(err instanceof Error ? err.message : 'Test failed')
    } finally {
      setBusy(false)
    }
  }

  async function onBulk() {
    if (!tested) {
      setLog('Send a test announcement first.')
      return
    }
    setBusy(true)
    setLog(null)
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) throw new Error('Sign in required')
      const extras = parseExtraEmails(extraEmails)
      if (recipientMode === 'selected' && selected.length === 0 && extras.length === 0) {
        throw new Error('Select clients and/or add extra emails')
      }
      const result = await sendCampaign({
        data: {
          ...payload(accessToken),
          campaignId,
          requireTestFirst: true,
          tested: true,
        },
      })
      if (!result.ok) setLog(result.error || 'Bulk send failed')
      else {
        setLog(
          result.demo
            ? `Bulk simulated to ${result.recipientCount} address(es). Platform mail is not configured.`
            : `Bulk announcement sent to ${result.recipientCount} address(es).`,
        )
      }
    } catch (err) {
      setLog(err instanceof Error ? err.message : 'Send failed')
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

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
    dirty()
  }

  if (state.status === 'loading') return <p style={{ color: 'var(--nx-muted)' }}>Loading…</p>
  if (state.status === 'error') return <div className="nx-callout">{state.message}</div>

  const readyToSend = Boolean(subject && bodyHtml)

  return (
    <div className="nx-split">
      <div className="nx-panel nx-form-grid nx-animate-in">
        <h2 className="nx-panel-title">AI Studio</h2>
        <p className="nx-panel-muted" style={{ margin: 0 }}>
          Generate HTML, then send a test announcement and bulk mail to selected clients or extra
          emails — without leaving Studio.
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
            onChange={(e) => {
              setImageUrl(e.target.value)
              dirty()
            }}
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
            onChange={(e) => {
              setVideoUrl(e.target.value)
              dirty()
            }}
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
            onChange={(e) => {
              setLinkUrl(e.target.value)
              dirty()
            }}
          />
          <input
            className="nx-input"
            style={{ marginTop: '0.4rem' }}
            value={linkLabel}
            onChange={(e) => {
              setLinkLabel(e.target.value)
              dirty()
            }}
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
            onChange={(e) => {
              setSubject(e.target.value)
              dirty()
            }}
          />
        </div>
        <div>
          <label className="nx-label" htmlFor="studioHtml">
            HTML template
          </label>
          <textarea
            id="studioHtml"
            className="nx-textarea"
            style={{ minHeight: 140, fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.82rem' }}
            value={bodyHtml}
            onChange={(e) => {
              setBodyHtml(e.target.value)
              dirty()
            }}
          />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem' }}>
          <button
            className="nx-btn nx-btn-primary"
            type="button"
            disabled={busy || prompt.trim().length < 8}
            onClick={onGenerate}
          >
            {busy ? 'Working…' : 'Generate with AI'}
          </button>
          <button className="nx-btn nx-btn-ghost" type="button" disabled={!bodyHtml} onClick={useInCampaign}>
            Open in Campaigns
          </button>
        </div>

        <h2 className="nx-panel-title" style={{ marginTop: '0.5rem' }}>
          Send from Studio
        </h2>
        <p className="nx-panel-muted" style={{ margin: 0 }}>
          Sends from Front Desk (<code>no-reply@notiolive.com</code>). You can still save a personal
          mailbox in <Link to="/settings">Settings</Link> later.
        </p>
        <div>
          <label className="nx-label" htmlFor="studioTestTo">
            1. Test announcement (known email)
          </label>
          <input
            id="studioTestTo"
            className="nx-input"
            type="email"
            value={testTo}
            onChange={(e) => {
              setTestTo(e.target.value)
              dirty()
            }}
            placeholder="you@clinic.com"
          />
        </div>
        <div>
          <label className="nx-label" htmlFor="studioMode">
            2. Bulk recipients
          </label>
          <select
            id="studioMode"
            className="nx-select"
            value={recipientMode}
            onChange={(e) => {
              setRecipientMode(e.target.value as 'all' | 'selected')
              dirty()
            }}
          >
            <option value="selected">Selected clients</option>
            <option value="all">All active clients</option>
          </select>
        </div>
        {recipientMode === 'selected' && (
          <div style={{ display: 'grid', gap: '0.35rem' }}>
            {clients.length === 0 ? (
              <p className="nx-panel-muted" style={{ margin: 0 }}>
                No linked clients yet — use extra emails below.
              </p>
            ) : (
              clients.map((c) => (
                <label key={c.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} />
                  {c.full_name || c.email}{' '}
                  <span style={{ color: 'var(--nx-muted)', fontSize: '0.8rem' }}>{c.email}</span>
                </label>
              ))
            )}
          </div>
        )}
        <div>
          <label className="nx-label" htmlFor="studioExtra">
            Extra emails (optional, comma or line separated)
          </label>
          <textarea
            id="studioExtra"
            className="nx-textarea"
            style={{ minHeight: 64 }}
            placeholder="parent@school.edu, nurse@clinic.org"
            value={extraEmails}
            onChange={(e) => {
              setExtraEmails(e.target.value)
              dirty()
            }}
          />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem' }}>
          <button
            className="nx-btn nx-btn-ghost"
            type="button"
            disabled={busy || !readyToSend || !testTo}
            onClick={onTest}
          >
            Send test announcement
          </button>
          <button className="nx-btn nx-btn-primary" type="button" disabled={busy || !tested} onClick={onBulk}>
            Bulk send
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
