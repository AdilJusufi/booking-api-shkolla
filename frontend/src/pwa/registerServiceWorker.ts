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
 * half-finished booking form.
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
  })
}
