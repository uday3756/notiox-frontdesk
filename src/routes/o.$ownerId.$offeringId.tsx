import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { getPublicOffering } from '~/server/catalog'

export const Route = createFileRoute('/o/$ownerId/$offeringId')({
  component: PublicOfferingPage,
})

function PublicOfferingPage() {
  const { ownerId, offeringId } = Route.useParams()
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [message, setMessage] = useState<string | null>(null)
  const [data, setData] = useState<Awaited<ReturnType<typeof getPublicOffering>> | null>(null)

  useEffect(() => {
    let cancelled = false
    getPublicOffering({ data: { ownerId, offeringId } })
      .then((row) => {
        if (cancelled) return
        setData(row)
        setStatus('ready')
      })
      .catch((err) => {
        if (cancelled) return
        setMessage(err instanceof Error ? err.message : 'Not found')
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [ownerId, offeringId])

  if (status === 'loading') {
    return (
      <main style={{ maxWidth: 640, margin: '2rem auto', padding: '0 1rem' }}>
        <p>Loading offering…</p>
      </main>
    )
  }
  if (status === 'error' || !data) {
    return (
      <main style={{ maxWidth: 640, margin: '2rem auto', padding: '0 1rem' }}>
        <h1>Offering unavailable</h1>
        <p>{message}</p>
      </main>
    )
  }

  return (
    <main style={{ maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
      <p style={{ color: 'var(--nx-muted)' }}>{data.hostName}</p>
      <h1 className="font-display">{data.offering.title}</h1>
      <p>{data.offering.description}</p>
      {data.sections.map((section) => (
        <section key={section.id} className="nx-panel" style={{ marginBottom: '1rem' }}>
          <h2>{section.title}</h2>
          {section.description && <p>{section.description}</p>}
          <ul>
            {data.sessions
              .filter((s) => s.section_id === section.id)
              .map((s) => (
                <li key={s.id} id={`session-${s.id}`}>
                  {s.title} · {new Date(s.starts_at).toLocaleString()}
                  {s.location ? ` · ${s.location}` : ''}
                </li>
              ))}
          </ul>
        </section>
      ))}
      {data.sessions.filter((s) => !s.section_id).length > 0 && (
        <section className="nx-panel">
          <h2>Sessions</h2>
          <ul>
            {data.sessions
              .filter((s) => !s.section_id)
              .map((s) => (
                <li key={s.id} id={`session-${s.id}`}>
                  {s.title} · {new Date(s.starts_at).toLocaleString()}
                </li>
              ))}
          </ul>
        </section>
      )}
    </main>
  )
}
