import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '../test/render'
import { server } from '../test/server'
import { API_BASE_URL } from '../test/api-base'
import { buildDoctorDetails, buildDoctorService } from '../test/fixtures'
import DoctorDetailPage from './DoctorDetailPage'

function serveDoctor() {
  const availabilityCalls: string[] = []
  server.use(
    http.get(`${API_BASE_URL}/api/doctors/d1`, () =>
      HttpResponse.json(
        buildDoctorDetails({
          id: 'd1',
          firstName: 'Filan',
          lastName: 'Fisteku',
          services: [buildDoctorService({ name: 'Kontroll dentar' })],
        }),
      ),
    ),
    http.get(`${API_BASE_URL}/api/doctors/d1/available-days`, ({ request }) => {
      availabilityCalls.push(request.url)
      return HttpResponse.json([])
    }),
    http.get(`${API_BASE_URL}/api/doctors/d1/available-slots`, ({ request }) => {
      availabilityCalls.push(request.url)
      return HttpResponse.json([])
    }),
  )
  return availabilityCalls
}

describe('DoctorDetailPage — public profile, private booking', () => {
  it('shows the profile and services to a logged-out visitor, with a login CTA instead of the booking flow', async () => {
    const availabilityCalls = serveDoctor()
    renderWithProviders(<DoctorDetailPage />, { route: '/mjeku/d1', path: '/mjeku/:id' })

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Dr. Filan Fisteku' })).toBeInTheDocument())
    expect(screen.getByText('Kontroll dentar')).toBeInTheDocument()

    // Services are read-only for visitors: no selectable rows, no step indicator.
    expect(screen.queryByRole('button', { name: /Kontroll dentar/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Zgjidhni datën')).not.toBeInTheDocument()

    const cta = screen.getByRole('link', { name: /Hyni për të rezervuar/ })
    expect(cta).toHaveAttribute('href', '/hyr')
    expect(availabilityCalls).toEqual([])
  })

  it('sets a unique, specific document title once the profile loads', async () => {
    serveDoctor()
    renderWithProviders(<DoctorDetailPage />, { route: '/mjeku/d1', path: '/mjeku/:id' })

    await waitFor(() => expect(document.title).toContain('Dr. Filan Fisteku'))
    expect(document.title).toMatch(/\| Rezervo Mjekun$/)
    expect(document.head.querySelector('link[rel="canonical"]')).not.toBeNull()
  })

  it('lets a signed-in patient pick a service to start booking', async () => {
    serveDoctor()
    renderWithProviders(<DoctorDetailPage />, { route: '/mjeku/d1', path: '/mjeku/:id', user: 'Patient' })

    await waitFor(() => expect(screen.getByRole('button', { name: /Kontroll dentar/ })).toBeInTheDocument())
    expect(screen.queryByRole('link', { name: /Hyni për të rezervuar/ })).not.toBeInTheDocument()
  })

  it('starts the booking on the service passed as ?sherbimi= for a logged-in patient', async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/doctors/d1`, () =>
        HttpResponse.json(
          buildDoctorDetails({
            id: 'd1',
            firstName: 'Filan',
            lastName: 'Fisteku',
            services: [buildDoctorService({ medicalServiceId: 's1', name: 'Kontroll dentar' })],
          }),
        ),
      ),
      http.get(`${API_BASE_URL}/api/doctors/d1/available-days`, () => HttpResponse.json([])),
    )
    renderWithProviders(<DoctorDetailPage />, { route: '/mjeku/d1?sherbimi=s1', path: '/mjeku/:id', user: 'Patient' })
    const row = await screen.findByRole('button', { name: /Kontroll dentar/ })
    await waitFor(() => expect(row).toHaveAttribute('aria-pressed', 'true'))
  })
})
