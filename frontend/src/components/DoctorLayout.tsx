import { Link, NavLink, Outlet, useMatch } from 'react-router-dom'
import { CalendarDays, CalendarOff, Clock, Moon, Search, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { DoctorSearchProvider, useDoctorSearch } from '../context/DoctorSearchContext'
import { DoctorProfileProvider, useDoctorProfile } from '../context/DoctorProfileContext'
import DoctorAvatar from './DoctorAvatar'
import Logo from './Logo'
import NotificationsBell from './NotificationsBell'
import UserMenu from './UserMenu'

export default function DoctorLayout() {
  return (
    <DoctorSearchProvider>
      <DoctorProfileProvider>
        <DoctorLayoutInner />
      </DoctorProfileProvider>
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
  const photoUrl = useDoctorProfile()?.profile?.photoUrl
  const isCalendar = useMatch('/mjeku-panel/kalendari')
  const isSchedule = useMatch('/mjeku-panel/orari')
  const isProfile = useMatch('/mjeku-panel/profili')

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
            className="theme-toggle hide-mobile"
            aria-label={theme === 'dark' ? tCommon('theme.switchToLight') : tCommon('theme.switchToDark')}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Sun size={18} strokeWidth={1.5} /> : <Moon size={18} strokeWidth={1.5} />}
          </button>
          <NotificationsBell triggerClassName="theme-toggle" size={20} />
          <UserMenu avatarPhotoUrl={photoUrl} />
        </div>
      </header>

      <div className="doctor-breadcrumb hide-mobile">
        <span>{t('layout.breadcrumbPanel')}</span>
        <span>›</span>
        <span>
          {isSchedule
            ? t('layout.breadcrumbSchedule')
            : isCalendar
              ? t('layout.navCalendar')
              : isProfile
                ? t('layout.breadcrumbProfile')
                : t('layout.breadcrumbPanel')}
        </span>
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

          {user && (
            <Link to="/mjeku-panel/profili" className="patient-sidebar__avatar-link" aria-label={t('userMenu.myProfile')}>
              <DoctorAvatar
                as="span"
                className="patient-avatar"
                firstName={user.firstName}
                lastName={user.lastName}
                photoUrl={photoUrl}
                displayPx={28}
              />
            </Link>
          )}
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
