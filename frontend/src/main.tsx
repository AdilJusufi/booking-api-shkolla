import React, { Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { ThemeProvider } from './context/ThemeContext'
import OfflineBanner from './components/OfflineBanner'
import InstallPromptBanner from './components/InstallPromptBanner'
import PwaUpdatePrompt from './pwa/PwaUpdatePrompt'
import SuspenseOverlay from './components/SuspenseOverlay'
import './i18n'
import './styles/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
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
              <OfflineBanner />
              <PwaUpdatePrompt />
              <InstallPromptBanner />
              <App />
            </Suspense>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
