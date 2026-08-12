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
})
