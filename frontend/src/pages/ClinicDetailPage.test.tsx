import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '../test/render'
import { server } from '../test/server'
import { API_BASE_URL } from '../test/api-base'
import { buildDoctor, buildDoctorDetails, buildDoctorService, buildService } from '../test/fixtures'
import ClinicDetailPage from './ClinicDetailPage'

function LocationProbe() {
  const loc = useLocation()
  return <p data-testid="location">{loc.pathname + loc.search}</p>
}

function serveClinic(doctorServices: Record<string, string[]>) {
  const service = buildService({ id: 's1', name: 'Kontroll dentar' })
  const doctors = Object.keys(doctorServices).map((id, i) => buildDoctor({ id, firstName: `Mjeku${i}`, lastName: 'Test' }))
  server.use(
    http.get(`${API_BASE_URL}/api/clinics/c1`, () =>
      HttpResponse.json({ id: 'c1', name: 'Klinika', branches: [], services: [service] }),
    ),
    http.get(`${API_BASE_URL}/api/clinics/c1/doctors`, () => HttpResponse.json(doctors)),
    http.get(`${API_BASE_URL}/api/doctors/:id`, ({ params }) =>
      HttpResponse.json(
        buildDoctorDetails({
          id: params.id as string,
          services: doctorServices[params.id as string].map((sid) => buildDoctorService({ medicalServiceId: sid })),
        }),
      ),
    ),
  )
}

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/klinika/:id" element={<ClinicDetailPage />} />
      <Route path="/mjeku/:id" element={<LocationProbe />} />
    </Routes>,
    { route: '/klinika/c1' },
  )
}

describe('ClinicDetailPage — services start a booking', () => {
  it('goes straight to the only doctor offering the service, with it preselected', async () => {
    serveClinic({ d1: ['s1'], d2: ['other'] })
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /Kontroll dentar/ }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/mjeku/d1?sherbimi=s1'))
  })

  it('asks which doctor when several offer the service', async () => {
    serveClinic({ d1: ['s1'], d2: ['s1'], d3: [] })
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /Kontroll dentar/ }))
    const dialog = (await screen.findByRole('heading', { name: /Kontroll dentar/, level: 3 })).closest('.modal') as HTMLElement
    const links = within(dialog).getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/mjeku/d1?sherbimi=s1', '/mjeku/d2?sherbimi=s1'])
  })

  it('explains when no doctor offers the service', async () => {
    serveClinic({ d1: [] })
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /Kontroll dentar/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/asnjë mjek/)
  })
})
