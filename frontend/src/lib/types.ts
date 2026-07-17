// Tipat që pasqyrojnë DTO-t e backend-it (Booking.Application.Features.*)

export type Gender = 1 | 2 | 3 // Male, Female, Other

export enum AppointmentStatus {
  Pending = 1,
  Confirmed = 2,
  CheckedIn = 3,
  InProgress = 4,
  Completed = 5,
  CancelledByPatient = 6,
  CancelledByClinic = 7,
  NoShow = 8,
  Rescheduled = 9,
}

export interface AuthResponse {
  userId: string
  firstName: string
  lastName: string
  email: string
  roles: string[]
  accessToken: string
  accessTokenExpiresAt: string
  refreshToken: string
  refreshTokenExpiresAt: string
}

export interface RegisterRequest {
  firstName: string
  lastName: string
  email: string
  phoneNumber: string
  password: string
  dateOfBirth: string // yyyy-MM-dd
  gender: Gender
  address?: string
  city?: string
}

export interface PagedResult<T> {
  items: T[]
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
}

export interface Specialty {
  id: string
  name: string
  description?: string
}

export interface Clinic {
  id: string
  name: string
  description?: string
  phoneNumber?: string
  email?: string
  website?: string
  cities: string[]
}

export interface ClinicBranch {
  id: string
  clinicId: string
  name: string
  address: string
  city: string
  municipality?: string
  latitude?: number
  longitude?: number
  phoneNumber?: string
}

export interface MedicalService {
  id: string
  clinicId: string
  specialtyId: string
  specialtyName: string
  name: string
  description?: string
  durationMinutes: number
  price: number
  currency: string
}

export interface ClinicDetails {
  id: string
  name: string
  description?: string
  phoneNumber?: string
  email?: string
  website?: string
  branches: ClinicBranch[]
  services: MedicalService[]
}

export interface Doctor {
  id: string
  firstName: string
  lastName: string
  yearsOfExperience: number
  specialties: string[]
}

export interface DoctorBranch {
  branchId: string
  branchName: string
  clinicId: string
  clinicName: string
  city: string
  address: string
}

export interface DoctorService {
  medicalServiceId: string
  name: string
  specialtyId: string
  specialtyName: string
  durationMinutes: number
  price: number
  currency: string
}

export interface DoctorDetails {
  id: string
  firstName: string
  lastName: string
  biography?: string
  yearsOfExperience: number
  specialties: string[]
  branches: DoctorBranch[]
  services: DoctorService[]
}

export interface AvailableSlot {
  startDateTime: string
  endDateTime: string
  isAvailable: boolean
  doctorId: string
  branchId: string
  serviceId: string
}

export interface CreateAppointmentRequest {
  doctorId: string
  clinicBranchId: string
  medicalServiceId: string
  dependentId?: string
  startDateTime: string
  patientNote?: string
}

export interface Appointment {
  id: string
  clinicId: string
  clinicName: string
  clinicBranchId: string
  branchName: string
  branchAddress: string
  doctorId: string
  doctorName: string
  medicalServiceId: string
  serviceName: string
  dependentId?: string
  dependentName?: string
  startDateTime: string
  endDateTime: string
  status: AppointmentStatus
  patientNote?: string
  cancellationReason?: string
  cancelledAt?: string
  createdAt: string
}
