import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '../test/render'
import { server } from '../test/server'
import { API_BASE_URL } from '../test/api-base'
import {
  buildAppointment,
  buildAvailableSlot,
  buildDoctorBranch,
  buildDoctorDetails,
  buildDoctorService,
} from '../test/fixtures'
import { AppointmentStatus } from '../lib/types'
import AppointmentDetailPage from './AppointmentDetailPage'

const DOCTOR_ID = 'doctor-1'
const BRANCH_ID = 'branch-1'
const SERVICE_ID = 'service-1'
const APPOINTMENT_ID = 'appt-1'

// Far enough in the future that the 12h reschedule/cancel window is always open.
const FAR_FUTURE_START = '2099-06-15T10:00:00'

function mockAppointmentAndDoctor() {
  server.use(
    http.get(`${API_BASE_URL}/api/appointments/my/${APPOINTMENT_ID}`, () =>
      HttpResponse.json(
        buildAppointment({
          id: APPOINTMENT_ID,
          doctorId: DOCTOR_ID,
          clinicBranchId: BRANCH_ID,
          medicalServiceId: SERVICE_ID,
          startDateTime: FAR_FUTURE_START,
          endDateTime: '2099-06-15T10:30:00',
          status: AppointmentStatus.Confirmed,
        }),
      ),
    ),
    http.get(`${API_BASE_URL}/api/doctors/${DOCTOR_ID}`, () =>
      HttpResponse.json(
        buildDoctorDetails({
          id: DOCTOR_ID,
          branches: [buildDoctorBranch({ branchId: BRANCH_ID })],
          services: [buildDoctorService({ medicalServiceId: SERVICE_ID })],
        }),
      ),
    ),
  )
}

async function openRescheduleAndPickSlot(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /Rischeduloni terminin/i }))

  const dayButtons = await screen.findAllByRole('button', { name: /^\d+$/ })
  const enabledDay = dayButtons.find((b) => !b.hasAttribute('disabled'))
  if (!enabledDay) throw new Error('No selectable day found in the week strip')
  await user.click(enabledDay)

  const slotButton = await screen.findByRole('button', { name: '10:00' })
  await user.click(slotButton)
}

describe('AppointmentDetailPage — reschedule 409 handling (3g)', () => {
  it('shows the Albanian slot-taken message on a 409 and refetches slots rather than leaving stale data', async () => {
    mockAppointmentAndDoctor()

    let slotsCalls = 0
    let rescheduleCalls = 0
    server.use(
      http.get(`${API_BASE_URL}/api/doctors/${DOCTOR_ID}/available-slots`, () => {
        slotsCalls += 1
        return HttpResponse.json([buildAvailableSlot({ startDateTime: '2026-08-20T10:00:00' })])
      }),
      http.post(`${API_BASE_URL}/api/appointments/${APPOINTMENT_ID}/reschedule`, () => {
        rescheduleCalls += 1
        return HttpResponse.json(
          { type: 'https://booking-api.dev/errors/conflict', title: 'Konflikt', status: 409, detail: 'Slot i zënë.' },
          { status: 409 },
        )
      }),
    )

    const user = userEvent.setup()
    renderWithProviders(<AppointmentDetailPage />, {
      route: `/terminet/${APPOINTMENT_ID}`,
      path: '/terminet/:id',
      user: 'Patient',
    })

    await openRescheduleAndPickSlot(user)
    const slotsCallsBeforeConfirm = slotsCalls

    await user.click(screen.getByRole('button', { name: /Konfirmo rischedulimin/i }))

    await waitFor(() =>
      expect(
        screen.getByText('Ky termin sapo u zu nga dikush tjetër. Ju lutem zgjidhni një kohë tjetër.'),
      ).toBeInTheDocument(),
    )
    expect(rescheduleCalls).toBe(1)

    // The failed slot is cleared and the date is re-selected, which refetches
    // available-slots rather than leaving the (now-stale) list on screen.
    await waitFor(() => expect(slotsCalls).toBeGreaterThan(slotsCallsBeforeConfirm))
  })

  it('lets the user pick a new slot and retry the reschedule without reloading the page', async () => {
    mockAppointmentAndDoctor()

    let rescheduleCalls = 0
    server.use(
      http.get(`${API_BASE_URL}/api/doctors/${DOCTOR_ID}/available-slots`, () =>
        HttpResponse.json([buildAvailableSlot({ startDateTime: '2026-08-20T10:00:00' })]),
      ),
      http.post(`${API_BASE_URL}/api/appointments/${APPOINTMENT_ID}/reschedule`, () => {
        rescheduleCalls += 1
        if (rescheduleCalls === 1) {
          return HttpResponse.json(
            { type: 'https://booking-api.dev/errors/conflict', title: 'Konflikt', status: 409, detail: 'Slot i zënë.' },
            { status: 409 },
          )
        }
        return HttpResponse.json(
          buildAppointment({ id: APPOINTMENT_ID, startDateTime: '2026-08-20T10:00:00', status: AppointmentStatus.Confirmed }),
        )
      }),
    )

    const user = userEvent.setup()
    renderWithProviders(<AppointmentDetailPage />, {
      route: `/terminet/${APPOINTMENT_ID}`,
      path: '/terminet/:id',
      user: 'Patient',
    })

    await openRescheduleAndPickSlot(user)
    await user.click(screen.getByRole('button', { name: /Konfirmo rischedulimin/i }))
    await waitFor(() =>
      expect(
        screen.getByText('Ky termin sapo u zu nga dikush tjetër. Ju lutem zgjidhni një kohë tjetër.'),
      ).toBeInTheDocument(),
    )

    // Pick the (refetched) slot again and retry — no reload, same component instance.
    const retrySlot = await screen.findByRole('button', { name: '10:00' })
    await user.click(retrySlot)
    await user.click(screen.getByRole('button', { name: /Konfirmo rischedulimin/i }))

    await waitFor(() => expect(rescheduleCalls).toBe(2))
  })
})
