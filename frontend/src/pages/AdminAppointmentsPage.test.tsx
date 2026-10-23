import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderWithProviders } from '../test/render'
import { server } from '../test/server'
import { API_BASE_URL } from '../test/api-base'
import { buildAvailableSlot, buildDoctorAppointment } from '../test/fixtures'
import { AdminBreadcrumbProvider } from '../context/AdminBreadcrumbContext'
import { AppointmentStatus, type AdminAppointmentListItem } from '../lib/types'
import { epochToClinicWall } from '../lib/clinicTime'
import AdminAppointmentsPage from './AdminAppointmentsPage'

const DAY = 24 * 60 * 60 * 1000

function row(overrides: Partial<AdminAppointmentListItem>): AdminAppointmentListItem {
  return {
    id: 'appt-future',
    clinicId: 'clinic-1',
    clinicName: 'Klinika Dentare Dardania',
    clinicBranchId: 'branch-1',
    branchName: 'Dega Dardania',
    doctorId: 'doctor-1',
    doctorName: 'Arben Gashi',
    medicalServiceId: 'service-1',
    serviceName: 'Pastrim i dhëmbëve',
    patientName: 'Teuta Krasniqi',
    isForDependent: false,
    startDateTime: epochToClinicWall(Date.now() + 3 * DAY),
    endDateTime: epochToClinicWall(Date.now() + 3 * DAY + 30 * 60 * 1000),
    status: AppointmentStatus.Confirmed,
    version: 1,
    ...overrides,
  }
}

const ROWS = [
  row({}),
  row({ id: 'appt-past', patientName: 'Driton Morina', startDateTime: epochToClinicWall(Date.now() - DAY) }),
  row({ id: 'appt-cancelled', patientName: 'Vesa Hoxha', status: AppointmentStatus.CancelledByPatient }),
]

function renderPage() {
  return renderWithProviders(
    <AdminBreadcrumbProvider>
      <AdminAppointmentsPage />
    </AdminBreadcrumbProvider>,
    { user: 'ClinicAdmin' },
  )
}

async function rowFor(patient: string) {
  const cell = await screen.findByText(patient)
  return cell.closest('tr') as HTMLElement
}

describe('AdminAppointmentsPage — staff cancel / reschedule', () => {
  beforeEach(() => {
    server.use(
      http.get(`${API_BASE_URL}/api/admin/appointments`, () =>
        HttpResponse.json({ items: ROWS, page: 1, pageSize: 20, totalItems: ROWS.length, totalPages: 1 }),
      ),
      http.get(`${API_BASE_URL}/api/doctors/:id/available-days`, () => HttpResponse.json([])),
    )
  })

  it('offers Anulo / Ricakto only for active appointments that have not started', async () => {
    renderPage()

    const future = await rowFor('Teuta Krasniqi')
    expect(within(future).getByRole('button', { name: 'Anulo' })).toBeInTheDocument()
    expect(within(future).getByRole('button', { name: 'Ricakto' })).toBeInTheDocument()

    for (const patient of ['Driton Morina', 'Vesa Hoxha']) {
      const other = await rowFor(patient)
      expect(within(other).queryByRole('button', { name: 'Anulo' })).not.toBeInTheDocument()
      expect(within(other).queryByRole('button', { name: 'Ricakto' })).not.toBeInTheDocument()
    }
  })

  it('cancels after a confirmation, sending the optional reason', async () => {
    let body: unknown = null
    server.use(
      http.post(`${API_BASE_URL}/api/admin/appointments/:id/cancel`, async ({ request, params }) => {
        body = { id: params.id, ...((await request.json()) as object) }
        return HttpResponse.json(buildDoctorAppointment({ status: AppointmentStatus.CancelledByClinic }))
      }),
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(within(await rowFor('Teuta Krasniqi')).getByRole('button', { name: 'Anulo' }))
    const dialog = (await screen.findByRole('heading', { name: 'Anulo terminin' })).closest('.modal') as HTMLElement
    expect(body).toBeNull() // nothing is sent before the confirmation
    await user.type(within(dialog).getByLabelText('Arsyeja (opsionale)'), 'Mjeku mungon')
    await user.click(within(dialog).getByRole('button', { name: 'Anulo terminin' }))

    await waitFor(() => expect(body).toEqual({ id: 'appt-future', reason: 'Mjeku mungon' }))
  })

  it('reschedules to a slot of the same doctor and service', async () => {
    const slot = buildAvailableSlot({ startDateTime: epochToClinicWall(Date.now() + 5 * DAY).slice(0, 11) + '10:30:00' })
    let slotQuery: { doctorId: string; serviceId: string | null; branchId: string | null } | null = null
    let body: unknown = null
    server.use(
      http.get(`${API_BASE_URL}/api/doctors/:id/available-slots`, ({ request, params }) => {
        const url = new URL(request.url)
        slotQuery = {
          doctorId: String(params.id),
          serviceId: url.searchParams.get('ServiceId'),
          branchId: url.searchParams.get('BranchId'),
        }
        return HttpResponse.json([slot])
      }),
      http.post(`${API_BASE_URL}/api/admin/appointments/:id/reschedule`, async ({ request, params }) => {
        body = { id: params.id, ...((await request.json()) as object) }
        return HttpResponse.json(buildDoctorAppointment({ startDateTime: slot.startDateTime }))
      }),
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(within(await rowFor('Teuta Krasniqi')).getByRole('button', { name: 'Ricakto' }))
    const dialog = (await screen.findByRole('heading', { name: 'Ricakto terminin' })).closest('.modal') as HTMLElement
    const days = within(dialog)
      .getAllByRole('button')
      .filter((b) => b.classList.contains('booking-daybtn') && !b.hasAttribute('aria-disabled'))
    await user.click(days[days.length - 1])

    await user.click(await within(dialog).findByRole('button', { name: '10:30' }))
    expect(slotQuery).toEqual({ doctorId: 'doctor-1', serviceId: 'service-1', branchId: 'branch-1' })
    await user.click(within(dialog).getByRole('button', { name: /^Ricakto për/ }))

    await waitFor(() => expect(body).toEqual({ id: 'appt-future', newStartDateTime: slot.startDateTime }))
  })
})
