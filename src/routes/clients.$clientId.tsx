import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback, useState } from 'react'
import { AppShell } from '~/components/AppShell'
import { useOwnerQuery } from '~/components/useOwnerQuery'
import { audienceLabels } from '~/lib/audience'
import { getAccessToken } from '~/lib/session'
import { signalLabel } from '~/lib/task-progress'
import type { AssignmentStatus, WorkSignal } from '~/lib/types'
import { getClient, updateAssignment } from '~/server/data'

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
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const people = audienceLabels(state.status === 'ready' ? state.data.audience : undefined)

  async function patchAssignment(input: {
    assignmentId: string
    status?: AssignmentStatus
    ownerSignal?: WorkSignal | null
    clearOwnerSignal?: boolean
  }) {
    setBusy(true)
    setMsg(null)
    try {
      const accessToken = (await getAccessToken()) || undefined
      await updateAssignment({ data: { accessToken, ...input } })
      await state.reload()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  if (state.status === 'loading') {
    return (
      <AppShell>
        <p style={{ color: 'var(--nx-muted)' }}>Loading {people.singular}…</p>
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

  const { client, assignments, tasks, person } = state.data

  if (!client) {
    return (
      <AppShell peopleLabel={people.titlePlural}>
        <div className="nx-panel">
          <h1 className="font-display" style={{ marginTop: 0 }}>
            {people.titleSingular} not found
          </h1>
          <p className="nx-panel-muted">Not in your roster (owner-scoped).</p>
          <Link to="/clients" style={{ color: 'var(--nx-accent-deep)', fontWeight: 650 }}>
            Back to {people.plural}
          </Link>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell peopleLabel={people.titlePlural}>
      <p style={{ margin: '0 0 0.75rem' }}>
        <Link to="/clients" style={{ color: 'var(--nx-accent-deep)', fontWeight: 650, fontSize: '0.9rem' }}>
          ← {people.titlePlural}
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
          {person && (
            <>
              <div>
                <div className="nx-label">Completion</div>
                <div>{Math.round(person.completionRate * 100)}%</div>
              </div>
              <div>
                <div className="nx-label">Working</div>
                <div>{signalLabel(person.computedSignal)}</div>
              </div>
              <div>
                <div className="nx-label">Overdue</div>
                <div>{person.overdue}</div>
              </div>
            </>
          )}
        </div>
        {client.notes && (
          <p style={{ marginTop: '1rem', marginBottom: 0, color: 'var(--nx-slate)' }}>{client.notes}</p>
        )}
      </div>

      <div className="nx-panel nx-animate-in-delay">
        <h2 className="nx-panel-title">Task assignments</h2>
        {msg && <p className="nx-panel-muted">{msg}</p>}
        {assignments.length === 0 ? (
          <p className="nx-panel-muted" style={{ marginBottom: 0 }}>
            No Front Desk task assignments stored yet for this {people.singular}.
          </p>
        ) : (
          <table className="nx-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Status</th>
                <th>Completed</th>
                <th>Owner note</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => {
                const task = tasks.find((t) => t.id === a.task_id)
                return (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 600 }}>{task?.title || a.task_id}</td>
                    <td>
                      <select
                        className="nx-select"
                        style={{ minWidth: 120 }}
                        value={a.status}
                        disabled={busy}
                        onChange={(e) =>
                          patchAssignment({
                            assignmentId: a.id,
                            status: e.target.value as AssignmentStatus,
                          })
                        }
                      >
                        <option value="pending">Pending</option>
                        <option value="in_progress">In progress</option>
                        <option value="completed">Completed</option>
                        <option value="skipped">Skipped</option>
                      </select>
                    </td>
                    <td>{a.completed_at ? new Date(a.completed_at).toLocaleDateString() : '—'}</td>
                    <td>
                      <select
                        className="nx-select"
                        style={{ minWidth: 140 }}
                        value={a.owner_signal || ''}
                        disabled={busy}
                        onChange={(e) => {
                          const v = e.target.value
                          if (!v) {
                            patchAssignment({ assignmentId: a.id, clearOwnerSignal: true })
                          } else {
                            patchAssignment({
                              assignmentId: a.id,
                              ownerSignal: v as WorkSignal,
                            })
                          }
                        }}
                      >
                        <option value="">Auto</option>
                        <option value="on_track">On track</option>
                        <option value="needs_attention">Needs attention</option>
                        <option value="at_risk">At risk</option>
                      </select>
                    </td>
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
