import { Suspense } from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../context/AuthContext'
import { ToastProvider } from '../context/ToastContext'
import { ThemeProvider } from '../context/ThemeContext'
import { AdminBreadcrumbProvider } from '../context/AdminBreadcrumbContext'
import { seedAuthenticatedUser, ROLE_FIXTURES } from '../test/render'
import { server } from '../test/server'
import { API_BASE_URL } from '../test/api-base'
import { buildAdminClinic, buildBranch } from '../test/fixtures'
import ClinicDetailLayout from './ClinicDetailLayout'
import BranchesPage from '../pages/BranchesPage'
import ServicesPage from '../pages/ServicesPage'
import ClinicDoctorsPage from '../pages/ClinicDoctorsPage'

const url = (path: string) => `${API_BASE_URL}${path}`

/**
 * Renders one clinic-admin tab (Branches/Services/Doctors) nested exactly as
 * App.tsx nests it — inside ClinicDetailLayout, under a route param — so
 * useClinicContext() resolves the same way it does in the real app.
 */
function renderTab(tab: React.ReactElement, clinicId: string) {
  seedAuthenticatedUser(ROLE_FIXTURES.ClinicAdmin)

  function Providers({ children }: { children: React.ReactNode }) {
    return (
      <MemoryRouter initialEntries={[`/admin-panel/klinikat/${clinicId}/tab`]}>
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              <AdminBreadcrumbProvider>
                <Suspense fallback={null}>{children}</Suspense>
              </AdminBreadcrumbProvider>
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>
    )
  }

  return render(
    <Routes>
      <Route path="/admin-panel/klinikat/:id" element={<ClinicDetailLayout />}>
        <Route path="tab" element={tab} />
      </Route>
    </Routes>,
    { wrapper: Providers },
  )
}

describe('Clinic tabs — gated behind clinic approval', () => {
  it('Branches: a pending clinic shows the pending notice, hides Add, and never calls the (public, 404-for-pending) branches endpoint', async () => {
    const clinic = buildAdminClinic({ isApproved: false })
    const branchesSpy = vi.fn()
    server.use(
      http.get(url('/api/admin/clinics'), () => HttpResponse.json([clinic])),
      http.get(url('/api/clinics/:id/branches'), () => {
        branchesSpy()
        return HttpResponse.json([buildBranch()])
      }),
    )

    renderTab(<BranchesPage />, clinic.id)

    expect(await screen.findByText(/pritje të aprovimit|awaiting approval|čeka odobrenje/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Shto Degë|Add Branch/i })).not.toBeInTheDocument()
    expect(branchesSpy).not.toHaveBeenCalled()
  })

  it('Branches: an approved clinic loads normally and shows the Add action', async () => {
    const clinic = buildAdminClinic({ isApproved: true })
    server.use(
      http.get(url('/api/admin/clinics'), () => HttpResponse.json([clinic])),
      http.get(url('/api/clinics/:id/branches'), () => HttpResponse.json([buildBranch({ name: 'Dega Testuese' })])),
    )

    renderTab(<BranchesPage />, clinic.id)

    expect(await screen.findByText('Dega Testuese')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Shto Degë/i })).toBeInTheDocument()
  })

  it('Services: a pending clinic shows the pending notice and never calls the services endpoint', async () => {
    const clinic = buildAdminClinic({ isApproved: false })
    const servicesSpy = vi.fn()
    server.use(
      http.get(url('/api/admin/clinics'), () => HttpResponse.json([clinic])),
      http.get(url('/api/clinics/:id/services'), () => {
        servicesSpy()
        return HttpResponse.json([])
      }),
    )

    renderTab(<ServicesPage />, clinic.id)

    expect(await screen.findByText(/pritje të aprovimit|awaiting approval|čeka odobrenje/i)).toBeInTheDocument()
    expect(servicesSpy).not.toHaveBeenCalled()
  })

  it('Doctors: a pending clinic shows the pending notice and never calls the doctors endpoint', async () => {
    const clinic = buildAdminClinic({ isApproved: false })
    const doctorsSpy = vi.fn()
    server.use(
      http.get(url('/api/admin/clinics'), () => HttpResponse.json([clinic])),
      http.get(url('/api/clinics/:id/doctors'), () => {
        doctorsSpy()
        return HttpResponse.json([])
      }),
    )

    renderTab(<ClinicDoctorsPage />, clinic.id)

    expect(await screen.findByText(/pritje të aprovimit|awaiting approval|čeka odobrenje/i)).toBeInTheDocument()
    expect(doctorsSpy).not.toHaveBeenCalled()
  })
})
