import { Suspense, type ReactElement, type ReactNode } from 'react'
import { render, type RenderResult } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../context/AuthContext'
import { ToastProvider } from '../context/ToastContext'
import { ThemeProvider } from '../context/ThemeContext'

export interface AuthUser {
  userId: string
  firstName: string
  lastName: string
  email: string
  roles: string[]
}

export function buildAuthUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    userId: 'user-0001',
    firstName: 'Testi',
    lastName: 'Pacienti',
    email: 'pacienti@booking.dev',
    roles: ['Patient'],
    ...overrides,
  }
}

const ROLE_FIXTURES: Record<'Patient' | 'Doctor' | 'ClinicAdmin' | 'SuperAdmin', AuthUser> = {
  Patient: buildAuthUser({ roles: ['Patient'] }),
  Doctor: buildAuthUser({ userId: 'user-doctor', firstName: 'Arben', lastName: 'Gashi', email: 'arben.gashi@booking.dev', roles: ['Doctor'] }),
  ClinicAdmin: buildAuthUser({ userId: 'user-admin', firstName: 'Adelina', lastName: 'Berisha', email: 'admin@dardania.booking.dev', roles: ['ClinicAdmin'] }),
  SuperAdmin: buildAuthUser({ userId: 'user-superadmin', firstName: 'Super', lastName: 'Admini', email: 'superadmin@booking.dev', roles: ['SuperAdmin'] }),
}

/** Seeds localStorage the same way AuthContext/api.ts read it, so AuthProvider
 * boots up already authenticated — no need to drive an actual login form. */
export function seedAuthenticatedUser(user: AuthUser) {
  localStorage.setItem('rezervo.accessToken', 'test-access-token')
  localStorage.setItem('rezervo.refreshToken', 'test-refresh-token')
  localStorage.setItem('rezervo.user', JSON.stringify(user))
}

export interface RenderWithProvidersOptions {
  /** Initial history entry, e.g. '/terminet' or '/mjeku-panel/terminet/abc-123'. */
  route?: string
  /** Route pattern to match `route` against (needed when the page reads useParams).
   *  Defaults to rendering `ui` with no route matching, i.e. always mounted. */
  path?: string
  /** A pre-built AuthUser, or a role shorthand ('Patient' | 'Doctor' | 'ClinicAdmin' | 'SuperAdmin').
   *  Omit for an unauthenticated render. */
  user?: AuthUser | keyof typeof ROLE_FIXTURES | null
}

export function renderWithProviders(
  ui: ReactElement,
  { route = '/', path, user = null }: RenderWithProvidersOptions = {},
): RenderResult {
  if (user) {
    const authUser = typeof user === 'string' ? ROLE_FIXTURES[user] : user
    seedAuthenticatedUser(authUser)
  }

  function Providers({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[route]}>
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              {/* Mirrors main.tsx: useTranslation() suspends on the first
                  render that needs a namespace not yet loaded for the
                  active language (setup.ts only preloads 'common'). */}
              <Suspense fallback={null}>{children}</Suspense>
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>
    )
  }

  const content = path ? (
    <Routes>
      <Route path={path} element={ui} />
    </Routes>
  ) : (
    ui
  )

  return render(content, { wrapper: Providers })
}

export { ROLE_FIXTURES }
