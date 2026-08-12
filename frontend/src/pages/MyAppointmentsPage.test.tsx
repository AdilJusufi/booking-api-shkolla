import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '../test/render'
import { server } from '../test/server'
import { API_BASE_URL } from '../test/api-base'
import { buildAppointment, pagedResult } from '../test/fixtures'
import { AppointmentStatus } from '../lib/types'
import MyAppointmentsPage from './MyAppointmentsPage'

// One appointment per status, each with a distinguishable doctor name so
// tests can tell rows apart without depending on badge text alone.
const APPOINTMENTS_BY_STATUS = [
  { status: AppointmentStatus.Pending, doctorName: 'Pending Doktori', expectedBadge: 'NË PRITJE' },
  { status: AppointmentStatus.Confirmed, doctorName: 'Confirmed Doktori', expectedBadge: 'KONFIRMUAR' },
  { status: AppointmentStatus.CheckedIn, doctorName: 'CheckedIn Doktori', expectedBadge: 'MBËRRITUR' },
  { status: AppointmentStatus.InProgress, doctorName: 'InProgress Doktori', expectedBadge: 'NË PROGRES' },
  { status: AppointmentStatus.Completed, doctorName: 'Completed Doktori', expectedBadge: 'PËRFUNDUAR' },
  { status: AppointmentStatus.CancelledByPatient, doctorName: 'CancelledPatient Doktori', expectedBadge: 'ANULUAR' },
  { status: AppointmentStatus.CancelledByClinic, doctorName: 'CancelledClinic Doktori', expectedBadge: 'ANULUAR (KLINIKA)' },
  { status: AppointmentStatus.NoShow, doctorName: 'NoShow Doktori', expectedBadge: 'NUK U PARAQIT' },
  { status: AppointmentStatus.Rescheduled, doctorName: 'Rescheduled Doktori', expectedBadge: 'RISCHEDULUAR' },
]

// Row text is "Dr. {name}" as a single element's textContent — RTL matches
// the whole normalized string, not substrings, by default.
const byDoctor = (name: string) => (_content: string, el: Element | null) => el?.textContent === `Dr. ${name}`

function mockAppointments() {
  const appointments = APPOINTMENTS_BY_STATUS.map((a) =>
    buildAppointment({ status: a.status, doctorName: a.doctorName, id: `appt-${a.status}` }),
  )
  server.use(
    http.get(`${API_BASE_URL}/api/appointments/my`, () => HttpResponse.json(pagedResult(appointments))),
  )
  return appointments
}

describe('MyAppointmentsPage — status badge + filter contract (3a)', () => {
  it('maps every AppointmentStatus value to its correct Albanian badge label', async () => {
    mockAppointments()
    renderWithProviders(<MyAppointmentsPage />, { user: 'Patient' })

    await waitFor(() => expect(screen.getByText(byDoctor('Pending Doktori'))).toBeInTheDocument())

    for (const { doctorName, expectedBadge } of APPOINTMENTS_BY_STATUS) {
      const row = screen.getByText(byDoctor(doctorName)).closest('.appt-row')
      expect(row).not.toBeNull()
      expect(within(row as HTMLElement).getByText(expectedBadge)).toBeInTheDocument()
    }
  })

  it('"Aktive" filter includes Pending/Confirmed/CheckedIn/InProgress and excludes everything else', async () => {
    mockAppointments()
    const user = userEvent.setup()
    renderWithProviders(<MyAppointmentsPage />, { user: 'Patient' })

    await waitFor(() => expect(screen.getByText(byDoctor('Pending Doktori'))).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Aktive' }))

    expect(screen.getByText(byDoctor('Pending Doktori'))).toBeInTheDocument()
    expect(screen.getByText(byDoctor('Confirmed Doktori'))).toBeInTheDocument()
    expect(screen.getByText(byDoctor('CheckedIn Doktori'))).toBeInTheDocument()
    expect(screen.getByText(byDoctor('InProgress Doktori'))).toBeInTheDocument()
    expect(screen.queryByText(byDoctor('Completed Doktori'))).not.toBeInTheDocument()
    expect(screen.queryByText(byDoctor('CancelledPatient Doktori'))).not.toBeInTheDocument()
    expect(screen.queryByText(byDoctor('NoShow Doktori'))).not.toBeInTheDocument()
  })

  it('"Përfunduar" filter shows only Completed', async () => {
    mockAppointments()
    const user = userEvent.setup()
    renderWithProviders(<MyAppointmentsPage />, { user: 'Patient' })

    await waitFor(() => expect(screen.getByText(byDoctor('Pending Doktori'))).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Përfunduar' }))

    expect(screen.getByText(byDoctor('Completed Doktori'))).toBeInTheDocument()
    expect(screen.queryByText(byDoctor('Pending Doktori'))).not.toBeInTheDocument()
    expect(screen.queryByText(byDoctor('Confirmed Doktori'))).not.toBeInTheDocument()
  })

  it('"Anuluara" filter includes CancelledByPatient/CancelledByClinic/NoShow and excludes Rescheduled', async () => {
    mockAppointments()
    const user = userEvent.setup()
    renderWithProviders(<MyAppointmentsPage />, { user: 'Patient' })

    await waitFor(() => expect(screen.getByText(byDoctor('Pending Doktori'))).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Anuluara' }))

    expect(screen.getByText(byDoctor('CancelledPatient Doktori'))).toBeInTheDocument()
    expect(screen.getByText(byDoctor('CancelledClinic Doktori'))).toBeInTheDocument()
    expect(screen.getByText(byDoctor('NoShow Doktori'))).toBeInTheDocument()
    expect(screen.queryByText(byDoctor('Rescheduled Doktori'))).not.toBeInTheDocument()
    expect(screen.queryByText(byDoctor('Pending Doktori'))).not.toBeInTheDocument()
  })
})

describe('MyAppointmentsPage — loading / error / empty states (3f)', () => {
  it('shows skeleton placeholders while the request is in flight', async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/appointments/my`, async () => {
        await new Promise((r) => setTimeout(r, 50))
        return HttpResponse.json(pagedResult([]))
      }),
    )
    renderWithProviders(<MyAppointmentsPage />, { user: 'Patient' })

    expect(document.querySelectorAll('.skeleton-appt-row').length).toBeGreaterThan(0)
    await waitFor(() => expect(document.querySelectorAll('.skeleton-appt-row').length).toBe(0))
  })

  it('renders the empty state (not blank space) when the list is genuinely empty', async () => {
    server.use(http.get(`${API_BASE_URL}/api/appointments/my`, () => HttpResponse.json(pagedResult([]))))
    renderWithProviders(<MyAppointmentsPage />, { user: 'Patient' })

    await waitFor(() => expect(screen.getByText('Nuk keni termine')).toBeInTheDocument())
  })

  it('renders an error state with a retry affordance on request failure, and retry refetches', async () => {
    let calls = 0
    server.use(
      http.get(`${API_BASE_URL}/api/appointments/my`, () => {
        calls += 1
        if (calls === 1) return HttpResponse.json({ detail: 'Ndodhi një gabim.' }, { status: 500 })
        return HttpResponse.json(pagedResult([buildAppointment({ doctorName: 'Recovered Doktori' })]))
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<MyAppointmentsPage />, { user: 'Patient' })

    await waitFor(() => expect(screen.getByText('Ndodhi një gabim')).toBeInTheDocument())
    const retryButton = screen.getByRole('button', { name: /Provo përsëri/i })

    await user.click(retryButton)

    await waitFor(() => expect(screen.getByText(byDoctor('Recovered Doktori'))).toBeInTheDocument())
    expect(calls).toBe(2)
  })
})
