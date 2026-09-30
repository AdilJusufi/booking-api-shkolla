import { registerSW } from 'virtual:pwa-register'

/**
 * Thin wrapper around the plugin's virtual registration module.
 *
 * It exists so the rest of the app never imports `virtual:pwa-register`
 * directly — that module only exists at build time, and keeping it behind one
 * seam means components stay testable and the registration side effect has a
 * single place to live.
 *
 * Registration uses the 'prompt' strategy (see vite.config.ts): a waiting
 * worker never activates on its own, because a silent reload could discard a
 * half-finished booking form. PwaUpdatePrompt decides when it is safe to
 * activate one without asking.
 */
export interface ServiceWorkerCallbacks {
  /** A new worker is installed and waiting. Ask the user before activating. */
  onNeedRefresh: () => void
  /** Precaching finished; the app will now start without a network. */
  onOfflineReady?: () => void
}

/** Activates the waiting worker and reloads the page. */
export type UpdateServiceWorker = (reloadPage?: boolean) => Promise<void>

export function registerServiceWorker(callbacks: ServiceWorkerCallbacks): UpdateServiceWorker {
  return registerSW({
    immediate: true,
    onNeedRefresh: callbacks.onNeedRefresh,
    onOfflineReady: callbacks.onOfflineReady,
    onRegisteredSW: (_swUrl, registration) => {
      if (registration) watchForUpdates(registration)
    },
  })
}

/** Background re-check while the app stays open. */
export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000
/** Floor between checks, so rapid tab/app switching doesn't refetch sw.js each time. */
export const MIN_CHECK_GAP_MS = 60 * 1000

/**
 * The browser only looks for a new sw.js on a real navigation. This is an SPA,
 * so in-app navigation never counts, and an installed PWA is usually resumed
 * from the background rather than relaunched. Without this, a patient could keep
 * running a build from weeks ago without ever being told a new one exists.
 *
 * Checks hourly and whenever the app comes back to the foreground. A check that
 * finds a new version installs it and ends in onNeedRefresh as usual. Returns a
 * cleanup function (used by tests; in the app the registration lives for the
 * whole page).
 */
export function watchForUpdates(
  registration: Pick<ServiceWorkerRegistration, 'update' | 'installing'>,
  now: () => number = Date.now,
): () => void {
  let lastCheck = now()

  const check = () => {
    if (registration.installing || !navigator.onLine) return
    if (now() - lastCheck < MIN_CHECK_GAP_MS) return
    lastCheck = now()
    // Offline or a failed fetch: the next check simply tries again.
    registration.update().catch(() => undefined)
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') check()
  }

  const timer = window.setInterval(check, UPDATE_CHECK_INTERVAL_MS)
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    window.clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
