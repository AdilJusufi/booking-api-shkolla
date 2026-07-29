import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, getRefreshToken, registerSessionExpiredHandler, setRefreshToken, setToken } from '../lib/api'
import type { AuthResponse, RegisterRequest } from '../lib/types'
import { useToast } from './ToastContext'

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
  // Return the freshly-authenticated user rather than relying on the caller
  // re-reading `user` — that's a stale closure until the next render, and the
  // post-login redirect needs the role immediately, in the same tick.
  login: (email: string, password: string) => Promise<AuthUser>
  register: (payload: RegisterRequest) => Promise<AuthUser>
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
  const { notify } = useToast()

  useEffect(() => {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
    else localStorage.removeItem(USER_KEY)
  }, [user])

  function applyAuth(res: AuthResponse): AuthUser {
    setToken(res.accessToken)
    setRefreshToken(res.refreshToken)
    const authUser: AuthUser = {
      userId: res.userId,
      firstName: res.firstName,
      lastName: res.lastName,
      email: res.email,
      roles: res.roles,
    }
    setUser(authUser)
    return authUser
  }

  function clearSession() {
    setToken(null)
    setRefreshToken(null)
    setUser(null)
  }

  // Lets lib/api.ts force a logout when a silent refresh fails (refresh token
  // itself expired or was revoked) — that module has no context access, so it
  // calls back through this registration instead. Clearing `user` here is
  // enough to make ProtectedRoute redirect to /hyr on its next render; the
  // toast is the one piece only this provider can show.
  useEffect(() => {
    function handleSessionExpired() {
      clearSession()
      notify('Sesioni juaj ka skaduar. Ju lutem hyni përsëri.', 'error')
    }
    registerSessionExpiredHandler(handleSessionExpired)
    return () => registerSessionExpiredHandler(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      login: async (email, password) => applyAuth(await api.login(email, password)),
      register: async (payload) => applyAuth(await api.register(payload)),
      logout: () => {
        const refreshToken = getRefreshToken()
        clearSession()
        // Best-effort — the user is logged out client-side regardless of
        // whether the server-side revoke succeeds.
        if (refreshToken) api.revokeToken(refreshToken).catch(() => undefined)
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
