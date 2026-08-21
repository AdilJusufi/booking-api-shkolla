import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronDown, LogOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import { useAuth } from '../context/AuthContext'
import { initials } from './ui'
import LanguageSwitcher from './LanguageSwitcher'

interface UserMenuProps {
  /** Pass true when the trigger sits on the always-dark sidebar. */
  onDark?: boolean
}

// The per-role item labels below read i18n.t() directly with an explicit ns,
// rather than useTranslation('patient'/'doctor'/'admin') — UserMenu renders
// inside every portal layout, and calling all three hooks unconditionally
// would force-load all three namespace chunks regardless of the signed-in
// user's actual role, defeating the point of the per-namespace split.
// Reading directly is safe here because only the branch matching the user's
// own role ever renders, and that role's own layout (PatientLayout,
// DoctorLayout, AdminLayout, SuperAdminLayout) already called useTranslation()
// for its namespace higher up the tree — main.tsx's <Suspense> guarantees
// UserMenu never renders as a child before that namespace has finished loading.
function tNs(ns: string, key: string): string {
  return i18n.t(key, { ns })
}

export default function UserMenu({ onDark = false }: UserMenuProps) {
  const { t } = useTranslation('common')
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (!user) return null

  const role = user.roles[0] ?? ''
  const userInitials = initials(user.firstName, user.lastName)

  function handleLogout() {
    logout()
    setOpen(false)
    navigate('/hyr')
  }

  function close() {
    setOpen(false)
  }

  const triggerClass = [
    'user-menu__trigger',
    onDark ? 'user-menu__trigger--on-dark' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="user-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClass}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('nav.accountMenu')}
      >
        <span className="patient-avatar" aria-hidden>{userInitials}</span>
        <span className="user-menu__name">{user.firstName} {user.lastName}</span>
        <ChevronDown size={14} strokeWidth={1.75} className={`user-menu__chevron ${open ? 'is-open' : ''}`} aria-hidden />
      </button>

      {open && (
        <div className="user-menu__panel" role="menu">
          <div className="user-menu__header" role="presentation">
            <span className="user-menu__header-name">{user.firstName} {user.lastName}</span>
            <span className="user-menu__header-email">{user.email}</span>
            {role && <span className="user-menu__header-role">{t(`roles.${role}`, { defaultValue: role })}</span>}
          </div>

          <div className="user-menu__items">
            {role === 'Patient' && (
              <>
                <Link to="/llogaria" className="user-menu__item" role="menuitem" onClick={close}>{tNs('patient', 'userMenu.myProfile')}</Link>
                <Link to="/llogaria/anetaret" className="user-menu__item" role="menuitem" onClick={close}>{tNs('patient', 'userMenu.familyMembers')}</Link>
                <Link to="/llogaria/fjalekalimi" className="user-menu__item" role="menuitem" onClick={close}>{tNs('patient', 'userMenu.changePassword')}</Link>
              </>
            )}
            {role === 'Doctor' && (
              <>
                <Link to="/mjeku-panel/orari" className="user-menu__item" role="menuitem" onClick={close}>{tNs('doctor', 'userMenu.mySchedule')}</Link>
                <Link to="/mjeku-panel/mungesat" className="user-menu__item" role="menuitem" onClick={close}>{tNs('doctor', 'userMenu.unavailability')}</Link>
              </>
            )}
            {role === 'ClinicAdmin' && (
              <Link to="/admin-panel/klinikat" className="user-menu__item" role="menuitem" onClick={close}>{tNs('admin', 'userMenu.myClinics')}</Link>
            )}
            {role === 'SuperAdmin' && (
              <>
                <Link to="/super-admin/klinikat" className="user-menu__item" role="menuitem" onClick={close}>{tNs('admin', 'userMenu.clinics')}</Link>
                <Link to="/super-admin/perdoruesit" className="user-menu__item" role="menuitem" onClick={close}>{tNs('admin', 'userMenu.users')}</Link>
              </>
            )}
          </div>

          <div className="user-menu__divider" role="separator" />
          <LanguageSwitcher variant="menu" onSelect={close} />
          <div className="user-menu__divider" role="separator" />
          <button
            type="button"
            className="user-menu__item user-menu__item--logout"
            role="menuitem"
            onClick={handleLogout}
          >
            <LogOut size={14} strokeWidth={1.5} aria-hidden />
            {t('nav.logout')}
          </button>
        </div>
      )}
    </div>
  )
}
