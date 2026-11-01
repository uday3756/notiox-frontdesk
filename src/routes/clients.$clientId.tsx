import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback } from 'react'
import { AppShell } from '~/components/AppShell'
import { useOwnerQuery } from '~/components/useOwnerQuery'
import { getClient } from '~/server/data'

export const Route = createFileRoute('/clients/$clientId')({
  component: ClientDetailPage,
})

function ClientDetailPage() {
  const { clientId } = Route.useParams()
  const fetchClient = useCallback(
    (accessToken: string | undefined) => getClient({ data: { accessToken, id: clientId } }),
    [clientId],
  )
  const state = useOwnerQuery(fetchClient, { requireAuth: true })

  if (state.status === 'loading') {
    return (
      <AppShell>
        <p style={{ color: 'var(--nx-muted)' }}>Loading client…</p>
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

  const { client, assignments, tasks } = state.data

  if (!client) {
    return (
      <AppShell>
        <div className="nx-panel">
          <h1 className="font-display" style={{ marginTop: 0 }}>
            Client not found
          </h1>
          <p className="nx-panel-muted">Not in your roster (owner-scoped).</p>
          <Link to="/clients" style={{ color: 'var(--nx-accent-deep)', fontWeight: 650 }}>
            Back to clients
          </Link>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <p style={{ margin: '0 0 0.75rem' }}>
        <Link to="/clients" style={{ color: 'var(--nx-accent-deep)', fontWeight: 650, fontSize: '0.9rem' }}>
          ← Clients
        </Link>
      </p>

      <header className="nx-page-header nx-animate-in">
        <div>
          <h1 className="font-display">{client.full_name || client.email}</h1>
          <p>{client.email}</p>
        </div>
        <div className="nx-page-actions">
          <Link to="/tasks" className="nx-btn nx-btn-primary">
            Assign task
          </Link>
        </div>
      </header>

      <div className="nx-panel nx-animate-in" style={{ marginBottom: '1rem' }}>
        <div
          style={{
            display: 'grid',
            gap: '0.85rem',
            gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))',
          }}
        >
          <div>
            <div className="nx-label">Status</div>
            <span
              className={`nx-badge ${client.status === 'active' ? 'nx-badge-active' : 'nx-badge-inactive'}`}
            >
              {client.status}
            </span>
          </div>
          <div>
            <div className="nx-label">Referral code</div>
            <div>{client.tags[0] || '—'}</div>
          </div>
          <div>
            <div className="nx-label">Linked</div>
            <div>{new Date(client.created_at).toLocaleString()}</div>
          </div>
        </div>
        {client.notes && (
          <p style={{ marginTop: '1rem', marginBottom: 0, color: 'var(--nx-slate)' }}>{client.notes}</p>
        )}
      </div>

      <div className="nx-panel nx-animate-in-delay">
        <h2 className="nx-panel-title">Task assignments</h2>
        {assignments.length === 0 ? (
          <p className="nx-panel-muted" style={{ marginBottom: 0 }}>
            No Front Desk task assignments stored yet for this client.
          </p>
        ) : (
          <table className="nx-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Status</th>
                <th>Completed</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => {
                const task = tasks.find((t) => t.id === a.task_id)
                return (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 600 }}>{task?.title || a.task_id}</td>
                    <td>{a.status}</td>
                    <td>{a.completed_at ? new Date(a.completed_at).toLocaleDateString() : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  )
}
