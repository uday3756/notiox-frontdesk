import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { AppShell } from '~/components/AppShell'
import { MissingKeysBanner } from '~/components/MissingKeysBanner'
import { useOwnerQuery } from '~/components/useOwnerQuery'
import { AUDIENCE_PRESET_OPTIONS, audienceLabels } from '~/lib/audience'
import { DNS_SETUP_STEPS } from '~/lib/hostAllowlist'
import { getAccessToken } from '~/lib/session'
import type { AudienceKind } from '~/lib/types'
import { ROLE_LABELS } from '~/lib/types'
import {
  getSettings,
  saveAppConnection,
  saveAudienceSettings,
  saveSmtpSettings,
  updateSettings,
} from '~/server/data'

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
  const [smtpHost, setSmtpHost] = useState('smtp.gmail.com')
  const [smtpPort, setSmtpPort] = useState('587')
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpPass, setSmtpPass] = useState('')
  const [smtpFrom, setSmtpFrom] = useState('')
  const [smtpTestTo, setSmtpTestTo] = useState('')
  const [smtpHasPass, setSmtpHasPass] = useState(false)
  const [smtpConfigured, setSmtpConfigured] = useState(false)
  const [audienceKind, setAudienceKind] = useState<AudienceKind>('client')
  const [audienceSingular, setAudienceSingular] = useState('')
  const [audiencePlural, setAudiencePlural] = useState('')
  const [audienceMsg, setAudienceMsg] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [smtpMsg, setSmtpMsg] = useState<string | null>(null)
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
      const smtp = state.data.smtp
      setSmtpHost(smtp?.host || 'smtp.gmail.com')
      setSmtpPort(String(smtp?.port || 587))
      setSmtpUser(smtp?.user || owner.email || '')
      setSmtpFrom(smtp?.from || (owner.email ? `Front Desk <${owner.email}>` : ''))
      setSmtpHasPass(Boolean(smtp?.hasPass))
      setSmtpConfigured(Boolean(smtp?.configured))
      setSmtpPass('')
      if (!smtpTestTo) setSmtpTestTo(owner.email || '')
      const audience = state.data.audience
      setAudienceKind(audience?.kind || 'client')
      setAudienceSingular(audience?.singular || '')
      setAudiencePlural(audience?.plural || '')
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
  const people = audienceLabels(state.data.audience)

  return (
    <AppShell peopleLabel={people.titlePlural}>
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

      <section className="nx-panel nx-form-grid nx-animate-in" style={{ maxWidth: 720, marginBottom: '1rem' }}>
        <h2 className="nx-panel-title">How you refer to people</h2>
        <p className="nx-panel-muted" style={{ margin: 0 }}>
          Used lightly in navigation and progress views — patient, student, client, or your own words.
        </p>
        <div>
          <label className="nx-label" htmlFor="audienceKind">
            Wording
          </label>
          <select
            id="audienceKind"
            className="nx-select"
            value={audienceKind}
            onChange={(e) => setAudienceKind(e.target.value as AudienceKind)}
          >
            {AUDIENCE_PRESET_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        {audienceKind === 'custom' && (
          <div style={{ display: 'grid', gap: '0.85rem', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <div>
              <label className="nx-label" htmlFor="audienceSingular">
                Singular
              </label>
              <input
                id="audienceSingular"
                className="nx-input"
                value={audienceSingular}
                onChange={(e) => setAudienceSingular(e.target.value)}
                placeholder="client"
              />
            </div>
            <div>
              <label className="nx-label" htmlFor="audiencePlural">
                Plural
              </label>
              <input
                id="audiencePlural"
                className="nx-input"
                value={audiencePlural}
                onChange={(e) => setAudiencePlural(e.target.value)}
                placeholder="clients"
              />
            </div>
          </div>
        )}
        <button
          type="button"
          className="nx-btn nx-btn-ghost"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setAudienceMsg(null)
            try {
              const accessToken = (await getAccessToken()) || undefined
              await saveAudienceSettings({
                data: {
                  accessToken,
                  kind: audienceKind,
                  singular: audienceSingular || undefined,
                  plural: audiencePlural || undefined,
                },
              })
              setAudienceMsg('Saved. Labels will refresh across the console.')
              await state.reload()
            } catch (err) {
              setAudienceMsg(err instanceof Error ? err.message : 'Save failed')
            } finally {
              setBusy(false)
            }
          }}
        >
          Save wording
        </button>
        {audienceMsg && <p style={{ margin: 0 }}>{audienceMsg}</p>}
      </section>

      <section className="nx-panel nx-form-grid nx-animate-in" style={{ maxWidth: 720, marginBottom: '1rem' }}>
        <h2 className="nx-panel-title">Mailbox (SMTP)</h2>
        <p className="nx-panel-muted" style={{ margin: 0 }}>
          Each owner sends from their own Gmail or clinic mailbox. Use a{' '}
          <strong>Gmail app password</strong>, not your normal Gmail password. Saved on your owner
          record — never shown back after save.
        </p>
        <div style={{ display: 'grid', gap: '0.85rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <div>
            <label className="nx-label" htmlFor="smtpUser">
              SMTP user (full Gmail address)
            </label>
            <input
              id="smtpUser"
              className="nx-input"
              type="email"
              autoComplete="off"
              value={smtpUser}
              onChange={(e) => setSmtpUser(e.target.value)}
              placeholder="you@gmail.com"
            />
          </div>
          <div>
            <label className="nx-label" htmlFor="smtpPass">
              App password
            </label>
            <input
              id="smtpPass"
              className="nx-input"
              type="password"
              autoComplete="new-password"
              value={smtpPass}
              onChange={(e) => setSmtpPass(e.target.value)}
              placeholder={smtpHasPass ? 'Saved — leave blank to keep' : '16-character app password'}
            />
          </div>
          <div>
            <label className="nx-label" htmlFor="smtpFrom">
              From
            </label>
            <input
              id="smtpFrom"
              className="nx-input"
              value={smtpFrom}
              onChange={(e) => setSmtpFrom(e.target.value)}
              placeholder="Front Desk <you@gmail.com>"
            />
          </div>
          <div>
            <label className="nx-label" htmlFor="smtpHost">
              Host
            </label>
            <input
              id="smtpHost"
              className="nx-input"
              value={smtpHost}
              onChange={(e) => setSmtpHost(e.target.value)}
              placeholder="smtp.gmail.com"
            />
          </div>
          <div>
            <label className="nx-label" htmlFor="smtpPort">
              Port
            </label>
            <input
              id="smtpPort"
              className="nx-input"
              inputMode="numeric"
              value={smtpPort}
              onChange={(e) => setSmtpPort(e.target.value)}
              placeholder="587"
            />
          </div>
          <div>
            <label className="nx-label" htmlFor="smtpTestTo">
              Send a test to (optional)
            </label>
            <input
              id="smtpTestTo"
              className="nx-input"
              type="email"
              value={smtpTestTo}
              onChange={(e) => setSmtpTestTo(e.target.value)}
            />
          </div>
        </div>
        <p className="nx-panel-muted" style={{ margin: 0, fontSize: '0.85rem' }}>
          Gmail: Google Account → Security → 2-Step Verification → App passwords. Host{' '}
          <code>smtp.gmail.com</code>, port <code>587</code>.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
          <button
            type="button"
            className="nx-btn nx-btn-primary"
            disabled={busy || !smtpUser.trim()}
            onClick={async () => {
              setBusy(true)
              setSmtpMsg(null)
              try {
                if (!smtpPass.trim() && !smtpHasPass) {
                  throw new Error('Paste your Gmail app password (16 characters). Leave blank only when updating other fields after a save.')
                }
                const accessToken = (await getAccessToken()) || undefined
                const result = await saveSmtpSettings({
                  data: {
                    accessToken,
                    host: smtpHost.trim() || 'smtp.gmail.com',
                    port: Number(smtpPort) || 587,
                    user: smtpUser.trim(),
                    pass: smtpPass.trim() || undefined,
                    from: smtpFrom.trim() || undefined,
                    testTo: smtpTestTo.trim() || undefined,
                  },
                })
                setSmtpPass('')
                setSmtpHasPass(Boolean(result.smtp.hasPass))
                setSmtpConfigured(Boolean(result.smtp.configured))
                if (result.test) {
                  if (!result.test.ok) {
                    setSmtpMsg(result.test.error || 'Mailbox saved, but test send failed')
                  } else if (result.test.demo) {
                    setSmtpMsg('Mailbox saved, but send was simulated — check host, user, and app password.')
                  } else {
                    setSmtpMsg(`Mailbox saved. Test delivered to ${smtpTestTo}.`)
                  }
                } else {
                  setSmtpMsg('Mailbox saved. AI Studio test and bulk send will use this account.')
                }
                await state.reload()
              } catch (err) {
                setSmtpMsg(err instanceof Error ? err.message : 'SMTP save failed')
              } finally {
                setBusy(false)
              }
            }}
          >
            {smtpConfigured ? 'Update mailbox' : 'Save mailbox'}
          </button>
          {smtpConfigured && (
            <button
              type="button"
              className="nx-btn nx-btn-ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                setSmtpMsg(null)
                try {
                  const accessToken = (await getAccessToken()) || undefined
                  await saveSmtpSettings({ data: { accessToken, clear: true } })
                  setSmtpPass('')
                  setSmtpHasPass(false)
                  setSmtpConfigured(false)
                  setSmtpMsg('Mailbox cleared. Campaigns will simulate until you save again.')
                  await state.reload()
                } catch (err) {
                  setSmtpMsg(err instanceof Error ? err.message : 'Clear failed')
                } finally {
                  setBusy(false)
                }
              }}
            >
              Clear mailbox
            </button>
          )}
          {smtpConfigured && (
            <span className="nx-panel-muted" style={{ fontSize: '0.85rem' }}>
              Connected{smtpHasPass ? ' · password saved' : ''}
            </span>
          )}
        </div>
        {smtpMsg && <p style={{ margin: 0 }}>{smtpMsg}</p>}
      </section>

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
