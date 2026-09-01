// Default happy-path MSW handlers for every endpoint the test suite touches.
// Individual tests override a handler with `server.use(...)` for error/edge
// cases rather than editing this file.

import { http, HttpResponse } from 'msw'
import { API_BASE_URL } from './api-base'
import {
  buildAdminClinic,
  buildAppointment,
  buildBranch,
  buildClinic,
  buildDependent,
  buildDoctor,
  buildDoctorAppointment,
  buildDoctorBranch,
  buildDoctorDetails,
  buildAvailableSlot,
  buildWorkingSchedule,
  pagedResult,
} from './fixtures'

const url = (path: string) => `${API_BASE_URL}${path}`

export const handlers = [
  http.get(url('/api/specialties'), () =>
    HttpResponse.json([{ id: 'spec-dentist', name: 'Stomatologji', description: 'Kujdes për dhëmbët dhe gojën.', isActive: true }]),
  ),

  http.get(url('/api/clinics'), () => HttpResponse.json(pagedResult([buildClinic()]))),
  http.get(url('/api/doctors'), () => HttpResponse.json(pagedResult([buildDoctor()]))),
  http.get(url('/api/doctors/:id'), () => HttpResponse.json(buildDoctorDetails())),
  http.get(url('/api/doctors/:id/available-slots'), () => HttpResponse.json([buildAvailableSlot()])),

  http.post(url('/api/appointments'), async () => HttpResponse.json(buildAppointment(), { status: 201 })),
  http.get(url('/api/appointments/my'), () => HttpResponse.json(pagedResult([buildAppointment()]))),
  http.get(url('/api/appointments/my/:id'), () => HttpResponse.json(buildAppointment())),
  http.post(url('/api/appointments/:id/cancel'), () => HttpResponse.json(buildAppointment())),
  http.post(url('/api/appointments/:id/reschedule'), () => HttpResponse.json(buildAppointment())),

  http.get(url('/api/patients/me'), () =>
    HttpResponse.json({
      userId: 'user-0001',
      firstName: 'Testi',
      lastName: 'Pacienti',
      email: 'pacienti@booking.dev',
      phoneNumber: '+383 44 000 000',
      dateOfBirth: '1995-01-01',
      gender: 1,
      personalNumber: undefined,
      address: undefined,
      city: 'Prishtinë',
    }),
  ),
  http.get(url('/api/patients/me/dependents'), () => HttpResponse.json([buildDependent()])),

  http.get(url('/api/doctor/branches'), () => HttpResponse.json([buildDoctorBranch()])),
  http.get(url('/api/doctor/working-schedules'), () => HttpResponse.json([buildWorkingSchedule()])),
  http.get(url('/api/doctor/appointments'), () => HttpResponse.json(pagedResult([buildDoctorAppointment()]))),
  http.post(url('/api/doctor/appointments/:id/confirm'), () => HttpResponse.json(buildDoctorAppointment())),

  http.get(url('/api/admin/clinics'), () => HttpResponse.json([buildAdminClinic()])),
  http.get(url('/api/clinics/:id'), () =>
    HttpResponse.json({ ...buildClinic(), branches: [buildBranch()], services: [] }),
  ),
  http.get(url('/api/clinics/:id/doctors'), () => HttpResponse.json([buildDoctor()])),
  http.get(url('/api/admin/clinics/:id/report'), () =>
    HttpResponse.json({ from: '2026-08-12', to: '2026-08-12', totalAppointments: 0, byStatus: {}, byDoctor: [] }),
  ),
]
