import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback } from 'react'
import { AppShell } from '~/components/AppShell'
import { MissingKeysBanner } from '~/components/MissingKeysBanner'
import { useOwnerQuery } from '~/components/useOwnerQuery'
import { audienceLabels } from '~/lib/audience'
import { ROLE_LABELS } from '~/lib/types'
import { getBootstrap, getDashboard } from '~/server/data'

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  const fetchAll = useCallback(async (accessToken: string | undefined) => {
    const [boot, dash] = await Promise.all([
      getBootstrap({ data: { accessToken } }),
      getDashboard({ data: { accessToken } }),
    ])
    return { boot, dash }
  }, [])

  const state = useOwnerQuery(fetchAll, { requireAuth: true })

  if (state.status === 'loading') {
    return (
      <AppShell>
        <p style={{ color: 'var(--nx-muted)' }}>Loading your console…</p>
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

  const { boot, dash } = state.data
  const { insights, codeBreakdown } = dash
  const people = audienceLabels(dash.audience || boot.audience)
  const clientHost = boot.notioxClientUrl.replace(/^https?:\/\//, '')
  const roleLabel = ROLE_LABELS[boot.owner.role]
  const total = Math.max(
    1,
    insights.activeClients + insights.invitedClients + insights.inactiveClients,
  )
  const pctActive = Math.round((insights.activeClients / total) * 100)
  const pctInvited = Math.round((insights.invitedClients / total) * 100)
  const pctInactive = Math.max(0, 100 - pctActive - pctInvited)
  const maxCode = Math.max(1, ...codeBreakdown.map((c) => c.count))

  return (
    <AppShell
      brand={boot.owner.brand_name || 'NotioX Front Desk'}
      subtitle={boot.owner.full_name || undefined}
      peopleLabel={people.titlePlural}
    >
      <MissingKeysBanner keys={boot.missingKeys} />
      {'authError' in boot && boot.authError ? (
        <div className="nx-callout" style={{ marginBottom: '1rem' }}>
          {String(boot.authError)}
        </div>
      ) : null}

      <header className="nx-page-header nx-animate-in">
        <div>
          <h1 className="font-display">Insights</h1>
          <p>
            {boot.owner.full_name || 'Owner'} · {roleLabel}. Live from Supabase — only your{' '}
            {people.plural}. Codes redeem on{' '}
            <a
              href={boot.notioxClientUrl}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--nx-accent-deep)', fontWeight: 600 }}
            >
              {clientHost}
            </a>
            .
          </p>
        </div>
        <div className="nx-page-actions">
          <Link to="/clients" className="nx-btn nx-btn-ghost">
            Filter {people.plural}
          </Link>
          <Link to="/codes" className="nx-btn nx-btn-primary">
            Generate code
          </Link>
        </div>
      </header>

      <div className="nx-grid-stats nx-animate-in" style={{ marginBottom: '1rem' }}>
        <div className="nx-panel nx-stat nx-insight nx-insight-teal">
          <span>{people.titlePlural}</span>
          <strong>{insights.totalClients}</strong>
        </div>
        <div className="nx-panel nx-stat nx-insight nx-insight-blue">
          <span>Active</span>
          <strong>{insights.activeClients}</strong>
        </div>
        <div className="nx-panel nx-stat nx-insight nx-insight-amber">
          <span>Invited</span>
          <strong>{insights.invitedClients}</strong>
        </div>
        <div className="nx-panel nx-stat nx-insight nx-insight-rose">
          <span>Inactive</span>
          <strong>{insights.inactiveClients}</strong>
        </div>
        <div className="nx-panel nx-stat nx-insight nx-insight-violet">
          <span>Task completion</span>
          <strong>{Math.round(insights.taskCompletionRate * 100)}%</strong>
        </div>
        <div className="nx-panel nx-stat nx-insight nx-insight-slate">
          <span>Open tasks</span>
          <strong>{insights.openTasks}</strong>
          <em>
            {insights.completedAssignments}/{insights.totalAssignments} done
          </em>
        </div>
      </div>

      {/* Colorful charts row */}
      <div className="nx-split nx-animate-in" style={{ marginBottom: '1rem' }}>
        <section className="nx-panel" style={{ display: 'grid', gap: '0.85rem' }}>
          <h2 className="nx-panel-title" style={{ marginBottom: 0 }}>
            Roster mix
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
            <div
              aria-hidden
              style={{
                width: 112,
                height: 112,
                borderRadius: '50%',
                background:
                  insights.totalClients === 0
                    ? '#e2e8f0'
                    : `conic-gradient(#10b981 0% ${pctActive}%, #f59e0b ${pctActive}% ${pctActive + pctInvited}%, #f43f5e ${pctActive + pctInvited}% 100%)`,
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: 68,
                  height: 68,
                  borderRadius: '50%',
                  background: '#fff',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 700,
                  fontSize: '1.05rem',
                }}
              >
                {insights.totalClients}
              </div>
            </div>
            <div style={{ display: 'grid', gap: '0.45rem', flex: 1, minWidth: 160 }}>
              <LegendRow color="#10b981" label="Active" count={insights.activeClients} pct={pctActive} />
              <LegendRow
                color="#f59e0b"
                label="Invited / pending"
                count={insights.invitedClients}
                pct={pctInvited}
              />
              <LegendRow
                color="#f43f5e"
                label="Inactive"
                count={insights.inactiveClients}
                pct={pctInactive}
              />
            </div>
          </div>
          {/* Stacked bar */}
          <div
            style={{
              height: 12,
              borderRadius: 999,
              overflow: 'hidden',
              background: '#e5e7eb',
              display: 'flex',
            }}
          >
            <div style={{ width: `${pctActive}%`, background: '#10b981' }} />
            <div style={{ width: `${pctInvited}%`, background: '#f59e0b' }} />
            <div style={{ width: `${pctInactive}%`, background: '#f43f5e' }} />
          </div>
        </section>

        <section className="nx-panel" style={{ display: 'grid', gap: '0.65rem', alignContent: 'start' }}>
          <h2 className="nx-panel-title" style={{ marginBottom: 0 }}>
            Clients by code
          </h2>
          {codeBreakdown.length === 0 ? (
            <p className="nx-panel-muted" style={{ marginBottom: 0 }}>
              No codes generated yet.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: '0.55rem' }}>
              {codeBreakdown.map((item, i) => {
                const palette = ['#0d9488', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b']
                const color = palette[i % palette.length]
                const width = Math.max(8, Math.round((item.count / maxCode) * 100))
                return (
                  <div key={item.code}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.82rem',
                        marginBottom: '0.2rem',
                      }}
                    >
                      <code>{item.code}</code>
                      <strong>{item.count} client(s)</strong>
                    </div>
                    <div
                      style={{
                        height: 10,
                        borderRadius: 999,
                        background: '#eef2f6',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: item.count === 0 ? '6%' : `${width}%`,
                          height: '100%',
                          borderRadius: 999,
                          background: color,
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      <section className="nx-panel nx-animate-in-delay">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '1rem',
            alignItems: 'baseline',
            marginBottom: '0.35rem',
          }}
        >
          <h2 className="nx-panel-title" style={{ marginBottom: 0 }}>
            Your clients
          </h2>
          <Link
            to="/clients"
            style={{ color: 'var(--nx-accent-deep)', fontWeight: 650, fontSize: '0.9rem' }}
          >
            View & filter
          </Link>
        </div>
        <p className="nx-panel-muted">Loaded from your doctor links — not demo data.</p>
        {dash.recentClients.length === 0 ? (
          <p className="nx-panel-muted" style={{ marginBottom: 0 }}>
            No linked clients yet. Share a referral code so clients can join on NotioX.
          </p>
        ) : (
          <table className="nx-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Status</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {dash.recentClients.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{c.full_name || c.email}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--nx-muted)' }}>{c.email}</div>
                  </td>
                  <td>
                    <span
                      className={`nx-badge ${c.status === 'active' ? 'nx-badge-active' : 'nx-badge-inactive'}`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td>{c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </AppShell>
  )
}

function LegendRow({
  color,
  label,
  count,
  pct,
}: {
  color: string
  label: string
  count: number
  pct: number
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.88rem' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            background: color,
            display: 'inline-block',
          }}
        />
        {label}
      </span>
      <span>
        <strong>{count}</strong> <span style={{ color: 'var(--nx-muted)' }}>({pct}%)</span>
      </span>
    </div>
  )
}
