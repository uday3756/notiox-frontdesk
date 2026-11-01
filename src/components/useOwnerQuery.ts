import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { getAccessToken } from '~/lib/session'

type LoadState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: T }

/**
 * Client-side owner data loader: attaches Supabase access token so server
 * functions can resolve the doctors row and scope clients/codes to that owner.
 */
export function useOwnerQuery<T>(
  fetcher: (accessToken: string | undefined) => Promise<T>,
  opts?: { requireAuth?: boolean },
) {
  const navigate = useNavigate()
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' })

  const reload = useCallback(async () => {
    setState({ status: 'loading' })
    try {
      const token = (await getAccessToken()) || undefined
      if (opts?.requireAuth && !token) {
        navigate({ to: '/login' })
        return
      }
      const data = await fetcher(token)
      setState({ status: 'ready', data })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load'
      if (opts?.requireAuth && /sign|auth|owner|session|login/i.test(message)) {
        navigate({ to: '/login' })
        return
      }
      setState({ status: 'error', message })
    }
  }, [fetcher, navigate, opts?.requireAuth])

  useEffect(() => {
    void reload()
  }, [reload])

  return { ...state, reload }
}
