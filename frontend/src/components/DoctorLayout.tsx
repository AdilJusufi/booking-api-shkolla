import { Link, NavLink, Outlet, useMatch } from 'react-router-dom'
import { CalendarDays, CalendarOff, Clock, Moon, Search, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { DoctorSearchProvider, useDoctorSearch } from '../context/DoctorSearchContext'
import { initials } from './ui'
import Logo from './Logo'
import NotificationsBell from './NotificationsBell'
import UserMenu from './UserMenu'

export default function DoctorLayout() {
  return (
    <DoctorSearchProvider>
      <DoctorLayoutInner />
    </DoctorSearchProvider>
  )
}

function DoctorLayoutInner() {
  const { t } = useTranslation('doctor')
  const { t: tCommon } = useTranslation('common')
  const NAV_ITEMS = [
    { to: '/mjeku-panel/kalendari', icon: CalendarDays, label: t('layout.navCalendar') },
    { to: '/mjeku-panel/orari', icon: Clock, label: t('layout.navSchedule') },
    { to: '/mjeku-panel/mungesat', icon: CalendarOff, label: t('layout.navUnavailability') },
  ]
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
          <Logo variant="horizontal" size={26} />
        </Link>

        <div className="doctor-topbar__search">
          <Search size={15} strokeWidth={1.5} color="var(--muted)" />
          <input
            placeholder={t('layout.searchPatientPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="patient-topbar__right">
          <button
            type="button"
            className="theme-toggle"
            aria-label={theme === 'dark' ? tCommon('theme.switchToLight') : tCommon('theme.switchToDark')}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Sun size={18} strokeWidth={1.5} /> : <Moon size={18} strokeWidth={1.5} />}
          </button>
          <NotificationsBell triggerClassName="theme-toggle" size={20} />
          <UserMenu />
        </div>
      </header>

      <div className="doctor-breadcrumb">
        <span>{t('layout.breadcrumbPanel')}</span>
        <span>›</span>
        <span>{isSchedule ? t('layout.breadcrumbSchedule') : isCalendar ? t('layout.navCalendar') : t('layout.breadcrumbPanel')}</span>
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
