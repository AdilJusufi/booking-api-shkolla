import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Share, X } from 'lucide-react'

/** Chromium's install event. Not in lib.dom, so it is declared here. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_KEY = 'rezervo.pwa.installDismissed'

interface InstallPromptContextValue {
  /**
   * Signals that the app has just demonstrably been useful, which is when it
   * is reasonable to ask about installing. Called after a completed booking —
   * not on first visit, where an install prompt is noise from an app the user
   * has no reason to trust yet.
   */
  requestInstallOffer: () => void
}

const InstallPromptContext = createContext<InstallPromptContextValue | null>(null)

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    // iOS Safari's non-standard flag for home-screen launches.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** iOS has no install event: the user must go through Share → Add to Home Screen. */
function isIosBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const iosDevice = /iphone|ipad|ipod/i.test(ua)
  // iPadOS 13+ reports itself as a Mac; the touch-point check separates it from a desktop.
  const iPadOS = /macintosh/i.test(ua) && navigator.maxTouchPoints > 1
  return iosDevice || iPadOS
}

export function InstallPromptProvider({ children }: { children: ReactNode }) {
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [offering, setOffering] = useState(false)

  useEffect(() => {
    function capture(event: Event) {
      // Suppress Chromium's own mini-infobar so the offer can be made at a
      // moment of our choosing instead of on arrival.
      event.preventDefault()
      setDeferredEvent(event as BeforeInstallPromptEvent)
    }
    function onInstalled() {
      setDeferredEvent(null)
      setOffering(false)
    }
    window.addEventListener('beforeinstallprompt', capture)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', capture)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const requestInstallOffer = useCallback(() => {
    if (isStandalone()) return
    if (localStorage.getItem(DISMISSED_KEY) === '1') return
    setOffering(true)
  }, [])

  const dismiss = useCallback(() => {
    // Persisted, so a declined offer does not reappear on every visit.
    localStorage.setItem(DISMISSED_KEY, '1')
    setOffering(false)
  }, [])

  const install = useCallback(async () => {
    if (!deferredEvent) return
    setOffering(false)
    await deferredEvent.prompt()
    // The event is single-use; drop it whatever the user chose.
    setDeferredEvent(null)
    localStorage.setItem(DISMISSED_KEY, '1')
  }, [deferredEvent])

  const value = useMemo(() => ({ requestInstallOffer }), [requestInstallOffer])

  const ios = isIosBrowser()
  // Android/desktop need a captured event; iOS can only ever be given instructions.
  const visible = offering && (deferredEvent !== null || ios)

  return (
    <InstallPromptContext.Provider value={value}>
      {children}
      {visible && (
        <div className="pwa-install" role="dialog" aria-label="Instalo aplikacionin">
          <div className="pwa-install__body">
            <span className="pwa-install__title">Shtoje Rezervo Mjekun në ekranin bazë</span>
            {deferredEvent ? (
              <span className="pwa-install__text">
                Hapeni terminet tuaja me një prekje, pa hapur shfletuesin.
              </span>
            ) : (
              <span className="pwa-install__text">
                Prekni <Share size={13} strokeWidth={1.75} aria-label="Share" /> në shfletues, pastaj
                “Add to Home Screen”.
              </span>
            )}
          </div>
          {deferredEvent && (
            <button type="button" className="pwa-install__action" onClick={() => void install()}>
              Instalo
            </button>
          )}
          <button type="button" className="pwa-install__dismiss" aria-label="Mbyll" onClick={dismiss}>
            <X size={15} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
      )}
    </InstallPromptContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useInstallPrompt(): InstallPromptContextValue {
  const ctx = useContext(InstallPromptContext)
  if (!ctx) throw new Error('useInstallPrompt duhet përdorur brenda InstallPromptProvider')
  return ctx
}
