import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'
import { AppShell } from '~/components/AppShell'
import { useOwnerQuery } from '~/components/useOwnerQuery'
import { audienceLabels } from '~/lib/audience'
import { getAccessToken } from '~/lib/session'
import { signalLabel } from '~/lib/task-progress'
import type { AssignmentStatus, WorkSignal } from '~/lib/types'
import { createTask, createTopic, listTasks, updateAssignment } from '~/server/data'

export const Route = createFileRoute('/tasks')({
  component: TasksPage,
})

type Tab = 'assign' | 'progress'

function TasksPage() {
  const fetchTasks = useCallback(
    (accessToken: string | undefined) => listTasks({ data: { accessToken } }),
    [],
  )
  const state = useOwnerQuery(fetchTasks, { requireAuth: true })
  const [tab, setTab] = useState<Tab>('assign')
  const [topicTitle, setTopicTitle] = useState('')
  const [topicDesc, setTopicDesc] = useState('')
  const [topicId, setTopicId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium')
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const [filterClient, setFilterClient] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | AssignmentStatus>('all')
  const [filterTopic, setFilterTopic] = useState('')
  const [filterSignal, setFilterSignal] = useState<'all' | WorkSignal>('all')
  const [filterQuery, setFilterQuery] = useState('')

  const people = audienceLabels(state.status === 'ready' ? state.data.audience : undefined)

  function toggleClient(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function onCreateTopic(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      const accessToken = (await getAccessToken()) || undefined
      const result = await createTopic({
        data: { accessToken, title: topicTitle, description: topicDesc || undefined },
      })
      setTopicTitle('')
      setTopicDesc('')
      setTopicId(result.topic.id)
      setMsg(`Subject “${result.topic.title}” created. Assign tasks under it.`)
      await state.reload()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed to create subject')
    } finally {
      setBusy(false)
    }
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      const accessToken = (await getAccessToken()) || undefined
      await createTask({
        data: {
          accessToken,
          title,
          description: description || undefined,
          priority,
          topicId: topicId || undefined,
          clientIds: selected,
        },
      })
      setTitle('')
      setDescription('')
      setSelected([])
      setMsg(
        selected.length
          ? `Task saved and assigned to ${selected.length} ${selected.length === 1 ? people.singular : people.plural}.`
          : 'Task saved. Select people to push it into their app inbox.',
      )
      await state.reload()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed to create task')
    } finally {
      setBusy(false)
    }
  }

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

  const filteredRows = useMemo(() => {
    if (state.status !== 'ready') return []
    const q = filterQuery.trim().toLowerCase()
    return state.data.progress.rows.filter((row) => {
      if (filterClient && row.clientId !== filterClient) return false
      if (filterStatus !== 'all' && row.status !== filterStatus) return false
      if (filterTopic && (row.topicId || '') !== filterTopic) return false
      if (filterSignal !== 'all' && row.effectiveSignal !== filterSignal) return false
      if (!q) return true
      const hay = `${row.taskTitle} ${row.clientName} ${row.clientEmail} ${row.topicTitle || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [state, filterClient, filterStatus, filterTopic, filterSignal, filterQuery])

  if (state.status === 'loading') {
    return (
      <AppShell>
        <p style={{ color: 'var(--nx-muted)' }}>Loading tasks…</p>
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

  const { tasks, assignments, clients, topics, storage, progress } = state.data

  return (
    <AppShell peopleLabel={people.titlePlural}>
      <header className="nx-page-header nx-animate-in">
        <div>
          <h1 className="font-display">Subjects & tasks</h1>
          <p>
            Create subjects, assign work, then track completion and productivity for your{' '}
            {people.plural}.
            {storage === 'notes'
              ? ' (Waiting on fd_* migration — saved on your doctor profile until SQL is applied.)'
              : ''}
          </p>
        </div>
      </header>

      <div className="nx-filters nx-animate-in" style={{ marginBottom: '1rem' }}>
        <button
          type="button"
          className={tab === 'assign' ? 'nx-chip nx-chip-active' : 'nx-chip'}
          onClick={() => setTab('assign')}
        >
          Assign
        </button>
        <button
          type="button"
          className={tab === 'progress' ? 'nx-chip nx-chip-active' : 'nx-chip'}
          onClick={() => setTab('progress')}
        >
          Progress
        </button>
      </div>

      {msg && (
        <p className="nx-panel-muted" style={{ marginTop: 0 }}>
          {msg}
        </p>
      )}

      {tab === 'assign' ? (
        <div className="nx-split">
          <div className="nx-form-grid">
            <form className="nx-panel nx-form-grid nx-animate-in" onSubmit={onCreateTopic}>
              <h2 className="nx-panel-title">New subject / topic</h2>
              <div>
                <label className="nx-label" htmlFor="topicTitle">
                  Subject name
                </label>
                <input
                  id="topicTitle"
                  className="nx-input"
                  value={topicTitle}
                  onChange={(e) => setTopicTitle(e.target.value)}
                  placeholder="e.g. Week 3 — Sleep & focus"
                  required
                />
              </div>
              <div>
                <label className="nx-label" htmlFor="topicDesc">
                  Description
                </label>
                <textarea
                  id="topicDesc"
                  className="nx-textarea"
                  value={topicDesc}
                  onChange={(e) => setTopicDesc(e.target.value)}
                />
              </div>
              <button className="nx-btn nx-btn-ghost" type="submit" disabled={busy || !topicTitle.trim()}>
                Create subject
              </button>
            </form>

            <form className="nx-panel nx-form-grid nx-animate-in" onSubmit={onCreate}>
              <h2 className="nx-panel-title">Assign a task</h2>
              <div>
                <label className="nx-label" htmlFor="topic">
                  Subject
                </label>
                <select
                  id="topic"
                  className="nx-select"
                  value={topicId}
                  onChange={(e) => setTopicId(e.target.value)}
                >
                  <option value="">No subject</option>
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="nx-label" htmlFor="title">
                  Task title
                </label>
                <input
                  id="title"
                  className="nx-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="nx-label" htmlFor="desc">
                  Description
                </label>
                <textarea
                  id="desc"
                  className="nx-textarea"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div>
                <label className="nx-label" htmlFor="priority">
                  Priority
                </label>
                <select
                  id="priority"
                  className="nx-select"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as typeof priority)}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div>
                <div className="nx-label">Assign to specific {people.plural}</div>
                <div style={{ display: 'grid', gap: '0.35rem' }}>
                  {clients.length === 0 ? (
                    <p className="nx-panel-muted" style={{ margin: 0 }}>
                      No linked {people.plural} yet.
                    </p>
                  ) : (
                    clients.map((c) => (
                      <label
                        key={c.id}
                        style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.92rem' }}
                      >
                        <input
                          type="checkbox"
                          checked={selected.includes(c.id)}
                          onChange={() => toggleClient(c.id)}
                        />
                        {c.full_name || c.email}
                      </label>
                    ))
                  )}
                </div>
              </div>
              <button className="nx-btn nx-btn-primary" type="submit" disabled={busy || !title.trim()}>
                Create & assign
              </button>
            </form>
          </div>

          <div className="nx-panel nx-animate-in-delay">
            <h2 className="nx-panel-title">By subject</h2>
            {topics.length === 0 && tasks.length === 0 ? (
              <p className="nx-panel-muted">No subjects or tasks yet.</p>
            ) : (
              <div style={{ display: 'grid', gap: '1rem' }}>
                {topics.map((topic) => {
                  const topicTasks = tasks.filter((t) => t.topic_id === topic.id)
                  return (
                    <section key={topic.id}>
                      <h3 style={{ margin: '0 0 0.35rem', fontSize: '1rem' }}>{topic.title}</h3>
                      {topic.description ? (
                        <p className="nx-panel-muted" style={{ margin: '0 0 0.5rem' }}>
                          {topic.description}
                        </p>
                      ) : null}
                      {topicTasks.length === 0 ? (
                        <p className="nx-panel-muted">No tasks in this subject.</p>
                      ) : (
                        <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                          {topicTasks.map((t) => {
                            const assigned = assignments.filter((a) => a.task_id === t.id)
                            const names = assigned
                              .map(
                                (a) =>
                                  clients.find((c) => c.id === a.client_id)?.full_name ||
                                  a.client_id.slice(0, 8),
                              )
                              .join(', ')
                            const done = assigned.filter((a) => a.status === 'completed').length
                            return (
                              <li key={t.id} style={{ marginBottom: '0.35rem' }}>
                                <strong>{t.title}</strong> · {t.priority}
                                {assigned.length ? (
                                  <span style={{ color: 'var(--nx-muted)' }}>
                                    {' '}
                                    → {names} ({done}/{assigned.length} done)
                                  </span>
                                ) : null}
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </section>
                  )
                })}
                {tasks.filter((t) => !t.topic_id).length > 0 && (
                  <section>
                    <h3 style={{ margin: '0 0 0.35rem', fontSize: '1rem' }}>Unfiled</h3>
                    <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                      {tasks
                        .filter((t) => !t.topic_id)
                        .map((t) => (
                          <li key={t.id}>
                            <strong>{t.title}</strong> · {t.priority}
                          </li>
                        ))}
                    </ul>
                  </section>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="nx-animate-in" style={{ display: 'grid', gap: '1rem' }}>
          <div className="nx-grid-stats">
            <div className="nx-panel nx-stat">
              <span>Assigned</span>
              <strong>{progress.totals.assigned}</strong>
            </div>
            <div className="nx-panel nx-stat">
              <span>Completed</span>
              <strong>{progress.totals.completed}</strong>
            </div>
            <div className="nx-panel nx-stat">
              <span>Overdue</span>
              <strong>{progress.totals.overdue}</strong>
            </div>
            <div className="nx-panel nx-stat">
              <span>Avg completion</span>
              <strong>{Math.round(progress.totals.avgCompletionRate * 100)}%</strong>
            </div>
          </div>

          <div className="nx-filters">
            <input
              className="nx-input nx-search"
              type="search"
              placeholder="Search task or name"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
            />
            <select
              className="nx-select"
              value={filterClient}
              onChange={(e) => setFilterClient(e.target.value)}
              aria-label={`Filter by ${people.singular}`}
            >
              <option value="">All {people.plural}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name || c.email}
                </option>
              ))}
            </select>
            <select
              className="nx-select"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
              <option value="skipped">Skipped</option>
            </select>
            <select
              className="nx-select"
              value={filterTopic}
              onChange={(e) => setFilterTopic(e.target.value)}
            >
              <option value="">All subjects</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            <select
              className="nx-select"
              value={filterSignal}
              onChange={(e) => setFilterSignal(e.target.value as typeof filterSignal)}
            >
              <option value="all">All signals</option>
              <option value="on_track">On track</option>
              <option value="needs_attention">Needs attention</option>
              <option value="at_risk">At risk</option>
            </select>
          </div>

          <div className="nx-panel">
            <h2 className="nx-panel-title">Assignment progress</h2>
            {progress.rows.length === 0 ? (
              <p className="nx-panel-muted" style={{ marginBottom: 0 }}>
                No assignments yet. Create a task and assign it to a {people.singular} first.
              </p>
            ) : filteredRows.length === 0 ? (
              <p className="nx-panel-muted" style={{ marginBottom: 0 }}>
                No rows match these filters.
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="nx-table">
                  <thead>
                    <tr>
                      <th>{people.titleSingular}</th>
                      <th>Task</th>
                      <th>Subject</th>
                      <th>Status</th>
                      <th>Due</th>
                      <th>Signal</th>
                      <th>Owner note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => (
                      <tr key={row.assignmentId}>
                        <td style={{ fontWeight: 600 }}>{row.clientName}</td>
                        <td>
                          {row.taskTitle}
                          {row.overdue ? (
                            <span className="nx-badge nx-badge-inactive" style={{ marginLeft: 6 }}>
                              overdue
                            </span>
                          ) : null}
                        </td>
                        <td>{row.topicTitle || '—'}</td>
                        <td>
                          <select
                            className="nx-select"
                            style={{ minWidth: 120 }}
                            value={row.status}
                            disabled={busy}
                            onChange={(e) =>
                              patchAssignment({
                                assignmentId: row.assignmentId,
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
                        <td>{row.dueAt ? new Date(row.dueAt).toLocaleDateString() : '—'}</td>
                        <td>{signalLabel(row.effectiveSignal)}</td>
                        <td>
                          <select
                            className="nx-select"
                            style={{ minWidth: 140 }}
                            value={row.ownerSignal || ''}
                            disabled={busy}
                            onChange={(e) => {
                              const v = e.target.value
                              if (!v) {
                                patchAssignment({
                                  assignmentId: row.assignmentId,
                                  clearOwnerSignal: true,
                                })
                              } else {
                                patchAssignment({
                                  assignmentId: row.assignmentId,
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
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="nx-panel">
            <h2 className="nx-panel-title">By {people.singular}</h2>
            {progress.people.length === 0 ? (
              <p className="nx-panel-muted" style={{ marginBottom: 0 }}>
                Productivity appears here once tasks are assigned.
              </p>
            ) : (
              <table className="nx-table">
                <thead>
                  <tr>
                    <th>{people.titleSingular}</th>
                    <th>Assigned</th>
                    <th>Done</th>
                    <th>Overdue</th>
                    <th>Rate</th>
                    <th>Working</th>
                  </tr>
                </thead>
                <tbody>
                  {progress.people.map((p) => (
                    <tr key={p.clientId}>
                      <td style={{ fontWeight: 600 }}>{p.clientName}</td>
                      <td>{p.assigned}</td>
                      <td>{p.completed}</td>
                      <td>{p.overdue}</td>
                      <td>{Math.round(p.completionRate * 100)}%</td>
                      <td>{signalLabel(p.computedSignal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </AppShell>
  )
}
