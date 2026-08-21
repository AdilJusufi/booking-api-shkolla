import { WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Logo from './Logo'

/**
 * Full-page state for when the app is opened with no connection at all.
 *
 * The app shell is precached, so a navigation while offline still boots React
 * rather than hitting the browser's own error page — but every screen needs the
 * API, so a cold offline launch would otherwise render an app-shaped shell full
 * of failed requests. This says plainly what is wrong and offers the one action
 * that can help.
 *
 * Deliberately not a "retry the last request" button: nothing has loaded yet,
 * so re-running the app is the honest recovery.
 */
export default function OfflineFallback({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation('common')
  return (
    <div className="offline-page">
      <span className="brand offline-page__brand">
        <span className="brand__mark" aria-hidden><Logo size={22} /></span>
        <span className="brand__name">{t('brand.name')}<span className="brand__tld">{t('brand.tld')}</span></span>
      </span>

      <div className="icon-circle icon-circle--danger">
        <WifiOff size={26} strokeWidth={1.5} />
      </div>

      <h1>{t('offline.pageTitle')}</h1>
      <p className="auth-sub">{t('offline.pageMessage')}</p>

      <button type="button" className="btn btn--primary" onClick={onRetry}>
        {t('buttons.retry')}
      </button>
    </div>
  )
}
