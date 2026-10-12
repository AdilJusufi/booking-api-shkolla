import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { registerServiceWorker, type UpdateServiceWorker } from './registerServiceWorker'

/** Anything that could have started state a reload would lose. */
const INTERACTION_EVENTS = ['pointerdown', 'keydown'] as const

/**
 * Registers the service worker and activates new versions.
 *
 * Deliberately not `autoUpdate`: activating a new worker reloads the page, and
 * doing that unannounced could wipe a half-filled booking form. So:
 *  - Update found before the user has touched the page (the usual case: a
 *    launch or reload with a worker already waiting) → applied at once. There
 *    is nothing to lose yet. Without this, a reload never picks up the update:
 *    a waiting worker only activates once every tab is closed, which an
 *    installed PWA that lives in the background may never do.
 *  - Update found mid-session → the user is asked, as before.
 *
 * This uses its own surface rather than ToastContext because the message needs
 * an action and must not auto-dismiss — an update the user missed in four
 * seconds would leave them on stale code for the rest of the session.
 */
export default function PwaUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const updateSW = useRef<UpdateServiceWorker | null>(null)
  const interacted = useRef(false)

  useEffect(() => {
    // Listening starts before registration, so an update can never be judged
    // "untouched" after the user has already started typing.
    const markInteracted = () => {
      interacted.current = true
      INTERACTION_EVENTS.forEach((e) => document.removeEventListener(e, markInteracted, true))
    }
    INTERACTION_EVENTS.forEach((e) => document.addEventListener(e, markInteracted, true))

    updateSW.current = registerServiceWorker({
      onNeedRefresh: () => {
        setNeedRefresh(true)
        if (!interacted.current) {
          setRefreshing(true)
          void updateSW.current?.(true)
        }
      },
    })

    return () => INTERACTION_EVENTS.forEach((e) => document.removeEventListener(e, markInteracted, true))
  }, [])

  const applyUpdate = useCallback(() => {
    setRefreshing(true)
    // `true` activates the waiting worker and reloads once it takes control.
    void updateSW.current?.(true)
  }, [])

  if (!needRefresh) return null

  return (
    <div className="pwa-update" role="status" aria-live="polite">
      <span className="pwa-update__text">Një version i ri është i disponueshëm.</span>
      <button type="button" className="pwa-update__action" disabled={refreshing} onClick={applyUpdate}>
        <RefreshCw size={14} strokeWidth={1.75} aria-hidden />
        {refreshing ? 'Duke rifreskuar…' : 'Rifresko'}
      </button>
      <button
        type="button"
        className="pwa-update__dismiss"
        aria-label="Mbyll njoftimin"
        onClick={() => setNeedRefresh(false)}
      >
        <X size={15} strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  )
}
