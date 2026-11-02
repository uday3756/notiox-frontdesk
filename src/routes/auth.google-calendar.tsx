import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { getAccessToken } from '~/lib/session'
import { finishGoogleCalendar } from '~/server/catalog'

export const Route = createFileRoute('/auth/google-calendar')({
  ssr: false,
  component: GoogleCalendarCallback,
})

function GoogleCalendarCallback() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')
    const err = params.get('error')
    if (err) {
      setError(err)
      return
    }
    if (!code || !state) {
      setError('Missing Google authorization code')
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const accessToken = await getAccessToken()
        if (!accessToken) throw new Error('Sign in to Front Desk first, then connect Google Calendar.')
        await finishGoogleCalendar({ data: { accessToken, code, state } })
        if (!cancelled) navigate({ to: '/calendar' })
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Google Calendar connect failed')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [navigate])

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '2rem' }}>
      <div className="nx-panel">
        <h1 className="font-display" style={{ marginTop: 0 }}>
          Connecting Google Calendar…
        </h1>
        {error ? <p>{error}</p> : <p className="nx-panel-muted">Finishing OAuth redirect.</p>}
      </div>
    </div>
  )
}
