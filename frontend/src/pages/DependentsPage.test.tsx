import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '../test/render'
import { server } from '../test/server'
import { API_BASE_URL } from '../test/api-base'
import { buildDependent } from '../test/fixtures'
import DependentsPage from './DependentsPage'

describe('DependentsPage — list rendering (3b) and states (3f)', () => {
  it('renders one card per dependent', async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/patients/me/dependents`, () =>
        HttpResponse.json([buildDependent({ firstName: 'Lira' }), buildDependent({ firstName: 'Beni' })]),
      ),
    )
    renderWithProviders(<DependentsPage />, { user: 'Patient' })

    await waitFor(() => expect(screen.getByText('Lira Pacienti')).toBeInTheDocument())
    expect(screen.getByText('Beni Pacienti')).toBeInTheDocument()
  })

  it('renders the empty state, not blank space, when there are no dependents', async () => {
    server.use(http.get(`${API_BASE_URL}/api/patients/me/dependents`, () => HttpResponse.json([])))
    renderWithProviders(<DependentsPage />, { user: 'Patient' })

    await waitFor(() =>
      expect(screen.getByText('Nuk keni shtuar asnjë anëtar të familjes ende.')).toBeInTheDocument(),
    )
  })

  it('shows a loading indicator while the request is in flight', async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/patients/me/dependents`, async () => {
        await new Promise((r) => setTimeout(r, 50))
        return HttpResponse.json([])
      }),
    )
    renderWithProviders(<DependentsPage />, { user: 'Patient' })

    expect(screen.getByRole('status', { name: 'Duke ngarkuar anëtarët' })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('status', { name: 'Duke ngarkuar anëtarët' })).not.toBeInTheDocument())
  })

  it('renders an error state with a retry affordance, and retry refetches', async () => {
    let calls = 0
    server.use(
      http.get(`${API_BASE_URL}/api/patients/me/dependents`, () => {
        calls += 1
        if (calls === 1) return HttpResponse.json({ detail: 'Ndodhi një gabim.' }, { status: 500 })
        return HttpResponse.json([buildDependent({ firstName: 'Recovered' })])
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<DependentsPage />, { user: 'Patient' })

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /Provo përsëri/i }))

    await waitFor(() => expect(screen.getByText('Recovered Pacienti')).toBeInTheDocument())
    expect(calls).toBe(2)
  })
})
