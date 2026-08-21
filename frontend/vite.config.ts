/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import type { RuntimeCaching } from 'workbox-build'
import { runtimeCaching } from './src/pwa/runtimeCaching'

// FE-ja niset në http://localhost:5173 (i lejuar tashmë në CORS të backend-it).
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt', not 'autoUpdate': a silent reload mid-session could wipe a
      // half-filled booking form. The user is asked first — see PwaUpdatePrompt.
      registerType: 'prompt',
      // Registration is done explicitly from src/pwa/registerServiceWorker.ts so
      // the update prompt can hook into it; don't let the plugin inject its own.
      injectRegister: null,

      // No `includeAssets`, and manifest icons are not re-added: the
      // globPatterns below already sweep every png/svg/ico in public/. Listing
      // them again only puts duplicate entries in the precache manifest.
      includeManifestIcons: false,

      manifest: {
        name: 'Rezervo Mjekun — Gjeni mjekun e duhur',
        short_name: 'Rezervo Mjekun',
        description: 'Gjeni mjekun e duhur dhe rezervoni terminin tuaj në sekonda.',
        lang: 'sq',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        // Static install-time default. The runtime <meta name="theme-color">
        // is updated from ThemeContext so the status bar follows the active theme.
        theme_color: '#12796e',
        categories: ['medical', 'health', 'productivity'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },

      workbox: {
        // App shell precache — instant launch, and what makes navigations work offline.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        cleanupOutdatedCaches: true,
        // SPA: any navigation resolves to the precached shell, so the app boots
        // offline and can render its own Albanian offline UI (see OfflineGate).
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],

        // Rules live in src/pwa/runtimeCaching.ts as a single source of truth so
        // they can be unit-tested directly (runtimeCaching.test.ts). Read the
        // header comment there before changing anything: the ordering of the
        // deny rules is what keeps patient data off disk.
        runtimeCaching: runtimeCaching as unknown as RuntimeCaching[],
      },

      // The service worker is verified with `npm run build && npm run preview`
      // rather than in `vite dev`, where an active SW competes with HMR.
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    open: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    alias: {
      // The plugin's virtual module has no implementation under Vitest.
      'virtual:pwa-register': new URL('./src/test/stubs/pwa-register.ts', import.meta.url).pathname,
    },
  },
})
