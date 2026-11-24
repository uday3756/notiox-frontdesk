import { Link, Outlet, createFileRoute, useRouterState } from '@tanstack/react-router'
import { AppShell } from '~/components/AppShell'
import { FeatureGate } from '~/components/FeatureGate'

export const Route = createFileRoute('/email')({
  component: () => (
    <FeatureGate feature="email">
      <EmailLayout />
    </FeatureGate>
  ),
})

function EmailLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const studio = pathname.includes('/studio')

  return (
    <AppShell>
      <header className="nx-page-header nx-animate-in">
        <div>
          <h1 className="font-display">Email marketing</h1>
          <p>Build HTML templates with AI, add image, video, and links — then send from your own mailbox (SMTP).</p>
        </div>
      </header>
      <nav className="nx-subnav" aria-label="Email sections">
        <Link to="/email" className={studio ? undefined : 'active'} activeOptions={{ exact: true }}>
          Campaigns
        </Link>
        <Link to="/email/studio" className={studio ? 'active' : undefined}>
          AI Studio
        </Link>
      </nav>
      <Outlet />
    </AppShell>
  )
}
