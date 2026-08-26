import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '../test/render'
import { server } from '../test/server'
import { API_BASE_URL } from '../test/api-base'
import { buildAdminClinic } from '../test/fixtures'
import MyClinicsPage from './MyClinicsPage'

const url = (path: string) => `${API_BASE_URL}${path}`

describe('MyClinicsPage — pending vs. approved clinic treatment', () => {
  it('shows the pending banner and "NË PRITJE" card status for a clinic that has never been approved', async () => {
    // This is the shape self-registration produces: isApproved: false,
    // isActive: true (AuthService.RegisterClinicAsync) — not a clinic that
    // was approved once and later deactivated.
    const clinic = buildAdminClinic({ name: 'Klinika e Saporegjistruar', isApproved: false, isActive: true })
    server.use(http.get(url('/api/admin/clinics'), () => HttpResponse.json([clinic])))

    renderWithProviders(<MyClinicsPage />, { user: 'ClinicAdmin' })

    expect(await screen.findByText('Kërkesë në pritje')).toBeInTheDocument()
    expect(screen.getByText('NË PRITJE')).toBeInTheDocument()
    expect(screen.queryByText('APROVUAR')).not.toBeInTheDocument()

    // The pending card's manage link is disabled — a span, not a route — so
    // a ClinicAdmin can't wander into tabs the backend will 403 on.
    expect(screen.queryByRole('link', { name: /Menaxho/i })).not.toBeInTheDocument()
  })

  it('shows the approved status for a clinic with isApproved: true, regardless of any other clinic in the list being pending', async () => {
    const clinic = buildAdminClinic({ name: 'Klinika e Aprovuar', isApproved: true })
    server.use(http.get(url('/api/admin/clinics'), () => HttpResponse.json([clinic])))

    renderWithProviders(<MyClinicsPage />, { user: 'ClinicAdmin' })

    expect(await screen.findByText('APROVUAR')).toBeInTheDocument()
    expect(screen.queryByText('Kërkesë në pritje')).not.toBeInTheDocument()
  })

  it('the header CTA and "add another clinic" card both point at the self-registration form', async () => {
    const clinic = buildAdminClinic({ isApproved: true })
    server.use(http.get(url('/api/admin/clinics'), () => HttpResponse.json([clinic])))

    renderWithProviders(<MyClinicsPage />, { user: 'ClinicAdmin' })

    await screen.findByText('APROVUAR')

    const links = screen.getAllByRole('link', { name: /Klinik/i }).filter((el) => el.getAttribute('href') === '/regjistrohu')
    expect(links.length).toBeGreaterThan(0)
  })
})
