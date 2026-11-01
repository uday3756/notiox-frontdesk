import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useState } from 'react'
import { AppShell } from '~/components/AppShell'
import { useOwnerQuery } from '~/components/useOwnerQuery'
import { getAccessToken } from '~/lib/session'
import { createCode, getBootstrap, listCodes } from '~/server/data'

export const Route = createFileRoute('/codes')({
  component: CodesPage,
})

function CodesPage() {
  const fetchPage = useCallback(async (accessToken: string | undefined) => {
    const [codes, boot] = await Promise.all([
      listCodes({ data: { accessToken } }),
      getBootstrap({ data: { accessToken } }),
    ])
    return { ...codes, boot }
  }, [])
  const state = useOwnerQuery(fetchPage, { requireAuth: true })
  const [label, setLabel] = useState('')
  const [custom, setCustom] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      const accessToken = (await getAccessToken()) || undefined
      const { code } = await createCode({
        data: {
          accessToken,
          label: label || undefined,
          codeType: 'referral',
          code: custom || undefined,
        },
      })
      setMsg(`Created ${code.code}. Clients enter this on NotioX.`)
      setLabel('')
      setCustom('')
      await state.reload()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed to create code')
    } finally {
      setBusy(false)
    }
  }

  if (state.status === 'loading') {
    return (
      <AppShell>
        <p style={{ color: 'var(--nx-muted)' }}>Loading codes…</p>
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

  const { codes, boot } = state.data

  return (
    <AppShell>
      <header className="nx-page-header nx-animate-in">
        <div>
          <h1 className="font-display">Codes</h1>
          <p>
            Your referral codes only. Clients enter them in{' '}
            <a
              href={boot.notioxClientUrl}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--nx-accent-deep)', fontWeight: 650 }}
            >
              NotioX
            </a>
            .
          </p>
        </div>
      </header>

      <div className="nx-split">
        <form className="nx-panel nx-form-grid nx-animate-in" onSubmit={onCreate}>
          <h2 className="nx-panel-title">Generate code</h2>
          <div>
            <label className="nx-label" htmlFor="label">
              Label / campaign
            </label>
            <input
              id="label"
              className="nx-input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div>
            <label className="nx-label" htmlFor="custom">
              Custom code (optional)
            </label>
            <input
              id="custom"
              className="nx-input"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Leave blank to auto-generate"
            />
          </div>
          <button className="nx-btn nx-btn-primary" type="submit" disabled={busy}>
            Generate
          </button>
          {msg && <p style={{ margin: 0, fontSize: '0.9rem' }}>{msg}</p>}
        </form>

        <div className="nx-panel nx-animate-in-delay">
          <h2 className="nx-panel-title">Your codes</h2>
          <table className="nx-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Campaign</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => (
                <tr key={c.id}>
                  <td>
                    <code style={{ fontWeight: 700 }}>{c.code}</code>
                  </td>
                  <td>{c.label || '—'}</td>
                  <td>
                    <span className={`nx-badge ${c.active ? 'nx-badge-active' : 'nx-badge-inactive'}`}>
                      {c.active ? 'active' : 'inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  )
}
