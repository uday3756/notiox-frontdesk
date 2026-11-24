import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  emptyFrontdeskFeatures,
  normalizeFrontdeskFeatures,
  type FrontdeskFeatures,
} from '~/lib/frontdesk-features'
import { getAccessToken } from '~/lib/session'
import { getBootstrap } from '~/server/data'

type FeaturesState =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; features: FrontdeskFeatures }
  | { status: 'error'; message: string; features: FrontdeskFeatures }

type FeaturesContextValue = FeaturesState & {
  reload: () => Promise<void>
  isEnabled: (key: keyof FrontdeskFeatures) => boolean
}

const FeaturesContext = createContext<FeaturesContextValue | null>(null)

/**
 * Loads `doctors.frontdesk_features` for the signed-in owner (via bootstrap /
 * RLS `user_id = auth.uid()`). Missing session → idle (login / public routes).
 */
export function FeaturesProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FeaturesState>({ status: 'idle' })

  const reload = useCallback(async () => {
    const token = await getAccessToken()
    if (!token) {
      setState({ status: 'idle' })
      return
    }
    setState({ status: 'loading' })
    try {
      const boot = await getBootstrap({ data: { accessToken: token } })
      const features = normalizeFrontdeskFeatures(
        'features' in boot ? boot.features : undefined,
      )
      setState({ status: 'ready', features })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load features'
      setState({
        status: 'error',
        message,
        features: emptyFrontdeskFeatures(false),
      })
    }
  }, [])

  useEffect(() => {
    void reload()
    if (typeof window === 'undefined') return

    const onFocus = () => {
      void reload()
    }
    window.addEventListener('focus', onFocus)

    let unsub: (() => void) | undefined
    void import('~/lib/supabase.browser').then(({ getSupabaseBrowser }) => {
      const sb = getSupabaseBrowser()
      if (!sb) return
      const { data } = sb.auth.onAuthStateChange(() => {
        void reload()
      })
      unsub = () => data.subscription.unsubscribe()
    })

    return () => {
      window.removeEventListener('focus', onFocus)
      unsub?.()
    }
  }, [reload])

  const value = useMemo<FeaturesContextValue>(() => {
    const features =
      state.status === 'ready' || state.status === 'error'
        ? state.features
        : emptyFrontdeskFeatures(false)
    return {
      ...state,
      reload,
      isEnabled: (key) => features[key] === true,
    }
  }, [state, reload])

  return <FeaturesContext.Provider value={value}>{children}</FeaturesContext.Provider>
}

export function useFrontdeskFeatures(): FeaturesContextValue {
  const ctx = useContext(FeaturesContext)
  if (!ctx) {
    return {
      status: 'idle',
      reload: async () => {},
      isEnabled: () => false,
    }
  }
  return ctx
}
