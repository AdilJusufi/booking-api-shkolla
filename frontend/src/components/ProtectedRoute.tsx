import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children, role }: { children: ReactNode; role?: string }) {
  const { isAuthenticated, user } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/hyr" state={{ from: location.pathname }} replace />
  }
  if (role && !user?.roles.includes(role)) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}
