import { Link, NavLink, Outlet, useMatch } from 'react-router-dom'
import { Bell, CalendarDays, CalendarOff, Clock, Moon, Search, Sun } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { DoctorSearchProvider, useDoctorSearch } from '../context/DoctorSearchContext'
import { initials } from './ui'
import Logo from './Logo'

const NAV_ITEMS = [
  { to: '/mjeku-panel/kalendari', icon: CalendarDays, label: 'Kalendari' },
  { to: '/mjeku-panel/orari', icon: Clock, label: 'Orari' },
  { to: '/mjeku-panel/mungesat', icon: CalendarOff, label: 'Mungesat' },
]

export default function DoctorLayout() {
  return (
    <DoctorSearchProvider>
      <DoctorLayoutInner />
    </DoctorSearchProvider>
  )
}

function DoctorLayoutInner() {
  const { user } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { searchTerm, setSearchTerm } = useDoctorSearch()
  const userInitials = user ? initials(user.firstName, user.lastName) : ''
  const isCalendar = useMatch('/mjeku-panel/kalendari')
  const isSchedule = useMatch('/mjeku-panel/orari')

  return (
    <div className="patient-shell">
      <header className="patient-topbar">
        <Link to="/" className="brand">
          <span className="brand__mark" aria-hidden><Logo size={22} /></span>
          <span className="brand__name">Termini<span className="brand__tld">.ks</span></span>
        </Link>

        <div className="doctor-topbar__search">
          <Search size={15} strokeWidth={1.5} color="var(--muted)" />
          <input
            placeholder="Kërko pacient..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
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
          <Bell size={20} strokeWidth={1.5} color="var(--muted)" />
          <span className="doctor-topbar__name">Dr. {user?.firstName} {user?.lastName}</span>
          <span className="patient-avatar" aria-hidden>{userInitials}</span>
        </div>
      </header>

      <div className="doctor-breadcrumb">
        <span>Paneli</span>
        <span>›</span>
        <span>{isSchedule ? 'Orari i punës' : isCalendar ? 'Kalendari' : 'Paneli'}</span>
      </div>

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
