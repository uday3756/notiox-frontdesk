import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { AppShell } from '~/components/AppShell'
import { MissingKeysBanner } from '~/components/MissingKeysBanner'
import { useOwnerQuery } from '~/components/useOwnerQuery'
import { DNS_SETUP_STEPS } from '~/lib/hostAllowlist'
import { getAccessToken } from '~/lib/session'
import { ROLE_LABELS } from '~/lib/types'
import { getSettings, saveAppConnection, updateSettings } from '~/server/data'

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
})

function SettingsPage() {
  const fetchSettings = useCallback(
    (accessToken: string | undefined) => getSettings({ data: { accessToken } }),
    [],
  )
  const state = useOwnerQuery(fetchSettings, { requireAuth: true })
  const [fullName, setFullName] = useState('')
  const [brandName, setBrandName] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [country, setCountry] = useState('')
  const [timezone, setTimezone] = useState('')
  const [notes, setNotes] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [schoolDomain, setSchoolDomain] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (state.status === 'ready') {
      const { owner } = state.data
      const s = owner.settings || {}
      setFullName(owner.full_name || '')
      setBrandName(String(s.clinic_organization ?? owner.brand_name ?? ''))
      setSpecialty(String(s.specialty ?? ''))
      setCountry(String(s.country ?? ''))
      setTimezone(String(s.timezone ?? ''))
      setNotes(String(s.notes ?? ''))
      setSchoolDomain(state.data.app?.school_domain || '')
    }
  }, [state])

  async function onSave(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      const accessToken = (await getAccessToken()) || undefined
      await updateSettings({
        data: {
          accessToken,
          fullName,
          brandName,
          specialty,
          country,
          timezone,
          notes,
          newPassword: newPassword.trim() ? newPassword.trim() : undefined,
        },
      })
      setNewPassword('')
      setMsg('Saved to Supabase (doctors profile).')
      await state.reload()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  if (state.status === 'loading') {
    return (
      <AppShell>
        <p style={{ color: 'var(--nx-muted)' }}>Loading settings…</p>
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

  const { owner, allowedHosts, missingKeys } = state.data
  const mustChange = Boolean(owner.settings?.password_must_change)

  return (
    <AppShell>
      <MissingKeysBanner keys={missingKeys} />
      {mustChange && (
        <div className="nx-callout" style={{ marginBottom: '1rem' }}>
          <strong>Temporary password active</strong>
          Set a new password below to clear the back-office reset flag.
        </div>
      )}

      <header className="nx-page-header nx-animate-in">
        <div>
          <h1 className="font-display">Settings</h1>
          <p>
            {owner.full_name} · {owner.email} · {ROLE_LABELS[owner.role]}. Edits save directly to your
            Supabase <code>doctors</code> row.
          </p>
        </div>
      </header>

      <form
        className="nx-panel nx-form-grid nx-animate-in"
        onSubmit={onSave}
        style={{ maxWidth: 680, marginBottom: '1rem' }}
      >
        <h2 className="nx-panel-title">Owner profile (live Supabase)</h2>
        <div style={{ display: 'grid', gap: '0.85rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <div>
            <label className="nx-label" htmlFor="fullName">
              Full name
            </label>
            <input
              id="fullName"
              className="nx-input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="nx-label" htmlFor="brand">
              Clinic / organization
            </label>
            <input
              id="brand"
              className="nx-input"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
            />
          </div>
          <div>
            <label className="nx-label" htmlFor="specialty">
              Specialty / role
            </label>
            <input
              id="specialty"
              className="nx-input"
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              placeholder="clinical_psychologist, coach, adhd_trainer…"
            />
          </div>
          <div>
            <label className="nx-label" htmlFor="country">
              Country
            </label>
            <input
              id="country"
              className="nx-input"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            />
          </div>
          <div>
            <label className="nx-label" htmlFor="timezone">
              Timezone
            </label>
            <input
              id="timezone"
              className="nx-input"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            />
          </div>
          <div>
            <label className="nx-label" htmlFor="newPassword">
              New password (optional)
            </label>
            <input
              id="newPassword"
              className="nx-input"
              type="password"
              autoComplete="new-password"
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Leave blank to keep current"
            />
          </div>
        </div>
        <div>
          <label className="nx-label" htmlFor="notes">
            Notes / bio
          </label>
          <textarea
            id="notes"
            className="nx-textarea"
            style={{ minHeight: 80 }}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <button className="nx-btn nx-btn-primary" type="submit" disabled={busy}>
          Save profile
        </button>
        {msg && <p style={{ margin: 0 }}>{msg}</p>}
      </form>

      <section className="nx-panel nx-animate-in" style={{ maxWidth: 720, marginBottom: '1rem' }}>
        <h2 className="nx-panel-title">Connect student app</h2>
        <p className="nx-panel-muted">
          Back office still creates the owner email, password, and role. Here you share the{' '}
          <strong>virtual domain</strong> (current host) and an <strong>API key</strong> so the NotioX
          student app can plug into this owner. When you have a real school domain later, put it below.
        </p>
        <div className="nx-form-grid">
          <div>
            <label className="nx-label">Virtual domain (current host)</label>
            <input className="nx-input" readOnly value={state.data.virtualDomain} />
          </div>
          <div>
            <label className="nx-label" htmlFor="schoolDomain">
              School / clinic domain (optional, future)
            </label>
            <input
              id="schoolDomain"
              className="nx-input"
              placeholder="desk.yourschool.edu"
              value={schoolDomain}
              onChange={(e) => setSchoolDomain(e.target.value)}
            />
          </div>
          <div>
            <label className="nx-label">Owner API key (for the student app)</label>
            <input
              className="nx-input"
              readOnly
              value={state.data.app?.api_key || '(generate to create)'}
            />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <button
              type="button"
              className="nx-btn nx-btn-primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                setMsg(null)
                try {
                  const accessToken = (await getAccessToken()) || undefined
                  await saveAppConnection({
                    data: {
                      accessToken,
                      schoolDomain: schoolDomain || undefined,
                      rotateKey: !state.data.app?.api_key,
                    },
                  })
                  setMsg('App connection saved. Copy the API key into the student app.')
                  await state.reload()
                } catch (err) {
                  setMsg(err instanceof Error ? err.message : 'Save failed')
                } finally {
                  setBusy(false)
                }
              }}
            >
              {state.data.app?.api_key ? 'Save domain' : 'Generate API key'}
            </button>
            {state.data.app?.api_key && (
              <button
                type="button"
                className="nx-btn nx-btn-ghost"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  try {
                    const accessToken = (await getAccessToken()) || undefined
                    await saveAppConnection({
                      data: { accessToken, schoolDomain: schoolDomain || undefined, rotateKey: true },
                    })
                    setMsg('New API key generated. Update the student app.')
                    await state.reload()
                  } catch (err) {
                    setMsg(err instanceof Error ? err.message : 'Rotate failed')
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                Rotate key
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="nx-panel nx-animate-in-delay" style={{ maxWidth: 720, marginBottom: '1rem' }}>
        <h2 className="nx-panel-title">Custom domain DNS</h2>
        <ol style={{ margin: 0, paddingLeft: '1.15rem', display: 'grid', gap: '0.65rem' }}>
          {DNS_SETUP_STEPS.map((step) => (
            <li key={step.title}>
              <strong>{step.title}.</strong> {step.detail}
            </li>
          ))}
        </ol>
      </section>

      <section className="nx-panel" style={{ maxWidth: 720 }}>
        <h2 className="nx-panel-title">Host allow-list</h2>
        <ul style={{ margin: 0, paddingLeft: '1.15rem' }}>
          {allowedHosts.map((h) => (
            <li key={h}>
              <code>{h}</code>
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  )
}
