import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface NotificationsBellProps {
  /** Matches the icon-button style already used in the surrounding topbar. */
  triggerClassName?: string
  size?: number
}

/**
 * There is no in-app notification system (no entity, endpoints or read state).
 * Until there is, the bell renders nothing at all — a "coming soon" control in
 * front of clinics advertises a feature that doesn't exist. Flip this flag when
 * the backend lands; the component below is kept ready for it.
 */
const NOTIFICATIONS_ENABLED = false

export default function NotificationsBell(props: NotificationsBellProps) {
  return NOTIFICATIONS_ENABLED ? <NotificationsBellInner {...props} /> : null
}

function NotificationsBellInner({ triggerClassName = 'admin-icon-btn', size = 18 }: NotificationsBellProps) {
  const { t } = useTranslation('common')
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

  return (
    <div className="notif-bell" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('notifications.aria')}
        onClick={() => setOpen((o) => !o)}
      >
        <Bell size={size} strokeWidth={1.5} />
      </button>

      {open && (
        <div className="notif-bell__panel" role="menu">
          <div className="notif-bell__header">{t('notifications.title')}</div>
          <div className="notif-bell__empty">
            <span className="notif-bell__empty-badge">{t('notifications.comingSoon')}</span>
            <p>{t('notifications.emptyState')}</p>
          </div>
        </div>
      )}
    </div>
  )
}
