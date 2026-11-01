import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env, hasSupabase } from './env'

let browserClient: SupabaseClient | null = null
let runtimeUrl: string | null = null
let runtimeAnon: string | null = null

/** Apply server-provided public Supabase config (fixes Vercel when only runtime env is set). */
export function configureSupabaseBrowser(url: string, anonKey: string) {
  if (!url || !anonKey) return
  if (runtimeUrl === url && runtimeAnon === anonKey && browserClient) return
  runtimeUrl = url
  runtimeAnon = anonKey
  browserClient = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
}

export function isSupabaseBrowserReady(): boolean {
  return Boolean(browserClient) || hasSupabase()
}

/** Browser Supabase client (anon key). No-op on the server. */
export function getSupabaseBrowser(): SupabaseClient | null {
  if (typeof window === 'undefined') return null
  if (browserClient) return browserClient
  if (!hasSupabase()) return null
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
