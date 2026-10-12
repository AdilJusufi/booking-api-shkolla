import React, { Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { ThemeProvider } from './context/ThemeContext'
import { SpecialtyNamesProvider } from './context/SpecialtyNamesContext'
import OfflineBanner from './components/OfflineBanner'
import InstallPromptBanner from './components/InstallPromptBanner'
import EnvironmentBadge from './components/EnvironmentBadge'
import ConfigErrorPage from './components/ConfigErrorPage'
import PwaUpdatePrompt from './pwa/PwaUpdatePrompt'
import SuspenseOverlay from './components/SuspenseOverlay'
import './i18n'
import './styles/index.css'

// Only a real `vite build` output can hit this — `vite dev` and tests always
// have VITE_API_URL via .env.development or a fallback (see lib/api.ts). A
// deployed build without it would otherwise silently try to reach whatever
// lib/api.ts falls back to, which is exactly the "which environment am I
// even talking to" mixup this whole check exists to prevent.
const missingApiUrlInBuild = import.meta.env.PROD && !import.meta.env.VITE_API_URL

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {missingApiUrlInBuild ? (
      <ConfigErrorPage />
    ) : (
      <BrowserRouter>
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              {/* Sit outside <App/> so they persist across every route. Suspense
                  covers both the first namespace/language chunk load and any
                  later one — react-i18next's useSuspense throws a promise
                  whenever a namespace isn't yet loaded for the active
                  language, which also happens when the language switcher
                  (UserMenu/Footer) picks a language whose chunks were never
                  fetched before. SuspenseOverlay fills the viewport with a
                  spinner rather than falling back to `null`: a `null`
                  fallback collapses this whole subtree to zero height,
                  which on a mid-session switch reads as the page jumping
                  rather than a brief load. */}
              <Suspense fallback={<SuspenseOverlay />}>
                <SpecialtyNamesProvider>
                  <EnvironmentBadge />
                  <OfflineBanner />
                  <PwaUpdatePrompt />
                  <InstallPromptBanner />
                  <App />
                </SpecialtyNamesProvider>
              </Suspense>
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </BrowserRouter>
    )}
  </React.StrictMode>,
)
