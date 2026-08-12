import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderWithProviders } from '../test/render'
import { server } from '../test/server'
import { API_BASE_URL } from '../test/api-base'
import { buildAppointment } from '../test/fixtures'
import ConfirmBookingPage from './ConfirmBookingPage'

const PENDING_BOOKING = {
  doctorId: 'doctor-1',
  doctorName: 'Dr. Arben Gashi',
  serviceId: 'service-1',
  serviceName: 'Pastrim i dhëmbëve',
  serviceDurationMinutes: 30,
  branchId: 'branch-1',
  branchName: 'Dega Dardania',
  date: '2026-08-17',
  time: '08:00',
  startDateTime: '2026-08-17T08:00:00',
  price: 25,
  currency: 'EUR',
}

beforeEach(() => {
  sessionStorage.setItem('termini_pending_booking', JSON.stringify(PENDING_BOOKING))
})

describe('ConfirmBookingPage — 409 slot-taken handling (3g)', () => {
  it('shows the Albanian slot-taken message on a 409, and lets the user retry without reloading', async () => {
    let calls = 0
    server.use(
      http.post(`${API_BASE_URL}/api/appointments`, () => {
        calls += 1
        if (calls === 1) {
          return HttpResponse.json(
            { type: 'https://booking-api.dev/errors/conflict', title: 'Konflikt', status: 409, detail: 'Slot i zënë.' },
            { status: 409 },
          )
        }
        return HttpResponse.json(buildAppointment({ id: 'new-appt-1' }), { status: 201 })
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<ConfirmBookingPage />, { route: '/rezervo/konfirmo', path: '/rezervo/konfirmo', user: 'Patient' })

    const confirmButton = await screen.findByRole('button', { name: /Konfirmo rezervimin/i })
    await user.click(confirmButton)

    await waitFor(() => expect(screen.getByText(/Ky orar u zu ndërkohë/i)).toBeInTheDocument())
    expect(calls).toBe(1)

    // Retry, in the same page instance — no reload.
    await user.click(screen.getByRole('button', { name: /Konfirmo rezervimin/i }))

    await waitFor(() => expect(calls).toBe(2))
  })

  it('does not surface the raw backend detail text for a 409', async () => {
    server.use(
      http.post(`${API_BASE_URL}/api/appointments`, () =>
        HttpResponse.json(
          { type: 'https://booking-api.dev/errors/conflict', title: 'Konflikt', status: 409, detail: 'RAW-BACKEND-DETAIL' },
          { status: 409 },
        ),
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(<ConfirmBookingPage />, { route: '/rezervo/konfirmo', path: '/rezervo/konfirmo', user: 'Patient' })

    const confirmButton = await screen.findByRole('button', { name: /Konfirmo rezervimin/i })
    await user.click(confirmButton)

    await waitFor(() => expect(screen.getByText(/Ky orar u zu ndërkohë/i)).toBeInTheDocument())
    expect(screen.queryByText('RAW-BACKEND-DETAIL')).not.toBeInTheDocument()
  })
})
