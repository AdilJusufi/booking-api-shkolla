import { Outlet } from 'react-router-dom'
import { Bell, Moon, Sun } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { AdminBreadcrumbProvider, useAdminBreadcrumb } from '../context/AdminBreadcrumbContext'
import { initials } from './ui'

export default function AdminLayout() {
  return (
    <AdminBreadcrumbProvider>
      <AdminLayoutInner />
    </AdminBreadcrumbProvider>
  )
}

function AdminLayoutInner() {
  const { user } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { trail } = useAdminBreadcrumb()
  const userInitials = user ? initials(user.firstName, user.lastName) : 'A'
  const crumbs = trail.length > 0 ? trail : ['Klinikat e mia']

  return (
    <div className="admin-layout">
      <header className="admin-topbar">
        <div className="admin-topbar__left">
          <span className="admin-breadcrumb">{['Paneli', ...crumbs].join(' / ')}</span>
          <span className="admin-brand">Termini<span className="admin-brand__tld">.ks</span></span>
        </div>

        <div className="admin-topbar__right">
          <button
            type="button"
            className="admin-icon-btn"
            aria-label={theme === 'dark' ? 'Kalo në temën e çelët' : 'Kalo në temën e errët'}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Sun size={18} strokeWidth={1.5} /> : <Moon size={18} strokeWidth={1.5} />}
          </button>
          <button type="button" className="admin-icon-btn" aria-label="Njoftimet">
            <Bell size={18} strokeWidth={1.5} />
          </button>
          <div className="admin-account">
            <span className="admin-avatar" aria-hidden>{userInitials}</span>
            <div className="admin-account__text">
              <span className="admin-account__label">
                {user ? `${user.firstName} ${user.lastName}` : 'Admin Paneli'}
              </span>
              <span className="admin-account__sub">Admin Klinikës</span>
            </div>
          </div>
        </div>
      </header>

      <main className="admin-content">
        <Outlet />
      </main>
    </div>
  )
}
