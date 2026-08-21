// Stand-in for the `virtual:pwa-register` module that vite-plugin-pwa provides
// at build time. Under Vitest that virtual module does not exist, so
// vite.config.ts aliases it here.
//
// It is intentionally inert: service worker behaviour cannot be exercised in
// jsdom, so tests drive the update flow through the callbacks on
// registerServiceWorker() instead of through a real worker.
export interface RegisterSWOptions {
  immediate?: boolean
  onNeedRefresh?: () => void
  onOfflineReady?: () => void
  onRegisteredSW?: (swScriptUrl: string, registration: ServiceWorkerRegistration | undefined) => void
  onRegisterError?: (error: unknown) => void
}

export function registerSW(_options: RegisterSWOptions = {}): (reloadPage?: boolean) => Promise<void> {
  return async () => undefined
}
