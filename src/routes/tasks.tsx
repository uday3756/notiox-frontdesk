import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useState } from 'react'
import { AppShell } from '~/components/AppShell'
import { useOwnerQuery } from '~/components/useOwnerQuery'
import { getAccessToken } from '~/lib/session'
import { createTask, listTasks } from '~/server/data'

export const Route = createFileRoute('/tasks')({
  component: TasksPage,
})

function TasksPage() {
  const fetchTasks = useCallback(
    (accessToken: string | undefined) => listTasks({ data: { accessToken } }),
    [],
  )
  const state = useOwnerQuery(fetchTasks, { requireAuth: true })
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium')
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  function toggleClient(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
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
          clientIds: selected,
        },
      })
      setTitle('')
      setDescription('')
      setSelected([])
      setMsg(
        selected.length
          ? `Task created and assigned to ${selected.length} client(s).`
          : 'Task created.',
      )
      await state.reload()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed to create task')
    } finally {
      setBusy(false)
    }
  }

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

  const { tasks, assignments, clients } = state.data

  return (
    <AppShell>
      <header className="nx-page-header nx-animate-in">
        <div>
          <h1 className="font-display">Tasks</h1>
          <p>Assign work to your clients only. Task storage is local until owner_tasks ships.</p>
        </div>
      </header>

      <div className="nx-split">
        <form className="nx-panel nx-form-grid nx-animate-in" onSubmit={onCreate}>
          <h2 className="nx-panel-title">New task</h2>
          <div>
            <label className="nx-label" htmlFor="title">
              Title
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
            <div className="nx-label">Assign to (your clients)</div>
            <div style={{ display: 'grid', gap: '0.35rem' }}>
              {clients.length === 0 ? (
                <p className="nx-panel-muted" style={{ margin: 0 }}>
                  No linked clients yet.
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
          {msg && <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--nx-slate)' }}>{msg}</p>}
        </form>

        <div className="nx-panel nx-animate-in-delay">
          <h2 className="nx-panel-title">Your tasks</h2>
          <table className="nx-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Done</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => {
                const count = assignments.filter((a) => a.task_id === t.id).length
                const done = assignments.filter(
                  (a) => a.task_id === t.id && a.status === 'completed',
                ).length
                return (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600 }}>{t.title}</td>
                    <td>{t.priority}</td>
                    <td>{t.status}</td>
                    <td>
                      {done}/{count}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  )
}
