import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env, hasSupabase } from './env'

/** Anon client for server fns when user JWT is available via header/cookie later */
export function getSupabaseServer(): SupabaseClient | null {
  if (!hasSupabase()) return null
  return createClient(env.supabaseUrl()!, env.supabaseAnonKey()!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Service role — bypasses RLS; use only in trusted server paths */
export function getSupabaseAdmin(): SupabaseClient | null {
  const url =
    (typeof process !== 'undefined' && process.env.SUPABASE_URL) || env.supabaseUrl()
  const key =
    (typeof process !== 'undefined' && process.env.SUPABASE_SERVICE_ROLE_KEY) ||
    env.supabaseServiceKey()
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
