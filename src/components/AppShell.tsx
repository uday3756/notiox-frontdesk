import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { signOutOwner } from '~/lib/session'

const TABS = [
  { to: '/dashboard', label: 'Home', icon: IconHome },
  { to: '/clients', label: 'Clients', icon: IconPeople },
  { to: '/tasks', label: 'Tasks', icon: IconTasks },
  { to: '/codes', label: 'Codes', icon: IconCode },
  { to: '/email', label: 'Email', icon: IconMail },
  { to: '/settings', label: 'Settings', icon: IconGear },
] as const

function tabActive(pathname: string, to: string) {
  if (to === '/dashboard') return pathname === '/dashboard' || pathname === '/'
  return pathname === to || pathname.startsWith(`${to}/`)
}

export function AppShell({
  children,
  brand = 'NotioX Front Desk',
  subtitle,
}: {
  children: ReactNode
  brand?: string
  subtitle?: string
}) {
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  async function onSignOut() {
    await signOutOwner()
    navigate({ to: '/login' })
  }

  return (
    <div className="nx-shell">
      <header className="nx-topbar">
        <div>
          <div className="nx-topbar-brand">{brand}</div>
          {subtitle ? <div className="nx-topbar-sub">{subtitle}</div> : null}
        </div>
        <button type="button" className="nx-topbar-signout" onClick={onSignOut}>
          Sign out
        </button>
      </header>

      <main className="nx-main">{children}</main>

      <nav className="nx-tabbar" aria-label="Primary">
        {TABS.map((tab) => {
          const active = tabActive(pathname, tab.to)
          const Icon = tab.icon
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={active ? 'nx-tab nx-tab-active' : 'nx-tab'}
              aria-current={active ? 'page' : undefined}
            >
              <Icon active={active} />
              <span>{tab.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

function IconHome({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"
        stroke="currentColor"
        strokeWidth={active ? 2.2 : 1.7}
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconPeople({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth={active ? 2.2 : 1.7} />
      <path
        d="M3.5 19c.6-3 2.8-4.5 5.5-4.5S14 16 14.5 19"
        stroke="currentColor"
        strokeWidth={active ? 2.2 : 1.7}
        strokeLinecap="round"
      />
      <circle cx="17" cy="9" r="2.4" stroke="currentColor" strokeWidth={active ? 2.2 : 1.7} />
      <path
        d="M16 14.5c2 .2 3.6 1.4 4.2 4.5"
        stroke="currentColor"
        strokeWidth={active ? 2.2 : 1.7}
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconTasks({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="4"
        y="4"
        width="16"
        height="16"
        rx="3"
        stroke="currentColor"
        strokeWidth={active ? 2.2 : 1.7}
      />
      <path
        d="m8 12 2.5 2.5L16 9"
        stroke="currentColor"
        strokeWidth={active ? 2.2 : 1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconCode({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 7 3.5 12 8 17M16 7l4.5 5L16 17M13 5l-2 14"
        stroke="currentColor"
        strokeWidth={active ? 2.2 : 1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconMail({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="3.5"
        y="5.5"
        width="17"
        height="13"
        rx="2.5"
        stroke="currentColor"
        strokeWidth={active ? 2.2 : 1.7}
      />
      <path
        d="m5 8 7 5 7-5"
        stroke="currentColor"
        strokeWidth={active ? 2.2 : 1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconGear({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth={active ? 2.2 : 1.7} />
      <path
        d="M12 3.5v2.2M12 18.3v2.2M4.8 7.2l1.9 1.1M17.3 15.7l1.9 1.1M4.8 16.8l1.9-1.1M17.3 8.3l1.9-1.1"
        stroke="currentColor"
        strokeWidth={active ? 2.2 : 1.7}
        strokeLinecap="round"
      />
    </svg>
  )
}
