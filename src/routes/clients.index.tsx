import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'
import { AppShell } from '~/components/AppShell'
import { useOwnerQuery } from '~/components/useOwnerQuery'
import { audienceLabels } from '~/lib/audience'
import { premiumPlanLabel } from '~/lib/premium'
import type { ClientStatus } from '~/lib/types'
import { listClients } from '~/server/data'

export const Route = createFileRoute('/clients/')({
  component: ClientsListPage,
})

type StatusFilter = 'all' | ClientStatus | 'premium'

function ClientsListPage() {
  const fetchClients = useCallback(
    (accessToken: string | undefined) => listClients({ data: { accessToken } }),
    [],
  )
  const state = useOwnerQuery(fetchClients, { requireAuth: true })
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')

  const premiumIds = useMemo(() => {
    if (state.status !== 'ready') return new Set<string>()
    return new Set((state.data.premium?.purchases || []).map((p) => p.clientId))
  }, [state])

  const premiumById = useMemo(() => {
    const map = new Map<string, { plan: string; referralCode: string }>()
    if (state.status !== 'ready') return map
    for (const p of state.data.premium?.purchases || []) {
      map.set(p.clientId, { plan: p.plan, referralCode: p.referralCode })
    }
    return map
  }, [state])

  const filtered = useMemo(() => {
    if (state.status !== 'ready') return []
    const q = query.trim().toLowerCase()
    return state.data.clients.filter((c) => {
      if (status === 'premium') {
        if (!premiumIds.has(c.id)) return false
      } else if (status !== 'all' && c.status !== status) {
        return false
      }
      if (!q) return true
      const hay = `${c.full_name || ''} ${c.email} ${c.tags.join(' ')}`.toLowerCase()
      return hay.includes(q)
    })
  }, [state, query, status, premiumIds])

  const people = audienceLabels(state.status === 'ready' ? state.data.audience : undefined)

  if (state.status === 'loading') {
    return (
      <AppShell>
        <p style={{ color: 'var(--nx-muted)' }}>Loading {people.plural}…</p>
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

  const { clients, premium } = state.data
  const counts = {
    all: clients.length,
    active: clients.filter((c) => c.status === 'active').length,
    invited: clients.filter((c) => c.status === 'invited').length,
    inactive: clients.filter((c) => c.status === 'inactive' || c.status === 'churned').length,
    premium: premium?.count ?? 0,
  }

  return (
    <AppShell peopleLabel={people.titlePlural}>
      <header className="nx-page-header nx-animate-in">
        <div>
          <h1 className="font-display">{people.titlePlural}</h1>
          <p>
            {clients.length} from your Supabase links · showing {filtered.length}. Owner-scoped only.
            Premium counts users who used <strong>your</strong> refer code (any user type).
          </p>
        </div>
        <div className="nx-page-actions">
          <Link to="/codes" className="nx-btn nx-btn-primary">
            Invite via code
          </Link>
        </div>
      </header>

      <div className="nx-grid-stats nx-animate-in" style={{ marginBottom: '1rem' }}>
        <div className="nx-panel nx-stat nx-insight nx-insight-teal">
          <span>Premium purchases</span>
          <strong>{counts.premium}</strong>
          <em>Via your refer code</em>
        </div>
      </div>

      {!premium?.sourceAvailable ? (
        <div className="nx-callout nx-animate-in" style={{ marginBottom: '1rem' }}>
          {premium?.note ||
            'Premium plan data needs SUPABASE_SERVICE_ROLE_KEY on the server to read subscriptions.'}
        </div>
      ) : null}

      {premium?.sourceAvailable && premium.count > 0 ? (
        <section className="nx-panel nx-animate-in" style={{ marginBottom: '1rem' }}>
          <h2 className="nx-panel-title">Premium buyers (your code)</h2>
          <p className="nx-panel-muted">
            Freemium → premium conversions attributed to your unique refer code only.
          </p>
          <table className="nx-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Plan</th>
                <th>Code</th>
                <th>Purchased</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {premium.purchases.map((p) => (
                <tr key={p.clientId}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{p.fullName || p.email}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--nx-muted)' }}>{p.email}</div>
                  </td>
                  <td>
                    <span className="nx-badge nx-badge-active">{premiumPlanLabel(p.plan)}</span>
                  </td>
                  <td>
                    <code>{p.referralCode}</code>
                  </td>
                  <td style={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                    {p.purchasedAt ? new Date(p.purchasedAt).toLocaleDateString() : '—'}
                  </td>
                  <td>
                    <Link
                      to="/clients/$clientId"
                      params={{ clientId: p.clientId }}
                      style={{ color: 'var(--nx-accent-deep)', fontWeight: 650 }}
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

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
            ['premium', `Premium (${counts.premium})`],
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
            No {people.plural} linked in the database for this owner yet.
          </p>
        ) : filtered.length === 0 ? (
          <p className="nx-panel-muted" style={{ marginBottom: 0 }}>
            No {people.plural} match this filter.
          </p>
        ) : (
          <table className="nx-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Status</th>
                <th>Code</th>
                <th>Plan</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const prem = premiumById.get(c.id)
                return (
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
                      {prem ? (
                        <span className="nx-badge nx-badge-active">{premiumPlanLabel(prem.plan)}</span>
                      ) : (
                        <span style={{ color: 'var(--nx-muted)', fontSize: '0.85rem' }}>—</span>
                      )}
                    </td>
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
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  )
}
