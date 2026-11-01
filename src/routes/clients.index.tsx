import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'
import { AppShell } from '~/components/AppShell'
import { useOwnerQuery } from '~/components/useOwnerQuery'
import type { ClientStatus } from '~/lib/types'
import { listClients } from '~/server/data'

export const Route = createFileRoute('/clients/')({
  component: ClientsListPage,
})

type StatusFilter = 'all' | ClientStatus

function ClientsListPage() {
  const fetchClients = useCallback(
    (accessToken: string | undefined) => listClients({ data: { accessToken } }),
    [],
  )
  const state = useOwnerQuery(fetchClients, { requireAuth: true })
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')

  const filtered = useMemo(() => {
    if (state.status !== 'ready') return []
    const q = query.trim().toLowerCase()
    return state.data.clients.filter((c) => {
      if (status !== 'all' && c.status !== status) return false
      if (!q) return true
      const hay = `${c.full_name || ''} ${c.email} ${c.tags.join(' ')}`.toLowerCase()
      return hay.includes(q)
    })
  }, [state, query, status])

  if (state.status === 'loading') {
    return (
      <AppShell>
        <p style={{ color: 'var(--nx-muted)' }}>Loading clients…</p>
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

  const { clients } = state.data
  const counts = {
    all: clients.length,
    active: clients.filter((c) => c.status === 'active').length,
    invited: clients.filter((c) => c.status === 'invited').length,
    inactive: clients.filter((c) => c.status === 'inactive' || c.status === 'churned').length,
  }

  return (
    <AppShell>
      <header className="nx-page-header nx-animate-in">
        <div>
          <h1 className="font-display">Clients</h1>
          <p>
            {clients.length} from your Supabase links · showing {filtered.length}. Owner-scoped only.
          </p>
        </div>
        <div className="nx-page-actions">
          <Link to="/codes" className="nx-btn nx-btn-primary">
            Invite via code
          </Link>
        </div>
      </header>

      <div className="nx-filters nx-animate-in">
        <input
          className="nx-input nx-search"
          type="search"
          placeholder="Filter by name, email, or code"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {(
          [
            ['all', `All (${counts.all})`],
            ['active', `Active (${counts.active})`],
            ['invited', `Invited (${counts.invited})`],
            ['inactive', `Inactive (${counts.inactive})`],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={status === value ? 'nx-chip nx-chip-active' : 'nx-chip'}
            onClick={() => setStatus(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="nx-panel nx-animate-in-delay">
        {clients.length === 0 ? (
          <p className="nx-panel-muted" style={{ marginBottom: 0 }}>
            No clients linked in the database for this owner yet.
          </p>
        ) : filtered.length === 0 ? (
          <p className="nx-panel-muted" style={{ marginBottom: 0 }}>
            No clients match this filter.
          </p>
        ) : (
          <table className="nx-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Status</th>
                <th>Code</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.full_name || '—'}</td>
                  <td>{c.email}</td>
                  <td>
                    <span
                      className={`nx-badge ${c.status === 'active' ? 'nx-badge-active' : 'nx-badge-inactive'}`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td>{c.tags[0] || '—'}</td>
                  <td>
                    <Link
                      to="/clients/$clientId"
                      params={{ clientId: c.id }}
                      style={{ color: 'var(--nx-accent-deep)', fontWeight: 650 }}
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  )
}
