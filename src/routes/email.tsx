import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppShell } from '~/components/AppShell'
import { useOwnerQuery } from '~/components/useOwnerQuery'
import { getAccessToken } from '~/lib/session'
import { getBootstrap, listClients } from '~/server/data'
import { sendCampaign, testSendCampaign } from '~/server/email'

export const Route = createFileRoute('/email')({
  component: EmailPage,
})

function EmailPage() {
  const fetchPage = useCallback(async (accessToken: string | undefined) => {
    const [clients, boot] = await Promise.all([
      listClients({ data: { accessToken } }),
      getBootstrap({ data: { accessToken } }),
    ])
    return { ...clients, boot }
  }, [])
  const state = useOwnerQuery(fetchPage, { requireAuth: true })
  const [subject, setSubject] = useState('Weekly check-in from your coach')
  const [bodyHtml, setBodyHtml] = useState(
    '<h2>Hi {{name}},</h2><p>Quick check-in from your Front Desk. How did this week go on NotioX?</p>',
  )
  const [extraContent, setExtraContent] = useState('P.S. Reply anytime if you need to adjust your plan.')
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
  const ownerBrand = state.status === 'ready' ? state.data.boot.owner.brand_name || 'NotioX Front Desk' : 'NotioX Front Desk'

  useEffect(() => {
    if (ownerEmail && !testTo) setTestTo(ownerEmail)
  }, [ownerEmail, testTo])

  const sampleName = clients[0]?.full_name || clients[0]?.email?.split('@')[0] || 'Client'

  const previewHtml = useMemo(() => {
    const filled = bodyHtml.replace(/\{\{\s*name\s*\}\}/gi, sampleName)
    const extra = extraContent.trim()
      ? `<hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb"/><div style="color:#475569;font-size:14px">${extraContent}</div>`
      : ''
    return `<!doctype html><html><body style="margin:0;padding:20px;font-family:-apple-system,Segoe UI,sans-serif;background:#f8fafc;color:#0f172a">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:24px">
        <div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#0f766e;margin-bottom:8px">${ownerBrand}</div>
        <div style="font-size:13px;color:#64748b;margin-bottom:16px">Subject: <strong style="color:#0f172a">${subject || '(no subject)'}</strong></div>
        <div>${filled}</div>
        ${extra}
      </div>
    </body></html>`
  }, [bodyHtml, extraContent, ownerBrand, sampleName, subject])

  const payloadBase = useMemo(
    () => ({
      subject,
      bodyHtml,
      extraContent: extraContent || undefined,
      recipientMode,
      recipientClientIds: selected,
      testToEmail: testTo || undefined,
    }),
    [subject, bodyHtml, extraContent, recipientMode, selected, testTo],
  )

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
            ? `Test verified for known recipient ${result.testedTo} (simulated — Resend key later). Real send unlocked.`
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
            ? `Send simulated to ${result.recipientCount} client(s).`
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
    return (
      <AppShell>
        <p style={{ color: 'var(--nx-muted)' }}>Loading…</p>
      </AppShell>
    )
  }
  if (state.status === 'error') {
    return (
      <AppShell>
        <div className="nx-callout">{state.message}</div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <header className="nx-page-header nx-animate-in">
        <div>
          <h1 className="font-display">Email</h1>
          <p>
            Compose with live preview, send a test to a known email first, then send to your real
            clients.
          </p>
        </div>
      </header>

      <div className="nx-split">
        <div className="nx-panel nx-form-grid nx-animate-in">
          <h2 className="nx-panel-title">Compose</h2>
          <div>
            <label className="nx-label" htmlFor="subject">
              Subject
            </label>
            <input
              id="subject"
              className="nx-input"
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value)
                setTested(false)
              }}
              required
            />
          </div>
          <div>
            <label className="nx-label" htmlFor="body">
              Body (HTML · supports {'{{name}}'})
            </label>
            <textarea
              id="body"
              className="nx-textarea"
              style={{ minHeight: 150 }}
              value={bodyHtml}
              onChange={(e) => {
                setBodyHtml(e.target.value)
                setTested(false)
              }}
            />
          </div>
          <div>
            <label className="nx-label" htmlFor="extra">
              Extra content (optional)
            </label>
            <textarea
              id="extra"
              className="nx-textarea"
              style={{ minHeight: 72 }}
              value={extraContent}
              onChange={(e) => {
                setExtraContent(e.target.value)
                setTested(false)
              }}
            />
          </div>

          <div>
            <label className="nx-label" htmlFor="testTo">
              1. Send test to known email first
            </label>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
              {ownerEmail && (
                <button
                  type="button"
                  className="nx-chip"
                  onClick={() => {
                    setTestTo(ownerEmail)
                    setTested(false)
                  }}
                >
                  My email ({ownerEmail})
                </button>
              )}
            </div>
            <input
              id="testTo"
              className="nx-input"
              type="email"
              value={testTo}
              onChange={(e) => {
                setTestTo(e.target.value)
                setTested(false)
              }}
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
                    <input
                      type="checkbox"
                      checked={selected.includes(c.id)}
                      onChange={() => toggle(c.id)}
                    />
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
              Send test to known email
            </button>
            <button
              className="nx-btn nx-btn-primary"
              type="button"
              disabled={busy || !tested}
              onClick={onSend}
            >
              Send to real clients
            </button>
          </div>
          {log && <p style={{ margin: 0, fontSize: '0.92rem' }}>{log}</p>}
          {!tested && (
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--nx-muted)' }}>
              Real client send unlocks after you send a test to a known address.
            </p>
          )}
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
          <p className="nx-panel-muted" style={{ marginBottom: 0 }}>
            Updates as you type · previewing with <code>{sampleName}</code>.
          </p>
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
                height: '380px',
                border: '1px solid var(--nx-line)',
                borderRadius: '0.5rem',
                background: '#fff',
              }}
            />
          </div>
        </div>
      </div>
    </AppShell>
  )
}
