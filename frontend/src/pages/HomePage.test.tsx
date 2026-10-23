import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse, delay } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '../test/render'
import { server } from '../test/server'
import { API_BASE_URL } from '../test/api-base'
import { buildClinic, buildDoctor, pagedResult } from '../test/fixtures'
import HomePage from './HomePage'

// WR-04: the home page used to fill itself with invented "verified" doctors,
// clinics and free slots whenever the API was slow or failing.
const INVENTED = [/Vitia/, /Linda Gashi/, /Besnik Ramadani/, /Klinika Qendrore/, /Poliklinika Rilindja/, /Sot, 14:30/, /I lirë/]

function expectNothingInvented() {
  const text = document.body.textContent ?? ''
  for (const pattern of INVENTED) expect(text).not.toMatch(pattern)
}

describe('HomePage — never shows fabricated content', () => {
  it('while loading shows skeletons, not placeholder people', async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/doctors`, async () => {
        await delay('infinite')
        return HttpResponse.json(pagedResult([]))
      }),
      http.get(`${API_BASE_URL}/api/clinics`, async () => {
        await delay('infinite')
        return HttpResponse.json(pagedResult([]))
      }),
    )
    renderWithProviders(<HomePage />)

    await screen.findByText('Mjekët në platformë')
    expectNothingInvented()
  })

  it('on failure shows a calm retryable message, and retry loads the real data', async () => {
    let fail = true
    server.use(
      http.get(`${API_BASE_URL}/api/doctors`, () =>
        fail ? HttpResponse.json({}, { status: 500 }) : HttpResponse.json(pagedResult([buildDoctor({ firstName: 'Arta', lastName: 'Reale' })])),
      ),
      http.get(`${API_BASE_URL}/api/clinics`, () =>
        fail ? HttpResponse.json({}, { status: 500 }) : HttpResponse.json(pagedResult([buildClinic({ name: 'Klinika Reale' })])),
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(<HomePage />)

    const errors = await screen.findAllByText('Nuk u ngarkua. Provoni përsëri.')
    expect(errors.length).toBeGreaterThan(0)
    expectNothingInvented()

    fail = false
    await user.click(screen.getAllByRole('button', { name: 'Provo përsëri' })[0])
    await waitFor(() => expect(screen.getByText('Klinika Reale')).toBeInTheDocument())
    expect(screen.getByText(/Arta Reale/)).toBeInTheDocument()
  })

  it("a doctor card's \"browse slots\" goes to that doctor (WR-26)", async () => {
    const doctor = buildDoctor({ firstName: 'Arta', lastName: 'Reale' })
    server.use(http.get(`${API_BASE_URL}/api/doctors`, () => HttpResponse.json(pagedResult([doctor]))))
    renderWithProviders(<HomePage />)

    await screen.findByText(/Arta Reale/)
    const link = screen.getAllByRole('link', { name: 'Shfleto oraret' })[0]
    expect(link).toHaveAttribute('href', `/mjeku/${doctor.id}`)
  })
})
