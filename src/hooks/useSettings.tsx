import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

/** localStorage key under which the wisp app token is persisted. */
export const APP_TOKEN_KEY = 'wisp.appToken'

export interface Settings {
  /** The wisp app token; `''` when unset. */
  appToken: string
  /** Persist the app token (or clear it when passed `''`). */
  setAppToken: (token: string) => void
}

/** Read the persisted app token, tolerating unavailable storage. */
function readAppToken(): string {
  try {
    return localStorage.getItem(APP_TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

const SettingsContext = createContext<Settings | null>(null)

/** Wraps the app so descendants share one app-token state backed by storage. */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [appToken, setAppTokenState] = useState<string>(readAppToken)

  const setAppToken = useCallback((token: string) => {
    setAppTokenState(token)
    try {
      if (token) localStorage.setItem(APP_TOKEN_KEY, token)
      else localStorage.removeItem(APP_TOKEN_KEY)
    } catch {
      // Storage unavailable (private mode / disabled) — keep in-memory state.
    }
  }, [])

  const value = useMemo<Settings>(
    () => ({ appToken, setAppToken }),
    [appToken, setAppToken],
  )

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  )
}

/**
 * Access the wisp app-token settings. Must be used within `SettingsProvider`.
 * Reading an unset token yields `''`.
 */
export function useSettings(): Settings {
  const ctx = useContext(SettingsContext)
  if (!ctx) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return ctx
}
