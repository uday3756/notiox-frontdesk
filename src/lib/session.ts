/** Browser-only: current access token for owner-scoped server calls */
export async function getAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null
  const { getSupabaseBrowser } = await import('./supabase.browser')
  const sb = getSupabaseBrowser()
  if (!sb) return null
  const { data } = await sb.auth.getSession()
  return data.session?.access_token ?? null
}

export async function requireAccessToken(): Promise<string> {
  const token = await getAccessToken()
  if (!token) throw new Error('Not signed in')
  return token
}

export async function signOutOwner() {
  if (typeof window === 'undefined') return
  const { getSupabaseBrowser } = await import('./supabase.browser')
  const sb = getSupabaseBrowser()
  if (sb) await sb.auth.signOut()
}
