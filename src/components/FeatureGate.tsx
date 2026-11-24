import { useEffect, useState, type ReactNode } from 'react'
import { AppShell } from '~/components/AppShell'
import { useFrontdeskFeatures } from '~/components/FeaturesProvider'
import {
  FEATURE_LABELS,
  type FrontdeskFeatureKey,
} from '~/lib/frontdesk-features'
import { env } from '~/lib/env'
import { getAccessToken } from '~/lib/session'
import { getSupabaseBrowser } from '~/lib/supabase.browser'

/**
 * Keeps the route/nav reachable. When the feature is OFF, shows a locked
 * blurred panel instead of a 404. Children mount only when the feature is ON.
 */
export function FeatureGate({
  feature,
  children,
}: {
  feature: FrontdeskFeatureKey
  children: ReactNode
}) {
  const features = useFrontdeskFeatures()

  useEffect(() => {
    if (features.status === 'idle') void features.reload()
  }, [features.status, features.reload])

  if (features.status === 'idle' || features.status === 'loading') {
    return (
      <AppShell>
        <p style={{ color: 'var(--nx-muted)' }}>Checking access…</p>
      </AppShell>
    )
  }

  if (!features.isEnabled(feature)) {
    return (
      <AppShell>
        <LockedFeaturePanel feature={feature} />
      </AppShell>
    )
  }

  return <>{children}</>
}

function LockedFeaturePanel({ feature }: { feature: FrontdeskFeatureKey }) {
  const label = FEATURE_LABELS[feature]
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState(
    `Please enable ${label} on my Front Desk account.`,
  )
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const formUrl = env.contactAdminFormUrl()

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setFeedback(null)
    try {
      await submitFeatureRequest(feature, message)
      if (formUrl) {
        openContactForm(formUrl, feature, message)
      }
      setFeedback(
        formUrl
          ? 'Request sent. Opening the contact form as well.'
          : 'Request sent to admin. You will see this unlock after approval.',
      )
      setOpen(false)
    } catch (err) {
      if (formUrl) {
        openContactForm(formUrl, feature, message)
        setFeedback(
          err instanceof Error
            ? `${err.message} Opened the contact form instead.`
            : 'Opened the contact form.',
        )
      } else {
        setFeedback(err instanceof Error ? err.message : 'Could not send request')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="nx-lock-wrap nx-animate-in">
      <div className="nx-lock-blur" aria-hidden>
        <div className="nx-panel" style={{ marginBottom: '0.75rem' }}>
          <h2 className="nx-panel-title font-display">{label}</h2>
          <p className="nx-panel-muted">
            Sample charts, lists, and controls stay behind the lock until admin
            enables this feature for your account.
          </p>
          <div className="nx-lock-skeleton">
            <span />
            <span />
            <span />
          </div>
        </div>
        <div className="nx-panel">
          <div className="nx-lock-skeleton">
            <span />
            <span />
          </div>
        </div>
      </div>

      <div className="nx-lock-overlay">
        <div className="nx-lock-card">
          <div className="nx-lock-icon" aria-hidden>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <rect
                x="5"
                y="11"
                width="14"
                height="10"
                rx="2"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M8 11V8a4 4 0 0 1 8 0v3"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <h1 className="font-display" style={{ margin: '0 0 0.35rem', fontSize: '1.35rem' }}>
            Locked — contact admin
          </h1>
          <p style={{ margin: '0 0 1rem', color: 'var(--nx-muted)', fontSize: '0.92rem' }}>
            <strong>{label}</strong> is turned off for your Front Desk. Ask admin
            to enable it.
          </p>

          {!open ? (
            <div className="nx-page-actions" style={{ justifyContent: 'center' }}>
              <button type="button" className="nx-btn nx-btn-primary" onClick={() => setOpen(true)}>
                Contact to Admin
              </button>
              {formUrl ? (
                <button
                  type="button"
                  className="nx-btn nx-btn-ghost"
                  onClick={() => openContactForm(formUrl, feature, message)}
                >
                  Open contact form
                </button>
              ) : null}
            </div>
          ) : (
            <form onSubmit={onSubmit} className="nx-lock-form">
              <label className="nx-label" htmlFor={`nx-feature-msg-${feature}`}>
                Message
              </label>
              <textarea
                id={`nx-feature-msg-${feature}`}
                className="nx-input"
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={2000}
                required
              />
              <div className="nx-page-actions" style={{ marginTop: '0.75rem' }}>
                <button type="submit" className="nx-btn nx-btn-primary" disabled={busy}>
                  {busy ? 'Sending…' : 'Send request'}
                </button>
                <button
                  type="button"
                  className="nx-btn nx-btn-ghost"
                  disabled={busy}
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {feedback ? (
            <p className="nx-callout" style={{ marginTop: '1rem', textAlign: 'left' }}>
              {feedback}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

async function submitFeatureRequest(featureKey: FrontdeskFeatureKey, message: string) {
  const trimmed = message.trim()
  if (!trimmed) throw new Error('Message required')
  const token = await getAccessToken()
  if (!token) throw new Error('Sign in required')

  const adminBase = env.backOfficeUrl()
  try {
    const res = await fetch(`${adminBase}/api/frontdesk/feature-request`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ feature_key: featureKey, message: trimmed }),
    })
    if (res.ok) return
    const body = await res.text().catch(() => '')
    if (res.status !== 0 && res.status < 500) {
      throw new Error(body || `Request failed (${res.status})`)
    }
  } catch (err) {
    // Network / CORS / 5xx → try RPC fallback below unless it was a 4xx we already threw
    if (err instanceof Error && /failed \(\d{3}\)|Message required|Sign in/i.test(err.message)) {
      // 4xx from API — still try RPC as alternate path per contract
    }
  }

  const sb = getSupabaseBrowser()
  if (!sb) throw new Error('Supabase is not configured')
  const { error } = await sb.rpc('submit_frontdesk_feature_request', {
    p_feature_key: featureKey,
    p_message: trimmed,
  })
  if (error) throw new Error(error.message)
}

function openContactForm(formUrl: string, featureKey: FrontdeskFeatureKey, message: string) {
  try {
    const url = new URL(formUrl)
    url.searchParams.set('feature_key', featureKey)
    url.searchParams.set('message', message.slice(0, 500))
    window.open(url.toString(), '_blank', 'noopener,noreferrer')
  } catch {
    window.open(formUrl, '_blank', 'noopener,noreferrer')
  }
}
