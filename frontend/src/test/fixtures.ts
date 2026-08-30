// Typed fixture builders for the domain objects tests need. Each takes
// `Partial<T>` overrides and is built against the real DTO shapes in
// lib/types.ts, so a backend/DTO change that drops or renames a field makes
// these fail to *compile* rather than silently drifting from reality.

import {
  AppointmentStatus,
  type AdminClinic,
  type Appointment,
  type AvailableSlot,
  type Clinic,
  type ClinicBranch,
  type Dependent,
  type Doctor,
  type DoctorAppointment,
  type DoctorBranch,
  type DoctorDetails,
  type DoctorService,
  type DoctorWorkingSchedule,
  type MedicalService,
  type PagedResult,
} from '../lib/types'

let counter = 0
/** Deterministic-but-unique id per fixture call, so tests can create several without collisions. */
function nextId(prefix: string): string {
  counter += 1
  return `${prefix}-${String(counter).padStart(4, '0')}`
}

export function pagedResult<T>(items: T[], overrides: Partial<PagedResult<T>> = {}): PagedResult<T> {
  return {
    items,
    page: 1,
    pageSize: items.length || 12,
    totalItems: items.length,
    totalPages: 1,
    ...overrides,
  }
}

export function buildClinic(overrides: Partial<Clinic> = {}): Clinic {
  return {
    id: nextId('clinic'),
    name: 'Klinika Dentare Dardania',
    description: 'Klinikë dentare me përvojë 15-vjeçare.',
    phoneNumber: '+383 44 111 111',
    email: 'info@dardania.booking.dev',
    website: undefined,
    cities: ['Prishtinë'],
    ...overrides,
  }
}

export function buildAdminClinic(overrides: Partial<AdminClinic> = {}): AdminClinic {
  return {
    id: nextId('clinic'),
    name: 'Klinika Dentare Dardania',
    description: 'Klinikë dentare me përvojë 15-vjeçare.',
    phoneNumber: '+383 44 111 111',
    email: 'info@dardania.booking.dev',
    website: undefined,
    isApproved: true,
    isActive: true,
    createdAt: '2026-07-21T19:35:46.075267Z',
    administrators: [],
    cities: ['Prishtinë'],
    ...overrides,
  }
}

export function buildBranch(overrides: Partial<ClinicBranch> = {}): ClinicBranch {
  return {
    id: nextId('branch'),
    clinicId: nextId('clinic'),
    name: 'Dega Dardania',
    address: 'Rr. Bill Klinton 45',
    city: 'Prishtinë',
    municipality: undefined,
    latitude: undefined,
    longitude: undefined,
    phoneNumber: undefined,
    ...overrides,
  }
}

export function buildDoctorBranch(overrides: Partial<DoctorBranch> = {}): DoctorBranch {
  return {
    branchId: nextId('branch'),
    branchName: 'Dega Dardania',
    clinicId: nextId('clinic'),
    clinicName: 'Klinika Dentare Dardania',
    city: 'Prishtinë',
    address: 'Rr. Bill Klinton 45',
    ...overrides,
  }
}

export function buildService(overrides: Partial<MedicalService> = {}): MedicalService {
  return {
    id: nextId('service'),
    clinicId: nextId('clinic'),
    specialtyId: nextId('specialty'),
    specialtyName: 'Stomatologji',
    name: 'Pastrim i dhëmbëve',
    description: undefined,
    durationMinutes: 30,
    price: 25,
    currency: 'EUR',
    ...overrides,
  }
}

export function buildDoctorService(overrides: Partial<DoctorService> = {}): DoctorService {
  return {
    medicalServiceId: nextId('service'),
    name: 'Pastrim i dhëmbëve',
    specialtyId: nextId('specialty'),
    specialtyName: 'Stomatologji',
    durationMinutes: 30,
    price: 25,
    currency: 'EUR',
    ...overrides,
  }
}

export function buildDoctor(overrides: Partial<Doctor> = {}): Doctor {
  return {
    id: nextId('doctor'),
    firstName: 'Arben',
    lastName: 'Gashi',
    yearsOfExperience: 12,
    specialties: ['Stomatologji'],
    ...overrides,
  }
}

export function buildDoctorDetails(overrides: Partial<DoctorDetails> = {}): DoctorDetails {
  return {
    id: nextId('doctor'),
    firstName: 'Arben',
    lastName: 'Gashi',
    biography: undefined,
    yearsOfExperience: 12,
    specialties: ['Stomatologji'],
    branches: [buildDoctorBranch()],
    services: [buildDoctorService()],
    ...overrides,
  }
}

export function buildAvailableSlot(overrides: Partial<AvailableSlot> = {}): AvailableSlot {
  return {
    startDateTime: '2026-08-17T08:00:00',
    endDateTime: '2026-08-17T08:30:00',
    isAvailable: true,
    doctorId: nextId('doctor'),
    branchId: nextId('branch'),
    serviceId: nextId('service'),
    ...overrides,
  }
}

export function buildAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: nextId('appt'),
    clinicId: nextId('clinic'),
    clinicName: 'Klinika Dentare Dardania',
    clinicBranchId: nextId('branch'),
    branchName: 'Dega Dardania',
    branchAddress: 'Rr. Bill Klinton 45',
    doctorId: nextId('doctor'),
    doctorName: 'Arben Gashi',
    medicalServiceId: nextId('service'),
    serviceName: 'Pastrim i dhëmbëve',
    dependentId: undefined,
    dependentName: undefined,
    startDateTime: '2026-08-17T08:00:00',
    endDateTime: '2026-08-17T08:30:00',
    status: AppointmentStatus.Pending,
    patientNote: undefined,
    cancellationReason: undefined,
    cancelledAt: undefined,
    createdAt: '2026-08-12T20:00:00',
    ...overrides,
  }
}

export function buildDoctorAppointment(overrides: Partial<DoctorAppointment> = {}): DoctorAppointment {
  return {
    id: nextId('appt'),
    clinicBranchId: nextId('branch'),
    branchName: 'Dega Dardania',
    medicalServiceId: nextId('service'),
    serviceName: 'Pastrim i dhëmbëve',
    patientName: 'Testi Pacienti',
    patientPhoneNumber: undefined,
    dependentId: undefined,
    dependentName: undefined,
    startDateTime: '2026-08-17T08:00:00',
    endDateTime: '2026-08-17T08:30:00',
    status: AppointmentStatus.Pending,
    patientNote: undefined,
    internalNote: undefined,
    cancellationReason: undefined,
    ...overrides,
  }
}

export function buildDependent(overrides: Partial<Dependent> = {}): Dependent {
  return {
    id: nextId('dependent'),
    firstName: 'Lira',
    lastName: 'Pacienti',
    dateOfBirth: '2019-03-10',
    gender: 2,
    relationship: 1,
    isActive: true,
    ...overrides,
  }
}

export function buildWorkingSchedule(overrides: Partial<DoctorWorkingSchedule> = {}): DoctorWorkingSchedule {
  return {
    id: nextId('schedule'),
    doctorId: nextId('doctor'),
    clinicBranchId: nextId('branch'),
    branchName: 'Dega Dardania',
    dayOfWeek: 1, // Monday
    startTime: '08:00:00',
    endTime: '12:00:00',
    slotDurationMinutes: 30,
    isActive: true,
    validFrom: undefined,
    validUntil: undefined,
    ...overrides,
  }
}
