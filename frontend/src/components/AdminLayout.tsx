import { Link, NavLink, Outlet } from 'react-router-dom'
import { Building2, CalendarDays, Moon, Plus, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../context/ThemeContext'
import { AdminBreadcrumbProvider, useAdminBreadcrumb } from '../context/AdminBreadcrumbContext'
import Logo from './Logo'
import NotificationsBell from './NotificationsBell'
import UserMenu from './UserMenu'

export default function AdminLayout() {
  return (
    <AdminBreadcrumbProvider>
      <AdminLayoutInner />
    </AdminBreadcrumbProvider>
  )
}

function AdminLayoutInner() {
  const { t } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
  const { theme, toggleTheme } = useTheme()
  const { trail } = useAdminBreadcrumb()
  const crumbs = trail.length > 0 ? trail : [t('layout.myClinicsBreadcrumbFallback')]

  return (
    <div className="admin-layout">
      <header className="admin-topbar">
        <div className="admin-topbar__left">
          <Logo variant="horizontal" size={20} />
          <span className="admin-breadcrumb hide-mobile">{[t('layout.panelBreadcrumb'), ...crumbs].join(' / ')}</span>
        </div>

        <div className="admin-topbar__right">
          <button
            type="button"
            className="admin-icon-btn hide-mobile"
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

      <main className="admin-content">
        {/* WR-02: the clinic's appointments must be reachable from the panel, on
            desktop and mobile; "Rezervo termin" sits where front-desk staff look. */}
        <nav className="admin-nav" aria-label={t('layout.panelBreadcrumb')}>
          <div className="clinic-tabs admin-nav__tabs">
            <NavLink to="/admin-panel/klinikat" className={({ isActive }) => `clinic-tab ${isActive ? 'is-active' : ''}`}>
              <Building2 size={16} strokeWidth={1.5} /> {t('layout.navClinics')}
            </NavLink>
            <NavLink to="/admin-panel/terminet" className={({ isActive }) => `clinic-tab ${isActive ? 'is-active' : ''}`}>
              <CalendarDays size={16} strokeWidth={1.5} /> {t('layout.navAppointments')}
            </NavLink>
          </div>
          <Link to="/admin-panel/terminet/rezervo" className="btn btn--primary btn--sm admin-nav__cta">
            <Plus size={15} strokeWidth={1.5} /> {t('layout.bookCta')}
          </Link>
        </nav>
        <Outlet />
      </main>
    </div>
  )
}
