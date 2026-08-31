import { NavLink, Outlet } from 'react-router-dom'
import { Building2, ClipboardList, Moon, Stethoscope, Sun, User } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../context/ThemeContext'
import Logo from './Logo'
import NotificationsBell from './NotificationsBell'
import UserMenu from './UserMenu'

export default function SuperAdminLayout() {
  const { t } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
  const { theme, toggleTheme } = useTheme()

  const NAV_ITEMS = [
    { to: '/super-admin/klinikat', icon: Building2, label: t('layout.navClinics') },
    { to: '/super-admin/specializimet', icon: Stethoscope, label: t('layout.navSpecialties') },
    { to: '/super-admin/perdoruesit', icon: User, label: t('layout.navUsers') },
    { to: '/super-admin/regjistrat', icon: ClipboardList, label: t('layout.navAuditLogs') },
  ]

  return (
    <div className="admin-layout">
      <header className="admin-topbar">
        <div className="admin-topbar__left">
          <Logo variant="horizontal" size={20} />
          <span className="admin-breadcrumb">{t('layout.superAdminBreadcrumb')}</span>
        </div>

        <div className="admin-topbar__right">
          <button
            type="button"
            className="admin-icon-btn"
            aria-label={theme === 'dark' ? tCommon('theme.switchToLight') : tCommon('theme.switchToDark')}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Sun size={18} strokeWidth={1.5} /> : <Moon size={18} strokeWidth={1.5} />}
          </button>
          <NotificationsBell />
          <div className="admin-account">
            <UserMenu />
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
