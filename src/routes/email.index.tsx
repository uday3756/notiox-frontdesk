import { Link, createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOwnerQuery } from '~/components/useOwnerQuery'
import { EMAIL_TEMPLATE_STORAGE_KEY, wrapCampaignHtml } from '~/lib/email-html'
import { getAccessToken } from '~/lib/session'
import { listOfferings } from '~/server/catalog'
import { getBootstrap, listClients } from '~/server/data'
import { sendCampaign, testSendCampaign } from '~/server/email'

export const Route = createFileRoute('/email/')({
  component: EmailCampaignsPage,
})

function EmailCampaignsPage() {
  const fetchPage = useCallback(async (accessToken: string | undefined) => {
    const [clients, boot, offerings] = await Promise.all([
      listClients({ data: { accessToken } }),
      getBootstrap({ data: { accessToken } }),
      listOfferings({ data: { accessToken } }),
    ])
    return { ...clients, boot, offerings }
  }, [])
  const state = useOwnerQuery(fetchPage, { requireAuth: true })
  const [subject, setSubject] = useState('Weekly check-in from your coach')
  const [bodyHtml, setBodyHtml] = useState(
    '<h2>Hi {{name}},</h2><p>Quick check-in from your Front Desk. How did this week go on NotioX?</p>',
  )
  const [extraContent, setExtraContent] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [linkLabel, setLinkLabel] = useState('Open link')
  const [recipientMode, setRecipientMode] = useState<'all' | 'selected'>('selected')
  const [selected, setSelected] = useState<string[]>([])
  const [testTo, setTestTo] = useState('')
  const [previewWidth, setPreviewWidth] = useState<'desktop' | 'mobile'>('desktop')
  const [campaignId, setCampaignId] = useState<string | undefined>()
  const [tested, setTested] = useState(false)
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<string | null>(null)

  const clients = state.status === 'ready' ? state.data.clients : []
  const ownerEmail = state.status === 'ready' ? state.data.boot.owner.email : ''
  const ownerBrand =
    state.status === 'ready' ? state.data.boot.owner.brand_name || 'NotioX Front Desk' : 'NotioX Front Desk'

  useEffect(() => {
    if (ownerEmail && !testTo) setTestTo(ownerEmail)
  }, [ownerEmail, testTo])

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(EMAIL_TEMPLATE_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as {
        subject?: string
        bodyHtml?: string
        extraContent?: string
        imageUrl?: string
        videoUrl?: string
        linkUrl?: string
        linkLabel?: string
      }
      if (parsed.subject) setSubject(parsed.subject)
      if (parsed.bodyHtml) setBodyHtml(parsed.bodyHtml)
      if (parsed.extraContent) setExtraContent(parsed.extraContent)
      if (parsed.imageUrl) setImageUrl(parsed.imageUrl)
      if (parsed.videoUrl) setVideoUrl(parsed.videoUrl)
      if (parsed.linkUrl) setLinkUrl(parsed.linkUrl)
      if (parsed.linkLabel) setLinkLabel(parsed.linkLabel)
      sessionStorage.removeItem(EMAIL_TEMPLATE_STORAGE_KEY)
      setTested(false)
      setLog('Loaded template from AI Studio.')
    } catch {
      /* ignore */
    }
  }, [])

  const sampleName = clients[0]?.full_name || clients[0]?.email?.split('@')[0] || 'Client'
  const media = useMemo(
    () => ({
      imageUrl: imageUrl || undefined,
      videoUrl: videoUrl || undefined,
      linkUrl: linkUrl || undefined,
      linkLabel: linkLabel || undefined,
    }),
    [imageUrl, videoUrl, linkUrl, linkLabel],
  )

  const previewHtml = useMemo(() => {
    const filled = bodyHtml.replace(/\{\{\s*name\s*\}\}/gi, sampleName)
    return wrapCampaignHtml({
      brand: ownerBrand,
      subject,
      bodyHtml: filled,
      extraContent,
      media,
    })
  }, [bodyHtml, extraContent, media, ownerBrand, sampleName, subject])

  const payloadBase = useMemo(
    () => ({
      subject,
      bodyHtml,
      extraContent: extraContent || undefined,
      recipientMode,
      recipientClientIds: selected,
      testToEmail: testTo || undefined,
      media,
    }),
    [subject, bodyHtml, extraContent, recipientMode, selected, testTo, media],
  )

  function markDirty<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v)
      setTested(false)
    }
  }

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function onTest() {
    setBusy(true)
    setLog(null)
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) throw new Error('Sign in required')
      const result = await testSendCampaign({ data: { ...payloadBase, accessToken } })
      if (!result.ok) {
        setLog(result.error || 'Test send failed')
        setTested(false)
      } else {
        setCampaignId(result.campaignId)
        setTested(true)
        setLog(
          result.demo
            ? `Test verified for ${result.testedTo} (simulated — platform mail not configured).`
            : `Test sent to ${result.testedTo}. Real send unlocked.`,
        )
      }
    } catch (err) {
      setLog(err instanceof Error ? err.message : 'Test failed')
    } finally {
      setBusy(false)
    }
  }

  async function onSend() {
    if (!tested) {
      setLog('Send a test to a known address first.')
      return
    }
    setBusy(true)
    setLog(null)
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) throw new Error('Sign in required')
      const result = await sendCampaign({
        data: {
          ...payloadBase,
          accessToken,
          campaignId,
          requireTestFirst: true,
          tested: true,
        },
      })
      if (!result.ok) setLog(result.error || 'Send failed')
      else {
        setLog(
          result.demo
            ? `Send simulated to ${result.recipientCount} client(s). Platform mail is not configured.`
            : `Sent to ${result.recipientCount} client(s).`,
        )
      }
    } catch (err) {
      setLog(err instanceof Error ? err.message : 'Send failed')
    } finally {
      setBusy(false)
    }
  }

  if (state.status === 'loading') {
    return <p style={{ color: 'var(--nx-muted)' }}>Loading…</p>
  }
  if (state.status === 'error') {
    return <div className="nx-callout">{state.message}</div>
  }

  return (
    <div className="nx-split">
      <div className="nx-panel nx-form-grid nx-animate-in">
        <h2 className="nx-panel-title">Campaign</h2>
        <p className="nx-panel-muted" style={{ margin: 0 }}>
          Build the HTML in <Link to="/email/studio">AI Studio</Link>, or edit here. Sends from{' '}
          <strong>no-reply@notiolive.com</strong> (Resend). Optional personal mailbox is in{' '}
          <Link to="/settings">Settings</Link>.
        </p>
        <div>
          <label className="nx-label" htmlFor="subject">
            Subject
          </label>
          <input
            id="subject"
            className="nx-input"
            value={subject}
            onChange={(e) => markDirty(setSubject)(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="nx-label" htmlFor="body">
            Body (HTML · {'{{name}}'})
          </label>
          <textarea
            id="body"
            className="nx-textarea"
            style={{ minHeight: 140 }}
            value={bodyHtml}
            onChange={(e) => markDirty(setBodyHtml)(e.target.value)}
          />
        </div>
        <div>
          <label className="nx-label" htmlFor="imageUrl">
            Image URL
          </label>
          <input
            id="imageUrl"
            className="nx-input"
            type="url"
            placeholder="https://…"
            value={imageUrl}
            onChange={(e) => markDirty(setImageUrl)(e.target.value)}
          />
        </div>
        <div>
          <label className="nx-label" htmlFor="videoUrl">
            Video URL (YouTube or file)
          </label>
          <input
            id="videoUrl"
            className="nx-input"
            type="url"
            placeholder="https://youtube.com/watch?v=…"
            value={videoUrl}
            onChange={(e) => markDirty(setVideoUrl)(e.target.value)}
          />
        </div>
        <div>
          <label className="nx-label" htmlFor="linkUrl">
            Hyperlink
          </label>
          <input
            id="linkUrl"
            className="nx-input"
            type="url"
            placeholder="https://www.notiolive.com"
            value={linkUrl}
            onChange={(e) => markDirty(setLinkUrl)(e.target.value)}
          />
          <input
            className="nx-input"
            style={{ marginTop: '0.4rem' }}
            placeholder="Button label"
            value={linkLabel}
            onChange={(e) => markDirty(setLinkLabel)(e.target.value)}
          />
          {state.status === 'ready' && state.data.offerings.offerings.length > 0 && (
            <select
              className="nx-select"
              style={{ marginTop: '0.4rem' }}
              defaultValue=""
              onChange={(e) => {
                const val = e.target.value
                if (!val) return
                const [kind, id] = val.split(':', 2)
                const pack = state.data.offerings
                if (kind === 'offering') {
                  const link = pack.links.find((l) => l.offeringId === id)
                  const off = pack.offerings.find((o) => o.id === id)
                  if (link) {
                    markDirty(setLinkUrl)(link.url)
                    markDirty(setLinkLabel)(off ? `Open ${off.title}` : 'Open offering')
                  }
                }
                if (kind === 'session') {
                  const sess = pack.sessions.find((s) => s.id === id)
                  const off = sess ? pack.offerings.find((o) => o.id === sess.offering_id) : undefined
                  const link = off ? pack.links.find((l) => l.offeringId === off.id) : undefined
                  if (link && sess) {
                    markDirty(setLinkUrl)(`${link.url}#session-${sess.id}`)
                    markDirty(setLinkLabel)(sess.title)
                  }
                }
              }}
            >
              <option value="">Attach an offering or session…</option>
              {state.data.offerings.offerings.map((o) => (
                <option key={o.id} value={`offering:${o.id}`}>
                  Offering · {o.title}
                </option>
              ))}
              {state.data.offerings.sessions.map((s) => {
                const off = state.data.offerings.offerings.find((o) => o.id === s.offering_id)
                return (
                  <option key={s.id} value={`session:${s.id}`}>
                    Session · {off?.title || 'Offering'} · {s.title}
                  </option>
                )
              })}
            </select>
          )}
        </div>
        <div>
          <label className="nx-label" htmlFor="extra">
            Extra content (optional)
          </label>
          <textarea
            id="extra"
            className="nx-textarea"
            style={{ minHeight: 64 }}
            value={extraContent}
            onChange={(e) => markDirty(setExtraContent)(e.target.value)}
          />
        </div>

        <div>
          <label className="nx-label" htmlFor="testTo">
            1. Send test to known email first
          </label>
          <input
            id="testTo"
            className="nx-input"
            type="email"
            value={testTo}
            onChange={(e) => markDirty(setTestTo)(e.target.value)}
            placeholder="known-test@example.com"
          />
        </div>

        <div>
          <label className="nx-label" htmlFor="mode">
            2. Real client recipients
          </label>
          <select
            id="mode"
            className="nx-select"
            value={recipientMode}
            onChange={(e) => setRecipientMode(e.target.value as 'all' | 'selected')}
          >
            <option value="selected">Selected clients</option>
            <option value="all">All active clients</option>
          </select>
        </div>
        {recipientMode === 'selected' && (
          <div style={{ display: 'grid', gap: '0.35rem' }}>
            {clients.length === 0 ? (
              <p className="nx-panel-muted" style={{ margin: 0 }}>
                No linked clients yet.
              </p>
            ) : (
              clients.map((c) => (
                <label key={c.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} />
                  {c.full_name || c.email}
                </label>
              ))
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem' }}>
          <button
            className="nx-btn nx-btn-ghost"
            type="button"
            disabled={busy || !subject || !bodyHtml || !testTo}
            onClick={onTest}
          >
            Send test
          </button>
          <button className="nx-btn nx-btn-primary" type="button" disabled={busy || !tested} onClick={onSend}>
            Send to clients
          </button>
        </div>
        {log && <p style={{ margin: 0, fontSize: '0.92rem' }}>{log}</p>}
      </div>

      <div className="nx-panel nx-animate-in-delay" style={{ display: 'grid', gap: '0.75rem', alignContent: 'start' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
          <h2 className="nx-panel-title" style={{ marginBottom: 0 }}>
            Live preview
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
        <div
          style={{
            display: 'grid',
            placeItems: 'center',
            background: '#eef2f6',
            borderRadius: '0.5rem',
            padding: '0.75rem',
          }}
        >
          <iframe
            title="Email live preview"
            srcDoc={previewHtml}
            sandbox=""
            style={{
              width: previewWidth === 'mobile' ? '340px' : '100%',
              maxWidth: '100%',
              height: '420px',
              border: '1px solid var(--nx-line)',
              borderRadius: '0.5rem',
              background: '#fff',
            }}
          />
        </div>
      </div>
    </div>
  )
}
