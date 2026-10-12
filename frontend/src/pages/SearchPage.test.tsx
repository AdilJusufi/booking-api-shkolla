import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '../test/render'
import { server } from '../test/server'
import { API_BASE_URL } from '../test/api-base'
import { buildClinic, buildDoctor, pagedResult } from '../test/fixtures'
import SearchPage from './SearchPage'

describe('SearchPage — paginated envelope unwrapping (3b)', () => {
  it('renders one clinic card per item, and the count reflects totalItems, not items.length', async () => {
    const clinics = [
      buildClinic({ name: 'Klinika A' }),
      buildClinic({ name: 'Klinika B' }),
      buildClinic({ name: 'Klinika C' }),
    ]
    server.use(
      http.get(`${API_BASE_URL}/api/clinics`, () => HttpResponse.json(pagedResult(clinics, { totalItems: 47, totalPages: 4 }))),
    )
    renderWithProviders(<SearchPage />, { route: '/kerko' })

    await waitFor(() => expect(screen.getByText('Klinika A')).toBeInTheDocument())
    expect(screen.getByText('Klinika B')).toBeInTheDocument()
    expect(screen.getByText('Klinika C')).toBeInTheDocument()

    // Only 3 items came back on this page, but 47 exist in total — the
    // heading must reflect the envelope's totalItems, not items.length.
    expect(screen.getByText('47 rezultate të gjetur')).toBeInTheDocument()
  })

  it('renders one doctor card per item on the Mjekët tab', async () => {
    const doctors = [buildDoctor({ firstName: 'Arben', lastName: 'Gashi' }), buildDoctor({ firstName: 'Blerta', lastName: 'Krasniqi' })]
    server.use(
      http.get(`${API_BASE_URL}/api/doctors`, () => HttpResponse.json(pagedResult(doctors, { totalItems: 2 }))),
    )
    const user = userEvent.setup()
    renderWithProviders(<SearchPage />, { route: '/kerko' })

    await user.click(screen.getByRole('button', { name: 'Mjekët' }))

    await waitFor(() => expect(screen.getByText('Dr. Arben Gashi')).toBeInTheDocument())
    expect(screen.getByText('Dr. Blerta Krasniqi')).toBeInTheDocument()
    expect(screen.getByText('2 rezultate të gjetur')).toBeInTheDocument()
  })

  it('renders the empty state, not blank space, when items is empty', async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/clinics`, () => HttpResponse.json(pagedResult([], { totalItems: 0, totalPages: 0 }))),
    )
    renderWithProviders(<SearchPage />, { route: '/kerko' })

    await waitFor(() => expect(screen.getByText('Nuk u gjetën rezultate')).toBeInTheDocument())
  })
})

describe('SearchPage — city filter reaches the API on both tabs', () => {
  it('sends City on the Mjekët tab, not just on Klinika', async () => {
    // Regression guard: the Doctors tab used to drop the city entirely — the
    // request went out with no City param, so picking a city silently did
    // nothing while the heading still claimed to be filtered.
    const doctorCities: (string | null)[] = []
    server.use(
      http.get(`${API_BASE_URL}/api/doctors`, ({ request }) => {
        doctorCities.push(new URL(request.url).searchParams.get('City'))
        return HttpResponse.json(pagedResult([buildDoctor({ firstName: 'Fatos', lastName: 'Rexhepi' })], { totalItems: 1 }))
      }),
    )
    renderWithProviders(<SearchPage />, { route: '/kerko?tab=mjeket&city=Vushtrri' })

    await waitFor(() => expect(screen.getByText('Dr. Fatos Rexhepi')).toBeInTheDocument())
    expect(doctorCities).toContain('Vushtrri')
  })

  it('omits City when no city is selected', async () => {
    const doctorCities: (string | null)[] = []
    server.use(
      http.get(`${API_BASE_URL}/api/doctors`, ({ request }) => {
        doctorCities.push(new URL(request.url).searchParams.get('City'))
        return HttpResponse.json(pagedResult([buildDoctor({ firstName: 'Arben', lastName: 'Gashi' })], { totalItems: 1 }))
      }),
    )
    renderWithProviders(<SearchPage />, { route: '/kerko?tab=mjeket' })

    await waitFor(() => expect(screen.getByText('Dr. Arben Gashi')).toBeInTheDocument())
    expect(doctorCities.every((c) => c === null)).toBe(true)
  })
})

describe('SearchPage — loading / error states (3f)', () => {
  it('renders skeleton cards while the request is in flight', async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/clinics`, async () => {
        await new Promise((r) => setTimeout(r, 50))
        return HttpResponse.json(pagedResult([]))
      }),
    )
    renderWithProviders(<SearchPage />, { route: '/kerko' })

    expect(document.querySelectorAll('.skeleton-card').length).toBeGreaterThan(0)
    await waitFor(() => expect(document.querySelectorAll('.skeleton-card').length).toBe(0))
  })

  it('renders an error state with a retry affordance, and retry refetches', async () => {
    let calls = 0
    server.use(
      http.get(`${API_BASE_URL}/api/clinics`, () => {
        calls += 1
        if (calls === 1) return HttpResponse.json({ detail: 'Ndodhi një gabim.' }, { status: 500 })
        return HttpResponse.json(pagedResult([buildClinic({ name: 'Recovered Klinika' })], { totalItems: 1 }))
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<SearchPage />, { route: '/kerko' })

    await waitFor(() => expect(screen.getByText('Ndodhi një gabim')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /Provo përsëri/i }))

    await waitFor(() => expect(screen.getByText('Recovered Klinika')).toBeInTheDocument())
    expect(calls).toBe(2)
  })

  it('shows the user-facing offline copy on a network failure, not the raw ApiError text', async () => {
    // Regression guard: this page used to render `e.message` straight through,
    // which surfaced the developer-facing "A është backend-i i ndezur?" string
    // to patients whenever the API was unreachable.
    server.use(http.get(`${API_BASE_URL}/api/clinics`, () => HttpResponse.error()))
    renderWithProviders(<SearchPage />, { route: '/kerko' })

    await waitFor(() =>
      expect(
        screen.getByText('Nuk u lidhëm me serverin. Kontrolloni internetin dhe provoni përsëri.'),
      ).toBeInTheDocument(),
    )
    expect(screen.queryByText(/backend-i i ndezur/)).not.toBeInTheDocument()
  })
})

describe('SearchPage — public listing', () => {
  it('shows full pagination to logged-out visitors (no preview cap, no login prompt)', async () => {
    const clinics = Array.from({ length: 12 }, (_, i) => buildClinic({ name: `Klinika ${i + 1}` }))
    server.use(
      http.get(`${API_BASE_URL}/api/clinics`, () =>
        HttpResponse.json(pagedResult(clinics, { totalItems: 14, totalPages: 2 })),
      ),
    )
    renderWithProviders(<SearchPage />, { route: '/kerko' })

    await waitFor(() => expect(screen.getByText('Klinika 1')).toBeInTheDocument())
    expect(screen.getByText('14 rezultate të gjetur')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Hyni' })).not.toBeInTheDocument()
  })
})
