import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { getSupabaseBrowser } from '~/lib/supabase.browser'
import { hasSupabase } from '~/lib/env'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const supabaseReady = hasSupabase()

  async function onEmailAuth(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)

    const supabase = getSupabaseBrowser()
    if (!supabase) {
      setMessage('Supabase is not configured.')
      setBusy(false)
      return
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      navigate({ to: '/dashboard' })
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="nx-login-screen">
      <section className="nx-login-hero nx-animate-in">
        <div
          style={{
            fontSize: '0.8rem',
            fontWeight: 650,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#99f6e4',
          }}
        >
          Owner console
        </div>
        <h1 className="font-display">NotioX Front Desk</h1>
        <p>
          Back office creates your owner account (name, role, code, password). You sign in here and
          only see your own clients.
        </p>
      </section>

      <section className="nx-login-panel">
        <div className="nx-panel nx-login-card nx-animate-in-delay">
          <h2 className="font-display" style={{ margin: '0 0 0.35rem', fontSize: '1.35rem' }}>
            Owner sign in
          </h2>
          <p style={{ margin: '0 0 1.1rem', color: 'var(--nx-muted)', fontSize: '0.92rem' }}>
            Use the email and password issued by back office. Self-signup is disabled.
          </p>

          {!supabaseReady && (
            <div className="nx-callout" style={{ marginBottom: '1rem' }}>
              Supabase is not linked yet.
            </div>
          )}

          <form onSubmit={onEmailAuth} className="nx-form-grid">
            <div>
              <label className="nx-label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                className="nx-input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="nx-label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                className="nx-input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <button className="nx-btn nx-btn-primary" type="submit" disabled={busy || !supabaseReady}>
              Sign in
            </button>
          </form>

          {message && (
            <p style={{ marginTop: '0.85rem', color: 'var(--nx-slate)', fontSize: '0.9rem' }}>
              {message}
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
