import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { MeResponse } from '@guardian-book/shared'
import { me as fetchMe } from '../api/auth'
import { ApiRequestError } from '../api/client'

/**
 * Who is signed in, fetched once from `/api/me` and refreshed after any change to the
 * circle. `status` is explicit so screens never guess from a null.
 */
export type MeState =
  | { status: 'loading'; me: null }
  | { status: 'anonymous'; me: null }
  | { status: 'ready'; me: MeResponse }
  | { status: 'unavailable'; me: null; message: string }

interface MeContextValue {
  state: MeState
  refresh(): Promise<void>
  clear(): void
}

const MeContext = createContext<MeContextValue | null>(null)

async function resolveMe(): Promise<MeState> {
  try {
    const me = await fetchMe()
    return { status: 'ready', me }
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 401) return { status: 'anonymous', me: null }
    if (err instanceof ApiRequestError && err.status === 503) {
      return { status: 'unavailable', me: null, message: 'Accounts are not configured on this server yet.' }
    }
    return { status: 'unavailable', me: null, message: 'Could not reach the server. Try again.' }
  }
}

export function MeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MeState>({ status: 'loading', me: null })

  useEffect(() => {
    let cancelled = false
    resolveMe().then((next) => {
      if (!cancelled) setState(next)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const refresh = useCallback(async () => {
    setState(await resolveMe())
  }, [])

  const value = useMemo<MeContextValue>(
    () => ({ state, refresh, clear: () => setState({ status: 'anonymous', me: null }) }),
    [state, refresh],
  )
  return <MeContext.Provider value={value}>{children}</MeContext.Provider>
}

export function useMe(): MeContextValue {
  const value = useContext(MeContext)
  if (!value) throw new Error('useMe needs a MeProvider')
  return value
}
