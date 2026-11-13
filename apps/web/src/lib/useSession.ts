import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, type Me } from './api'

type State =
  | { status: 'loading' }
  | { status: 'authenticated'; me: Me }
  | { status: 'anonymous' }
  | { status: 'error' }

export function useSession() {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    const ctrl = new AbortController()
    api
      .get<Me>('/me')
      .then((me) => !ctrl.signal.aborted && setState({ status: 'authenticated', me }))
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return
        setState({ status: err instanceof ApiError && err.status === 401 ? 'anonymous' : 'error' })
      })
    return () => ctrl.abort()
  }, [])

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {})
    window.location.assign('/')
  }, [])

  return { ...state, logout }
}
