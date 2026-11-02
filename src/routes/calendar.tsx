import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback, useState } from 'react'
import { AppShell } from '~/components/AppShell'
import { useOwnerQuery } from '~/components/useOwnerQuery'
import { getAccessToken } from '~/lib/session'
import {
  disconnectGoogleCalendar,
  listCalendarBoard,
  startGoogleCalendar,
  testPlatformMail,
} from '~/server/catalog'

export const Route = createFileRoute('/calendar')({
  component: CalendarPage,
})

function CalendarPage() {
  const fetch = useCallback(
    (accessToken: string | undefined) => listCalendarBoard({ data: { accessToken } }),
    [],
  )
  const state = useOwnerQuery(fetch, { requireAuth: true })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [testTo, setTestTo] = useState('')

  if (state.status === 'loading') {
    return (
      <AppShell>
        <p style={{ color: 'var(--nx-muted)' }}>Loading calendar…</p>
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

  const { sessions, offerings, google, googleEvents } = state.data
  const offeringTitle = (id: string) => offerings.find((o) => o.id === id)?.title || 'Offering'

  return (
    <AppShell>
      <header className="nx-page-header nx-animate-in">
        <div>
          <h1 className="font-display">Calendar</h1>
          <p>Your class sessions and meetings, with an optional Google Calendar connection.</p>
        </div>
        <div className="nx-page-actions">
          <Link to="/offerings" className="nx-btn nx-btn-ghost">
            Offerings
          </Link>
        </div>
      </header>

      <section className="nx-panel nx-form-grid nx-animate-in" style={{ marginBottom: '1rem' }}>
        <h2 className="nx-panel-title">Google Calendar</h2>
        {google.connected ? (
          <p className="nx-panel-muted" style={{ margin: 0 }}>
            Connected{google.email ? ` as ${google.email}` : ''}. New sessions can sync when you save
            them.
          </p>
        ) : (
          <p className="nx-panel-muted" style={{ margin: 0 }}>
            Connect Google Calendar to see events here. Add this redirect in Google Cloud:{' '}
            <code>/auth/google-calendar</code>.
          </p>
        )}
        {google.error && <p>{google.error}</p>}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {!google.connected && (
            <button
              type="button"
              className="nx-btn nx-btn-primary"
              disabled={busy || !google.configured}
              onClick={async () => {
                setBusy(true)
                setMsg(null)
                try {
                  const accessToken = (await getAccessToken()) || undefined
                  const { url } = await startGoogleCalendar({ data: { accessToken } })
                  window.location.href = url
                } catch (err) {
                  setMsg(err instanceof Error ? err.message : 'Could not start Google login')
                  setBusy(false)
                }
              }}
            >
              Connect Google Calendar
            </button>
          )}
          {google.connected && (
            <button
              type="button"
              className="nx-btn nx-btn-ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  const accessToken = (await getAccessToken()) || undefined
                  await disconnectGoogleCalendar({ data: { accessToken } })
                  await state.reload()
                } catch (err) {
                  setMsg(err instanceof Error ? err.message : 'Disconnect failed')
                } finally {
                  setBusy(false)
                }
              }}
            >
              Disconnect
            </button>
          )}
        </div>
        {!google.configured && (
          <p className="nx-panel-muted">GOOGLE_CLIENT_ID is not set on the server yet.</p>
        )}
      </section>

      <section className="nx-panel nx-form-grid nx-animate-in" style={{ marginBottom: '1rem' }}>
        <h2 className="nx-panel-title">Test Resend mail</h2>
        <input
          className="nx-input"
          type="email"
          placeholder="you@gmail.com"
          value={testTo}
          onChange={(e) => setTestTo(e.target.value)}
        />
        <button
          type="button"
          className="nx-btn nx-btn-ghost"
          disabled={busy || !testTo.includes('@')}
          onClick={async () => {
            setBusy(true)
            setMsg(null)
            try {
              const accessToken = (await getAccessToken()) || undefined
              const result = await testPlatformMail({ data: { accessToken, to: testTo } })
              if (!result.ok) setMsg(result.error || 'Send failed')
              else if (result.demo) setMsg('Simulated — Resend key missing on this deployment.')
              else setMsg(`Sent. Check ${testTo} (id ${result.id || 'ok'}).`)
            } catch (err) {
              setMsg(err instanceof Error ? err.message : 'Send failed')
            } finally {
              setBusy(false)
            }
          }}
        >
          Send test
        </button>
        {msg && <p style={{ margin: 0 }}>{msg}</p>}
      </section>

      <div className="nx-split">
        <section className="nx-panel">
          <h2 className="nx-panel-title">Front Desk sessions</h2>
          {sessions.length === 0 ? (
            <p className="nx-panel-muted">No sessions yet. Create them under Offerings.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
              {sessions
                .slice()
                .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
                .map((s) => (
                  <li key={s.id} style={{ marginBottom: '0.45rem' }}>
                    <strong>{s.title}</strong> · {offeringTitle(s.offering_id)}
                    <div className="nx-panel-muted">{new Date(s.starts_at).toLocaleString()}</div>
                  </li>
                ))}
            </ul>
          )}
        </section>
        <section className="nx-panel">
          <h2 className="nx-panel-title">Google events</h2>
          {!google.connected ? (
            <p className="nx-panel-muted">Connect Google Calendar to list events.</p>
          ) : googleEvents.length === 0 ? (
            <p className="nx-panel-muted">No upcoming Google events in the next 60 days.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
              {googleEvents.map((e) => (
                <li key={e.id} style={{ marginBottom: '0.45rem' }}>
                  {e.summary}
                  <div className="nx-panel-muted">
                    {e.start ? new Date(e.start).toLocaleString() : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  )
}
