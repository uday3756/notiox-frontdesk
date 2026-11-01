import { createServerFn } from '@tanstack/react-start'

function clean(value: string | undefined): string | null {
  if (!value) return null
  if (value.startsWith('your-') || value.includes('YOUR_') || value.includes('xxxxxxxx')) {
    return null
  }
  return value
}

/**
 * Public (non-secret) config for the browser. Prefers process.env so Vercel
 * runtime env works even when VITE_* was missing at build time.
 * Anon key is designed to be public (RLS enforces access).
 */
export const getPublicConfig = createServerFn({ method: 'GET' }).handler(async () => {
  const supabaseUrl = clean(
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  )
  const supabaseAnonKey = clean(
    process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY,
  )
  return {
    supabaseUrl,
    supabaseAnonKey,
    notioxClientUrl:
      process.env.VITE_NOTIOX_CLIENT_URL ||
      process.env.NOTIOX_CLIENT_URL ||
      'https://www.notiolive.com',
    linked: Boolean(supabaseUrl && supabaseAnonKey),
  }
})
