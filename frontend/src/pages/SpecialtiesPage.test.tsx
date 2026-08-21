import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '../test/render'
import { server } from '../test/server'
import { API_BASE_URL } from '../test/api-base'
import SpecialtiesPage from './SpecialtiesPage'

const SPECIALTIES_URL = `${API_BASE_URL}/api/specialties`

describe('SpecialtiesPage — empty vs error states', () => {
  it('renders the empty state (not the error state) when the request succeeds with zero items', async () => {
    server.use(http.get(SPECIALTIES_URL, () => HttpResponse.json([])))
    renderWithProviders(<SpecialtiesPage />, { user: 'SuperAdmin' })

    await waitFor(() =>
      expect(screen.getByText('Nuk ka asnjë specializim të regjistruar ende.')).toBeInTheDocument(),
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('renders the error state (not the empty state) when the request fails, with a working retry', async () => {
    let calls = 0
    server.use(
      http.get(SPECIALTIES_URL, () => {
        calls += 1
        if (calls === 1) {
          return HttpResponse.json(
            { type: 'about:blank', title: 'Server Error', status: 500, detail: 'Një ose më shumë fusha janë të pavlefshme' },
            { status: 500 },
          )
        }
        return HttpResponse.json([{ id: 'sp-1', name: 'Kardiologji', description: null, isActive: true }])
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<SpecialtiesPage />, { user: 'SuperAdmin' })

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    // The raw backend detail must never reach the rendered output.
    expect(screen.queryByText(/Një ose më shumë fusha/)).not.toBeInTheDocument()
    expect(screen.getByText('Ndodhi një gabim në server. Provoni përsëri pas pak.')).toBeInTheDocument()
    expect(screen.queryByText('Nuk ka asnjë specializim të regjistruar ende.')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Provo përsëri/i }))

    await waitFor(() => expect(screen.getByText('Kardiologji')).toBeInTheDocument())
    expect(calls).toBe(2)
  })
})
