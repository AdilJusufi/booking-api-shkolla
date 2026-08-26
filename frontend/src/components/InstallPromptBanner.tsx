import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Download, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Modal } from './ui'
import { useTheme } from '../context/ThemeContext'
import {
  isInstallPromptSuppressed,
  isInstalled,
  isIosDevice,
  type BeforeInstallPromptEvent,
} from '../pwa/installPrompt'

const DISMISSED_KEY = 'rezervo.pwa.installDismissedThisSession'

/**
 * Session-scoped, not persistent: the whole point of "every visit" is that a
 * dismissal does not become a permanent opt-out. sessionStorage clears itself
 * when the tab closes, which is exactly the "visit" boundary this needs —
 * unlike a plain useState, it also survives an in-session hard refresh
 * without reappearing three times as the user reloads or changes routes.
 */
function dismissedThisSession(): boolean {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

function markDismissedThisSession() {
  try {
    sessionStorage.setItem(DISMISSED_KEY, '1')
  } catch {
    // Private-browsing contexts can throw on sessionStorage writes — the
    // banner simply re-renders on the next route change instead, which is no
    // worse than not remembering the dismissal at all.
  }
}

/**
 * Install messaging shown on every visit, with identical content regardless
 * of platform — only what happens on click differs:
 *  - Android/desktop Chrome that has captured `beforeinstallprompt`: the real
 *    native install dialog.
 *  - Everything else (iOS, Firefox, or Chrome that suppressed re-firing the
 *    event this visit): a small instructions modal, since no programmatic
 *    install API exists there. The modal is platform-detected — iOS gets its
 *    own numbered Share-sheet steps rather than the generic browser-menu
 *    wording, since "check your browser menu" leaves an iOS user stuck.
 *
 * Deliberately not wrapped in a delay or engagement check: the brief was
 * explicit that this shows immediately, every visit — the trade-off being
 * made on purpose is "a missed install opportunity is worse than one more
 * dismissible banner," not the other way around.
 */
export default function InstallPromptBanner() {
  const { t } = useTranslation('common')
  const { pathname } = useLocation()
  const { theme } = useTheme()

  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(dismissedThisSession)
  const [justInstalled, setJustInstalled] = useState(false)
  const [instructionsOpen, setInstructionsOpen] = useState(false)

  useEffect(() => {
    function capture(event: Event) {
      // Suppresses Chromium's own mini-infobar so this banner stays the one
      // consistent install surface, rather than two competing prompts.
      event.preventDefault()
      setDeferredEvent(event as BeforeInstallPromptEvent)
    }
    function onInstalled() {
      setDeferredEvent(null)
      setJustInstalled(true)
    }
    window.addEventListener('beforeinstallprompt', capture)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', capture)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const dismiss = useCallback(() => {
    markDismissedThisSession()
    setDismissed(true)
    setInstructionsOpen(false)
  }, [])

  const install = useCallback(async () => {
    if (!deferredEvent) {
      // No programmatic API on this browser (or the captured event was
      // already spent) — the only honest action left is to show the manual
      // steps instead of doing nothing.
      setInstructionsOpen(true)
      return
    }
    await deferredEvent.prompt()
    const { outcome } = await deferredEvent.userChoice
    // Single-use regardless of outcome — Chrome will not re-fire it this
    // visit either way. On acceptance the app is about to become installed,
    // so hide for the session; on the user's own dismissal, keep the bar so
    // a second click can still fall through to manual instructions instead
    // of silently doing nothing.
    setDeferredEvent(null)
    if (outcome === 'accepted') {
      markDismissedThisSession()
      setDismissed(true)
    }
  }, [deferredEvent])

  if (justInstalled || dismissed || isInstalled() || isInstallPromptSuppressed(pathname)) {
    return null
  }

  const ios = isIosDevice()
  const iconSrc = theme === 'dark' ? '/icon/icon-dark-theme.svg' : '/icon/icon-teal.svg'

  return (
    <>
      <div className="pwa-install" role="status" aria-live="polite">
        <img className="pwa-install__icon" src={iconSrc} alt="" width={36} height={36} aria-hidden />

        <div className="pwa-install__body">
          <span className="pwa-install__text">{t('pwaInstall.text')}</span>
        </div>

        <button type="button" className="pwa-install__action" onClick={() => void install()}>
          <Download size={14} strokeWidth={1.75} aria-hidden />
          {t('pwaInstall.installCta')}
        </button>

        <button
          type="button"
          className="pwa-install__dismiss"
          aria-label={t('pwaInstall.dismissAria')}
          onClick={dismiss}
        >
          <X size={15} strokeWidth={1.75} aria-hidden />
        </button>
      </div>

      {instructionsOpen && (
        <Modal
          title={ios ? t('pwaInstall.modal.iosTitle') : t('pwaInstall.modal.genericTitle')}
          onClose={() => setInstructionsOpen(false)}
        >
          {ios ? (
            <ol className="pwa-install__steps">
              <li>{t('pwaInstall.modal.iosStep1')}</li>
              <li>{t('pwaInstall.modal.iosStep2')}</li>
              <li>{t('pwaInstall.modal.iosStep3')}</li>
            </ol>
          ) : (
            <p>{t('pwaInstall.modal.genericText')}</p>
          )}
        </Modal>
      )}
    </>
  )
}
