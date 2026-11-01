import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { getSupabaseBrowser } from '~/lib/supabase.browser'

export const Route = createFileRoute('/auth/callback')({
  ssr: false,
  component: AuthCallbackPage,
})

function AuthCallbackPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function finish() {
      const supabase = getSupabaseBrowser()
      if (!supabase) {
        navigate({ to: '/dashboard' })
        return
      }
      const { error: err } = await supabase.auth.exchangeCodeForSession(window.location.href)
      if (cancelled) return
      if (err) {
        const { data } = await supabase.auth.getSession()
        if (data.session) {
          navigate({ to: '/dashboard' })
          return
        }
        setError(err.message)
        return
      }
      navigate({ to: '/dashboard' })
    }
    void finish()
    return () => {
      cancelled = true
    }
  }, [navigate])

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '2rem' }}>
      <div className="nx-panel">
        <h1 className="font-display" style={{ marginTop: 0 }}>
          Completing sign-in…
        </h1>
        {error ? (
          <p style={{ color: 'var(--nx-coral)' }}>{error}</p>
        ) : (
          <p style={{ color: 'var(--nx-muted)' }}>Finishing email auth redirect.</p>
        )}
      </div>
    </div>
  )
}
