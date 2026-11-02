import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useState } from 'react'
import { AppShell } from '~/components/AppShell'
import { useOwnerQuery } from '~/components/useOwnerQuery'
import { getAccessToken } from '~/lib/session'
import { createTask, createTopic, listTasks } from '~/server/data'

export const Route = createFileRoute('/tasks')({
  component: TasksPage,
})

function TasksPage() {
  const fetchTasks = useCallback(
    (accessToken: string | undefined) => listTasks({ data: { accessToken } }),
    [],
  )
  const state = useOwnerQuery(fetchTasks, { requireAuth: true })
  const [topicTitle, setTopicTitle] = useState('')
  const [topicDesc, setTopicDesc] = useState('')
  const [topicId, setTopicId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium')
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

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
          ? `Task saved under this subject and assigned to ${selected.length} client(s). It will show in the student app once that app reads fd_task_assignments.`
          : 'Task saved. Select clients to push it into their app inbox.',
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

  const { tasks, assignments, clients, topics, storage } = state.data

  return (
    <AppShell>
      <header className="nx-page-header nx-animate-in">
        <div>
          <h1 className="font-display">Subjects & tasks</h1>
          <p>
            Create a subject, then assign different tasks to different clients. Same backend as the
            NotioX student app.
            {storage === 'notes' ? ' (Waiting on fd_* migration — saved on your doctor profile until SQL is applied.)' : ''}
          </p>
        </div>
      </header>

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
              <div className="nx-label">Assign to specific clients</div>
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
                            .map((a) => clients.find((c) => c.id === a.client_id)?.full_name || a.client_id.slice(0, 8))
                            .join(', ')
                          return (
                            <li key={t.id} style={{ marginBottom: '0.35rem' }}>
                              <strong>{t.title}</strong> · {t.priority}
                              {names ? <span style={{ color: 'var(--nx-muted)' }}> → {names}</span> : null}
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
    </AppShell>
  )
}
