import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, setToken } from '../lib/api'
import type { AuthResponse, RegisterRequest } from '../lib/types'

interface AuthUser {
  userId: string
  firstName: string
  lastName: string
  email: string
  roles: string[]
}

interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  register: (payload: RegisterRequest) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const USER_KEY = 'termini.user'

function loadUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(loadUser)

  useEffect(() => {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
    else localStorage.removeItem(USER_KEY)
  }, [user])

  function applyAuth(res: AuthResponse) {
    setToken(res.accessToken)
    setUser({
      userId: res.userId,
      firstName: res.firstName,
      lastName: res.lastName,
      email: res.email,
      roles: res.roles,
    })
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      login: async (email, password) => applyAuth(await api.login(email, password)),
      register: async (payload) => applyAuth(await api.register(payload)),
      logout: () => {
        setToken(null)
        setUser(null)
      },
    }),
    [user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth duhet përdorur brenda AuthProvider')
  return ctx
}
