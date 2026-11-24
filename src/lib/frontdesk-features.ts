/** Front Desk feature toggles — mirrors Back Office `doctors.frontdesk_features`. */

export const FRONTDESK_FEATURE_KEYS = [
  'dashboard',
  'clients',
  'tasks',
  'codes',
  'email',
  'offerings',
  'calendar',
  'settings',
] as const

export type FrontdeskFeatureKey = (typeof FRONTDESK_FEATURE_KEYS)[number]

export type FrontdeskFeatures = Record<FrontdeskFeatureKey, boolean>

export const FEATURE_LABELS: Record<FrontdeskFeatureKey, string> = {
  dashboard: 'Dashboard',
  clients: 'Clients',
  tasks: 'Tasks',
  codes: 'Codes',
  email: 'Email',
  offerings: 'Offerings',
  calendar: 'Calendar',
  settings: 'Settings',
}

/** Route path → feature key (nav stays visible; gate shows locked panel). */
export const ROUTE_FEATURE: Record<string, FrontdeskFeatureKey> = {
  '/dashboard': 'dashboard',
  '/clients': 'clients',
  '/tasks': 'tasks',
  '/codes': 'codes',
  '/email': 'email',
  '/offerings': 'offerings',
  '/calendar': 'calendar',
  '/settings': 'settings',
}

export function emptyFrontdeskFeatures(on = false): FrontdeskFeatures {
  return {
    dashboard: on,
    clients: on,
    tasks: on,
    codes: on,
    email: on,
    offerings: on,
    calendar: on,
    settings: on,
  }
}

/** Missing or null key = OFF (matches Back Office normalize_frontdesk_features). */
export function normalizeFrontdeskFeatures(raw: unknown): FrontdeskFeatures {
  const src =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {}
  const out = emptyFrontdeskFeatures(false)
  for (const key of FRONTDESK_FEATURE_KEYS) {
    out[key] = src[key] === true
  }
  return out
}

export function featureForPath(pathname: string): FrontdeskFeatureKey | null {
  if (pathname === '/' || pathname === '/dashboard') return 'dashboard'
  for (const [prefix, key] of Object.entries(ROUTE_FEATURE)) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return key
  }
  return null
}
