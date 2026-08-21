import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { registerServiceWorker, type UpdateServiceWorker } from './registerServiceWorker'

/**
 * Registers the service worker and offers the user an explicit update.
 *
 * Deliberately not `autoUpdate`: activating a new worker reloads the page, and
 * doing that unannounced could wipe a half-filled booking form. The waiting
 * worker sits idle until the user chooses to take it.
 *
 * This uses its own surface rather than ToastContext because the message needs
 * an action and must not auto-dismiss — an update the user missed in four
 * seconds would leave them on stale code indefinitely.
 */
export default function PwaUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const updateSW = useRef<UpdateServiceWorker | null>(null)

  useEffect(() => {
    updateSW.current = registerServiceWorker({
      onNeedRefresh: () => setNeedRefresh(true),
    })
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
