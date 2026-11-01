import { env } from './env'

/**
 * White-label host allow-list.
 * - Static: ALLOWED_HOSTS env
 * - Dynamic: verified owners.custom_domain (passed in from DB when available)
 *
 * DNS for owners (documented in Settings):
 * 1. Create CNAME: custom-domain → your Front Desk deployment host (e.g. frontdesk.vercel.app)
 * 2. Add TXT (optional) for ownership verification
 * 3. Mark custom_domain_verified after DNS propagates
 * 4. Ensure hostname is in ALLOWED_HOSTS or verified in owners table
 */

export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/:\d+$/, (m, offset, s) => {
    // keep explicit non-default ports for local (3000/8081)
    if (s.startsWith('localhost') || s.startsWith('127.0.0.1')) return m
    return ''
  })
}

export function isHostAllowed(
  requestHost: string,
  verifiedCustomDomains: string[] = [],
): boolean {
  const host = requestHost.trim().toLowerCase()
  const allowed = new Set([
    ...env.allowedHosts().map((h) => h.toLowerCase()),
    ...verifiedCustomDomains.map((h) => h.toLowerCase()),
  ])

  if (allowed.has(host)) return true

  // Also allow host without port if env listed with port, and vice versa
  const bare = host.replace(/:\d+$/, '')
  for (const entry of allowed) {
    if (entry === bare || entry.replace(/:\d+$/, '') === bare) return true
  }
  return false
}

export const DNS_SETUP_STEPS = [
  {
    title: 'Point DNS',
    detail:
      'Create a CNAME record for your custom domain targeting the Front Desk deployment host (e.g. your Vercel preprod/prod hostname).',
  },
  {
    title: 'Wait for propagation',
    detail: 'DNS usually updates within minutes; can take up to 48 hours.',
  },
  {
    title: 'Verify ownership',
    detail:
      'In Settings, save the custom domain. Ops marks it verified after a successful host check (or you add it to ALLOWED_HOSTS).',
  },
  {
    title: 'Allow-list',
    detail:
      'Verified domains are served only if they appear in ALLOWED_HOSTS or owners.custom_domain with custom_domain_verified = true. Unknown hosts are rejected.',
  },
] as const
