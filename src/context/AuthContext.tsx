import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Role, User } from '../types'
import { api, getToken, setToken } from '../lib/api'

interface AuthContextValue {
  user: User | null
  loading: boolean
  signIn: (account: string, password: string, role: Role) => Promise<User>
  demoSignIn: (role: Role) => Promise<User>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    if (!getToken()) {
      setLoading(false)
      return
    }
    api
      .me()
      .then(({ user: current }) => {
        if (alive) setUser(current)
      })
      .catch(() => {
        setToken('')
        if (alive) setUser(null)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const handleExpired = () => {
      setToken('')
      setUser(null)
    }
    window.addEventListener('zhihui:auth-expired', handleExpired)
    return () => window.removeEventListener('zhihui:auth-expired', handleExpired)
  }, [])

  const signIn = useCallback(async (account: string, password: string, role: Role) => {
    const result = await api.login(account, password, role)
    setToken(result.token)
    setUser(result.user)
    return result.user
  }, [])

  const demoSignIn = useCallback(async (role: Role) => {
    const result = await api.demo(role)
    setToken(result.token)
    setUser(result.user)
    return result.user
  }, [])

  const signOut = useCallback(async () => {
    try {
      await api.logout()
    } catch {
      // Local state should still be cleared if the demo API is unavailable.
    }
    setToken('')
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, loading, signIn, demoSignIn, signOut }),
    [user, loading, signIn, demoSignIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
