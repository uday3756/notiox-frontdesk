import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env, hasSupabase } from './env'

let browserClient: SupabaseClient | null = null

/** Browser Supabase client (anon key). No-op on the server. */
export function getSupabaseBrowser(): SupabaseClient | null {
  if (typeof window === 'undefined') return null
  if (!hasSupabase()) return null
  if (browserClient) return browserClient
  const url = env.supabaseUrl()!
  const key = env.supabaseAnonKey()!
  browserClient = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
  return browserClient
}
