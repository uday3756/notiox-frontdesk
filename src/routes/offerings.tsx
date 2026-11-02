import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback, useState } from 'react'
import { AppShell } from '~/components/AppShell'
import { useOwnerQuery } from '~/components/useOwnerQuery'
import { audienceLabels } from '~/lib/audience'
import { getAccessToken } from '~/lib/session'
import type { OfferingKind } from '~/lib/types'
import {
  deleteOffering,
  deleteSection,
  deleteSession,
  listOfferings,
  upsertOffering,
  upsertSection,
  upsertSession,
} from '~/server/catalog'

export const Route = createFileRoute('/offerings')({
  component: OfferingsPage,
})

function OfferingsPage() {
  const fetch = useCallback(
    (accessToken: string | undefined) => listOfferings({ data: { accessToken } }),
    [],
  )
  const state = useOwnerQuery(fetch, { requireAuth: true })
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [kind, setKind] = useState<OfferingKind>('class')
  const [editId, setEditId] = useState<string | null>(null)
  const [sectionTitle, setSectionTitle] = useState('')
  const [sessionTitle, setSessionTitle] = useState('')
  const [sessionStart, setSessionStart] = useState('')
  const [sessionEnd, setSessionEnd] = useState('')
  const [sessionLocation, setSessionLocation] = useState('')
  const [activeOffering, setActiveOffering] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const people = audienceLabels(undefined)

  async function saveOffering(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      const accessToken = (await getAccessToken()) || undefined
      const result = await upsertOffering({
        data: {
          accessToken,
          id: editId || undefined,
          title,
          description: description || undefined,
          kind,
        },
      })
      setTitle('')
      setDescription('')
      setEditId(null)
      setActiveOffering(result.offering.id)
      setMsg(`Saved. Share link: ${result.url}`)
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
        <p style={{ color: 'var(--nx-muted)' }}>Loading offerings…</p>
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

  const { offerings, sections, sessions, links } = state.data
  const linkMap = new Map(links.map((l) => [l.offeringId, l.url]))
  const current = offerings.find((o) => o.id === activeOffering) || offerings[0] || null
  const currentId = current?.id || null
  const currentSections = sections.filter((s) => s.offering_id === currentId)
  const currentSessions = sessions.filter((s) => s.offering_id === currentId)

  return (
    <AppShell peopleLabel={people.titlePlural}>
      <header className="nx-page-header nx-animate-in">
        <div>
          <h1 className="font-display">Offerings</h1>
          <p>
            Classes, programs, meetings, and sessions. Each offering has a share link you can attach
            in Email.
          </p>
        </div>
        <div className="nx-page-actions">
          <Link to="/calendar" className="nx-btn nx-btn-ghost">
            Calendar
          </Link>
          <Link to="/email/studio" className="nx-btn nx-btn-primary">
            Attach in mail
          </Link>
        </div>
      </header>
      {msg && <p className="nx-panel-muted">{msg}</p>}

      <div className="nx-split">
        <form className="nx-panel nx-form-grid nx-animate-in" onSubmit={saveOffering}>
          <h2 className="nx-panel-title">{editId ? 'Update offering' : 'New offering'}</h2>
          <div>
            <label className="nx-label" htmlFor="offTitle">
              Title
            </label>
            <input
              id="offTitle"
              className="nx-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="nx-label" htmlFor="offKind">
              Kind
            </label>
            <select
              id="offKind"
              className="nx-select"
              value={kind}
              onChange={(e) => setKind(e.target.value as OfferingKind)}
            >
              <option value="class">Class</option>
              <option value="program">Program</option>
              <option value="meeting">Meeting</option>
              <option value="session">Session</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="nx-label" htmlFor="offDesc">
              Description
            </label>
            <textarea
              id="offDesc"
              className="nx-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <button className="nx-btn nx-btn-primary" type="submit" disabled={busy || !title.trim()}>
            {editId ? 'Update' : 'Create'}
          </button>
        </form>

        <div className="nx-panel nx-animate-in-delay">
          <h2 className="nx-panel-title">Your offerings</h2>
          {offerings.length === 0 ? (
            <p className="nx-panel-muted">None yet. Create a class or meeting on the left.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'grid', gap: '0.55rem' }}>
              {offerings.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    className="nx-btn nx-btn-ghost"
                    onClick={() => setActiveOffering(o.id)}
                  >
                    {o.title}
                  </button>
                  <span className="nx-panel-muted"> · {o.kind}</span>
                  <button
                    type="button"
                    className="nx-btn nx-btn-ghost"
                    onClick={() => {
                      setEditId(o.id)
                      setTitle(o.title)
                      setDescription(o.description || '')
                      setKind(o.kind)
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="nx-btn nx-btn-ghost"
                    disabled={busy}
                    onClick={async () => {
                      if (!confirm(`Remove “${o.title}”?`)) return
                      setBusy(true)
                      try {
                        const accessToken = (await getAccessToken()) || undefined
                        await deleteOffering({ data: { accessToken, id: o.id } })
                        if (activeOffering === o.id) setActiveOffering(null)
                        await state.reload()
                      } catch (err) {
                        setMsg(err instanceof Error ? err.message : 'Delete failed')
                      } finally {
                        setBusy(false)
                      }
                    }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {current && (
        <section className="nx-panel nx-animate-in" style={{ marginTop: '1rem' }}>
          <h2 className="nx-panel-title">{current.title}</h2>
          <p className="nx-panel-muted">
            Share link:{' '}
            <a href={linkMap.get(current.id)} style={{ color: 'var(--nx-accent-deep)' }}>
              {linkMap.get(current.id)}
            </a>
          </p>
          <div className="nx-split">
            <form
              className="nx-form-grid"
              onSubmit={async (e) => {
                e.preventDefault()
                setBusy(true)
                try {
                  const accessToken = (await getAccessToken()) || undefined
                  await upsertSection({
                    data: {
                      accessToken,
                      offeringId: current.id,
                      title: sectionTitle,
                    },
                  })
                  setSectionTitle('')
                  await state.reload()
                } catch (err) {
                  setMsg(err instanceof Error ? err.message : 'Section failed')
                } finally {
                  setBusy(false)
                }
              }}
            >
              <h3 style={{ margin: 0 }}>Sections</h3>
              {currentSections.map((s) => (
                <div key={s.id} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <span>{s.title}</span>
                  <button
                    type="button"
                    className="nx-btn nx-btn-ghost"
                    onClick={async () => {
                      const accessToken = (await getAccessToken()) || undefined
                      await deleteSection({ data: { accessToken, id: s.id } })
                      await state.reload()
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <input
                className="nx-input"
                placeholder="New section"
                value={sectionTitle}
                onChange={(e) => setSectionTitle(e.target.value)}
              />
              <button className="nx-btn nx-btn-ghost" type="submit" disabled={busy || !sectionTitle.trim()}>
                Add section
              </button>
            </form>

            <form
              className="nx-form-grid"
              onSubmit={async (e) => {
                e.preventDefault()
                setBusy(true)
                try {
                  const accessToken = (await getAccessToken()) || undefined
                  const result = await upsertSession({
                    data: {
                      accessToken,
                      offeringId: current.id,
                      sectionId: activeSection || undefined,
                      title: sessionTitle,
                      startsAt: new Date(sessionStart).toISOString(),
                      endsAt: sessionEnd ? new Date(sessionEnd).toISOString() : undefined,
                      location: sessionLocation || undefined,
                      syncGoogle: true,
                    },
                  })
                  setSessionTitle('')
                  setMsg(`Session saved. Link: ${result.url}`)
                  await state.reload()
                } catch (err) {
                  setMsg(err instanceof Error ? err.message : 'Session failed')
                } finally {
                  setBusy(false)
                }
              }}
            >
              <h3 style={{ margin: 0 }}>Sessions / meetings</h3>
              {currentSessions.map((s) => (
                <div key={s.id} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span>
                    {s.title} · {new Date(s.starts_at).toLocaleString()}
                  </span>
                  <button
                    type="button"
                    className="nx-btn nx-btn-ghost"
                    onClick={async () => {
                      const accessToken = (await getAccessToken()) || undefined
                      await deleteSession({ data: { accessToken, id: s.id } })
                      await state.reload()
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <input
                className="nx-input"
                placeholder="Session title"
                value={sessionTitle}
                onChange={(e) => setSessionTitle(e.target.value)}
                required
              />
              <select
                className="nx-select"
                value={activeSection}
                onChange={(e) => setActiveSection(e.target.value)}
              >
                <option value="">No section</option>
                {currentSections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
              <input
                className="nx-input"
                type="datetime-local"
                value={sessionStart}
                onChange={(e) => setSessionStart(e.target.value)}
                required
              />
              <input
                className="nx-input"
                type="datetime-local"
                value={sessionEnd}
                onChange={(e) => setSessionEnd(e.target.value)}
              />
              <input
                className="nx-input"
                placeholder="Location or room"
                value={sessionLocation}
                onChange={(e) => setSessionLocation(e.target.value)}
              />
              <button className="nx-btn nx-btn-primary" type="submit" disabled={busy || !sessionTitle.trim() || !sessionStart}>
                Add session
              </button>
            </form>
          </div>
        </section>
      )}
    </AppShell>
  )
}
