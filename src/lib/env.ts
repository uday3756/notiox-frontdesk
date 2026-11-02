/**
 * Central env access. Missing keys stay undefined — never invent secrets.
 */

function read(key: string): string | undefined {
  const fromProcess =
    typeof process !== 'undefined' ? process.env?.[key] : undefined
  const fromImport =
    typeof import.meta !== 'undefined'
      ? (import.meta.env as Record<string, string | undefined>)?.[key]
      : undefined
  const value = fromProcess ?? fromImport
  if (!value || value.startsWith('your-') || value.includes('YOUR_') || value.includes('xxxxxxxx')) {
    return value && !value.includes('YOUR_') && !value.startsWith('your-') && !value.includes('xxxxxxxx')
      ? value
      : undefined
  }
  return value
}

/** Soft read — returns placeholder-looking values for UI copy, not for API calls */
export function envSoft(key: string, fallback = ''): string {
  const fromProcess =
    typeof process !== 'undefined' ? process.env?.[key] : undefined
  const fromImport =
    typeof import.meta !== 'undefined'
      ? (import.meta.env as Record<string, string | undefined>)?.[key]
      : undefined
  return fromProcess || fromImport || fallback
}

function vercelPublicUrl(): string | undefined {
  const prod =
    typeof process !== 'undefined' ? process.env?.VERCEL_PROJECT_PRODUCTION_URL : undefined
  if (prod) return `https://${prod.replace(/^https?:\/\//, '').replace(/\/$/, '')}`
  const preview = typeof process !== 'undefined' ? process.env?.VERCEL_URL : undefined
  if (preview) return `https://${preview.replace(/^https?:\/\//, '').replace(/\/$/, '')}`
  return undefined
}

function isLocalHostUrl(url: string) {
  return /localhost|127\.0\.0\.1/i.test(url)
}

export const env = {
  appUrl: () => {
    const explicit = (envSoft('VITE_APP_URL') || envSoft('APP_URL') || '').replace(/\/$/, '')
    const vercel = vercelPublicUrl()
    if (explicit && !(vercel && isLocalHostUrl(explicit))) return explicit
    if (vercel) return vercel
    return explicit || 'http://localhost:3000'
  },
  appHost: () => envSoft('APP_HOST') || 'localhost:3000',
  allowedHosts: () =>
    (envSoft('ALLOWED_HOSTS') ||
      'localhost:3000,127.0.0.1:3000,notiox-frontdesk.vercel.app')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  notioxClientUrl: () =>
    envSoft('VITE_NOTIOX_CLIENT_URL') ||
    envSoft('NOTIOX_CLIENT_URL') ||
    'https://www.notiolive.com',
  supabaseUrl: () => read('VITE_SUPABASE_URL') || read('SUPABASE_URL'),
  supabaseAnonKey: () => read('VITE_SUPABASE_ANON_KEY') || read('SUPABASE_ANON_KEY'),
  supabaseServiceKey: () => read('SUPABASE_SERVICE_ROLE_KEY'),
  supabaseAuthRedirect: () =>
    envSoft('SUPABASE_AUTH_REDIRECT_URL') || `${envSoft('APP_URL', 'http://localhost:3000')}/auth/callback`,
  smtpHost: () => read('SMTP_HOST'),
  smtpPort: () => Number(envSoft('SMTP_PORT', '587')) || 587,
  smtpSecure: () => envSoft('SMTP_SECURE') === 'true',
  smtpUser: () => read('SMTP_USER'),
  smtpPass: () => read('SMTP_PASS'),
  smtpFrom: () => envSoft('SMTP_FROM') || envSoft('SMTP_USER'),
  smtpTestTo: () => read('SMTP_TEST_TO'),
  resendApiKey: () => read('RESEND_API_KEY'),
  resendFrom: () =>
    envSoft('RESEND_FROM') ||
    (envSoft('RESEND_FROM_EMAIL')
      ? `Front Desk <${envSoft('RESEND_FROM_EMAIL')}>`
      : 'Front Desk <no-reply@notiolive.com>'),
  /** OpenAI-compatible (Groq free tier: https://api.groq.com/openai/v1/chat/completions) */
  aiApiKey: () => read('AI_API_KEY') || read('GROQ_API_KEY') || read('OPENAI_API_KEY'),
  aiApiUrl: () =>
    envSoft('AI_API_URL', 'https://api.groq.com/openai/v1/chat/completions'),
  aiModel: () => envSoft('AI_MODEL', 'openai/gpt-oss-20b'),
  stripeSecret: () => read('STRIPE_SECRET_KEY'),
  stripePublishable: () =>
    read('VITE_STRIPE_PUBLISHABLE_KEY') || read('STRIPE_PUBLISHABLE_KEY'),
  stripeWebhookSecret: () => read('STRIPE_WEBHOOK_SECRET'),
  googleClientId: () => read('GOOGLE_CLIENT_ID') || read('VITE_GOOGLE_CLIENT_ID'),
  googleClientSecret: () => read('GOOGLE_CLIENT_SECRET'),
}

/** Keys required for authenticated owner data (anon + URL). Service role is optional server-only. */
export function missingKeys(): string[] {
  const required = [
    ['VITE_SUPABASE_URL / SUPABASE_URL', env.supabaseUrl()],
    ['VITE_SUPABASE_ANON_KEY / SUPABASE_ANON_KEY', env.supabaseAnonKey()],
  ] as const

  return required.filter(([, v]) => !v).map(([k]) => k)
}

/** Server-only ops (password reset, auth admin, optional client emails). */
export function missingServerKeys(): string[] {
  if (env.supabaseServiceKey()) return []
  return ['SUPABASE_SERVICE_ROLE_KEY (server-only — optional for dashboard; needed for password admin)']
}

export function hasSupabase(): boolean {
  return Boolean(env.supabaseUrl() && env.supabaseAnonKey())
}
