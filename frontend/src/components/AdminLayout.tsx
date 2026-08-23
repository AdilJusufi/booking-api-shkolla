import { Outlet } from 'react-router-dom'
import { Bell, Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../context/ThemeContext'
import { AdminBreadcrumbProvider, useAdminBreadcrumb } from '../context/AdminBreadcrumbContext'
import Logo from './Logo'
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
          <span className="admin-breadcrumb">{[t('layout.panelBreadcrumb'), ...crumbs].join(' / ')}</span>
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
          <button type="button" className="admin-icon-btn" aria-label={t('layout.notificationsAria')}>
            <Bell size={18} strokeWidth={1.5} />
          </button>
          <div className="admin-account">
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="admin-content">
        <Outlet />
      </main>
    </div>
  )
}
