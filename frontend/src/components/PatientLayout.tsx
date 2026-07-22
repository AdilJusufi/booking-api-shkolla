import { Link, NavLink, Outlet } from 'react-router-dom'
import { Calendar, Lock, Moon, Sun, User, Users } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { initials } from './ui'

const NAV_ITEMS = [
  { to: '/terminet', icon: Calendar, label: 'Terminet' },
  { to: '/llogaria', icon: User, label: 'Profili' },
  { to: '/llogaria/anetaret', icon: Users, label: 'Familja' },
  { to: '/llogaria/fjalekalimi', icon: Lock, label: 'Siguria' },
]

export default function PatientLayout() {
  const { user } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const userInitials = user ? initials(user.firstName, user.lastName) : ''

  return (
    <div className="patient-shell">
      <header className="patient-topbar">
        <Link to="/" className="brand">
          <span className="brand__mark" aria-hidden>＋</span>
          <span className="brand__name">Termini<span className="brand__tld">.ks</span></span>
        </Link>

        <div className="patient-topbar__crumbs">
          <Link to="/llogaria">Llogaria</Link>
          <span>›</span>
          <span>Terminet</span>
        </div>

        <div className="patient-topbar__right">
          <button
            type="button"
            className="theme-toggle"
            aria-label={theme === 'dark' ? 'Kalo në temën e çelët' : 'Kalo në temën e errët'}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Sun size={18} strokeWidth={1.5} /> : <Moon size={18} strokeWidth={1.5} />}
          </button>
          <span className="patient-avatar" aria-hidden>{userInitials}</span>
        </div>
      </header>

      <div className="patient-body">
        <aside className="patient-sidebar">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `patient-nav-item ${isActive ? 'is-active' : ''}`}
            >
              <item.icon className="patient-nav-item__icon" size={20} strokeWidth={1.5} aria-hidden />
              <span className="patient-nav-item__label">{item.label}</span>
            </NavLink>
          ))}

          <div className="patient-sidebar__spacer" />

          <button
            type="button"
            className="theme-toggle theme-toggle--on-dark"
            aria-label={theme === 'dark' ? 'Kalo në temën e çelët' : 'Kalo në temën e errët'}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Sun size={18} strokeWidth={1.5} /> : <Moon size={18} strokeWidth={1.5} />}
          </button>
          <span className="patient-avatar" aria-hidden>{userInitials}</span>
        </aside>

        <main className="patient-content">
          <Outlet />
        </main>
      </div>

      <nav className="patient-tabbar">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `patient-tabbar__item ${isActive ? 'is-active' : ''}`}
          >
            <item.icon size={20} strokeWidth={1.5} aria-hidden />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
