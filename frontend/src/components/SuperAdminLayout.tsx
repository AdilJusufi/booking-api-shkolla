import { NavLink, Outlet } from 'react-router-dom'
import { Bell, Building2, ClipboardList, Moon, Stethoscope, Sun, User } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { initials } from './ui'

const NAV_ITEMS = [
  { to: '/super-admin/klinikat', icon: Building2, label: 'Klinikat' },
  { to: '/super-admin/specializimet', icon: Stethoscope, label: 'Specializimet' },
  { to: '/super-admin/perdoruesit', icon: User, label: 'Përdoruesit' },
  { to: '/super-admin/regjistrat', icon: ClipboardList, label: 'Regjistrat' },
]

export default function SuperAdminLayout() {
  const { user } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const userInitials = user ? initials(user.firstName, user.lastName) : 'SA'

  return (
    <div className="admin-layout">
      <header className="admin-topbar">
        <div className="admin-topbar__left">
          <span className="admin-breadcrumb">Paneli / Super Admin</span>
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
                {user ? `${user.firstName} ${user.lastName}` : 'Super Admin'}
              </span>
              <span className="admin-account__sub">Super Admin</span>
            </div>
          </div>
        </div>
      </header>

      <div className="admin-content">
        <nav className="clinic-tabs" style={{ marginBottom: 24 }}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `clinic-tab ${isActive ? 'is-active' : ''}`}
            >
              <item.icon size={16} strokeWidth={1.5} /> {item.label}
            </NavLink>
          ))}
        </nav>

        <Outlet />
      </div>
    </div>
  )
}
