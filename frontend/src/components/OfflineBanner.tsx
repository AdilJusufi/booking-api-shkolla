import { WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useOnlineStatus } from '../pwa/useOnlineStatus'

/**
 * Persistent bar shown while the device is offline.
 *
 * Without it, a patient whose booking silently fails has no way to tell an app
 * bug from a dead connection. It stays on screen for the whole offline period
 * rather than being a toast, because the condition persists.
 */
export default function OfflineBanner() {
  const { t } = useTranslation('common')
  const online = useOnlineStatus()
  if (online) return null

  return (
    <div className="offline-banner" role="status" aria-live="polite">
      <WifiOff size={15} strokeWidth={1.75} aria-hidden />
      <span>{t('offline.bannerMessage')}</span>
    </div>
  )
}
