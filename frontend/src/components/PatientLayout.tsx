import { Link, NavLink, Outlet, useMatch } from 'react-router-dom'
import { Calendar, Lock, Moon, Sun, User, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { initials } from './ui'
import Logo from './Logo'
import UserMenu from './UserMenu'

export default function PatientLayout() {
  const { t } = useTranslation('patient')
  const { t: tCommon } = useTranslation('common')
  const NAV_ITEMS = [
    { to: '/terminet', icon: Calendar, label: t('layout.navAppointments'), end: false },
    { to: '/llogaria', icon: User, label: t('layout.navProfile'), end: true },
    { to: '/llogaria/anetaret', icon: Users, label: t('layout.navFamily'), end: false },
    { to: '/llogaria/fjalekalimi', icon: Lock, label: t('layout.navSecurity'), end: false },
  ]
  const { user } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const userInitials = user ? initials(user.firstName, user.lastName) : ''
  const isDetail = useMatch('/terminet/:id')
  const isProfile = useMatch('/llogaria')
  const isDependents = useMatch('/llogaria/anetaret')
  const isChangePassword = useMatch('/llogaria/fjalekalimi')

  return (
    <div className="patient-shell">
      <header className="patient-topbar">
        <Link to="/" className="brand">
          <Logo variant="horizontal" size={26} />
        </Link>

        <div className="patient-topbar__crumbs">
          <Link to="/llogaria">{t('layout.breadcrumbAccount')}</Link>
          <span>›</span>
          {isProfile ? (
            <span>{t('layout.breadcrumbMyProfile')}</span>
          ) : isDependents ? (
            <span>{t('layout.breadcrumbFamilyMembers')}</span>
          ) : isChangePassword ? (
            <span>{t('layout.breadcrumbSecurity')}</span>
          ) : isDetail ? (
            <>
              <Link to="/terminet">{t('layout.breadcrumbAppointments')}</Link>
              <span>›</span>
              <span>{t('layout.breadcrumbDetails')}</span>
            </>
          ) : (
            <span>{t('layout.breadcrumbAppointments')}</span>
          )}
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
          <UserMenu />
        </div>
      </header>

      <div className="patient-body">
        <aside className="patient-sidebar">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
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
            aria-label={theme === 'dark' ? tCommon('theme.switchToLight') : tCommon('theme.switchToDark')}
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
            end={item.end}
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
