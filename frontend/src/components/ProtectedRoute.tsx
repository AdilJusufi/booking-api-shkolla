import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'

/** Where each role's portal actually starts — used whenever we need to bounce
 * a signed-in user somewhere sensible instead of the generic homepage. */
export const ROLE_HOME: Record<string, string> = {
  Patient: '/terminet',
  Doctor: '/mjeku-panel/kalendari',
  ClinicAdmin: '/admin-panel/klinikat',
  SuperAdmin: '/super-admin/klinikat',
}

export default function ProtectedRoute({ children, role }: { children: ReactNode; role?: string }) {
  const { isAuthenticated, user } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/hyr" state={{ from: location.pathname }} replace />
  }
  if (role && !user?.roles.includes(role)) {
    // Wrong portal for this account — send them to the one their role
    // actually has access to, rather than a login-adjacent dead end.
    const ownRole = user?.roles.find((r) => ROLE_HOME[r])
    return <Navigate to={(ownRole && ROLE_HOME[ownRole]) ?? '/'} replace />
  }
  return <>{children}</>
}
