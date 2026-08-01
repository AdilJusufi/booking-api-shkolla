// Tipat që pasqyrojnë DTO-t e backend-it (Booking.Application.Features.*)

export type Gender = 1 | 2 | 3 // Male, Female, Other
export type DependentRelationship = 1 | 2 | 3 | 4 // Child, Spouse, Parent, Other

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

/** Pasqyron CreateSpecialtyRequest — POST /api/admin/specialties. */
export interface CreateSpecialtyRequest {
  name: string
  description?: string
}

/**
 * Pasqyron UpdateSpecialtyRequest — PUT /api/admin/specialties/{id}. IsActive
 * këtu është vetëm një input; SpecialtyDto (përgjigja, dhe GET /api/specialties
 * publik) nuk e kthen fare këtë fushë, kështu që UI nuk mund të tregojë
 * statusin aktual — mund vetëm ta ndryshojë.
 */
export interface UpdateSpecialtyRequest {
  name: string
  description?: string
  isActive: boolean
}

/** Pasqyron AuditLogDto — GET /api/admin/audit-logs. Nuk ka UserEmail, vetëm UserId. */
export interface AuditLog {
  id: string
  userId?: string
  action: string
  entityName: string
  entityId?: string
  oldValues?: string
  newValues?: string
  ipAddress?: string
  createdAt: string
}

export interface AuditLogQuery {
  entityName?: string
  userId?: string
  from?: string
  to?: string
  page?: number
  pageSize?: number
}

export interface PatientProfile {
  userId: string
  firstName: string
  lastName: string
  email: string
  phoneNumber?: string
  dateOfBirth: string // yyyy-MM-dd
  gender: Gender
  personalNumber?: string
  address?: string
  city?: string
}

export interface UpdatePatientProfileRequest {
  firstName: string
  lastName: string
  phoneNumber: string
  dateOfBirth: string
  gender: Gender
  personalNumber?: string
  address?: string
  city?: string
}

export interface Dependent {
  id: string
  firstName: string
  lastName: string
  dateOfBirth: string
  gender: Gender
  relationship: DependentRelationship
  isActive: boolean
}

/** Pasqyron CreateDependentRequest / UpdateDependentRequest — të njëjtat fusha për të dy. */
export interface CreateDependentRequest {
  firstName: string
  lastName: string
  dateOfBirth: string
  gender: Gender
  relationship: DependentRelationship
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

/** Pasqyron CreateBranchRequest — POST /api/admin/clinics/{id}/branches. */
export interface CreateBranchRequest {
  name: string
  address: string
  city: string
  municipality?: string
  phoneNumber?: string
  latitude?: number
  longitude?: number
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

/** Pasqyron CreateMedicalServiceRequest — POST /api/admin/clinics/{id}/services. */
export interface CreateMedicalServiceRequest {
  specialtyId: string
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

/**
 * Pasqyron AdminDoctorDto — përgjigja e POST /api/admin/clinics/{id}/doctors.
 * Kjo ËSHTË E VETMJA thirrje që kthen userId/licenseNumber/isVerified/isActive —
 * nuk ekziston asnjë GET administrativ që i kthen këto fusha për doktorë
 * ekzistues, prandaj UI-ja e listës (ClinicDoctorsPage) nuk mund t'i shfaqë.
 */
export interface AdminDoctor {
  id: string
  userId: string
  firstName: string
  lastName: string
  email: string
  licenseNumber: string
  isVerified: boolean
  isActive: boolean
}

/** Pasqyron CreateDoctorRequest — POST /api/admin/clinics/{id}/doctors. */
export interface CreateDoctorRequest {
  firstName: string
  lastName: string
  email: string
  phoneNumber: string
  initialPassword: string
  licenseNumber: string
  biography?: string
  yearsOfExperience: number
  specialtyIds: string[]
  branchIds: string[]
  serviceIds?: string[]
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

export interface DoctorAppointment {
  id: string
  clinicBranchId: string
  branchName: string
  medicalServiceId: string
  serviceName: string
  patientName: string
  patientPhoneNumber?: string
  dependentId?: string
  dependentName?: string
  startDateTime: string
  endDateTime: string
  status: AppointmentStatus
  patientNote?: string
  internalNote?: string
  cancellationReason?: string
}

export interface DoctorWorkingSchedule {
  id: string
  doctorId: string
  clinicBranchId: string
  branchName: string
  dayOfWeek: number // 0=Sunday … 6=Saturday
  startTime: string // "HH:mm"
  endTime: string // "HH:mm"
  slotDurationMinutes: number
  isActive: boolean
  validFrom?: string // yyyy-MM-dd
  validUntil?: string // yyyy-MM-dd
}

export interface CreateWorkingScheduleRequest {
  clinicBranchId: string
  dayOfWeek: number
  startTime: string
  endTime: string
  slotDurationMinutes: number
  validFrom?: string
  validUntil?: string
}

/** Pasqyron CreateUnavailabilityRequest — POST /api/admin/doctors/{id}/unavailability. */
export interface CreateUnavailabilityRequest {
  clinicBranchId?: string
  startDateTime: string
  endDateTime: string
  reason?: string
}

export interface UnavailabilityDto {
  id: string
  doctorId: string
  clinicBranchId?: string
  startDateTime: string
  endDateTime: string
  reason?: string
}

/** Pasqyron AdminClinicDto — GET /api/admin/clinics nuk kthen adresë/qytet/numra, vetëm bazat. */
export interface AdminClinic {
  id: string
  name: string
  description?: string
  phoneNumber?: string
  email?: string
  website?: string
  isApproved: boolean
  isActive: boolean
  createdAt: string
}

export interface ClinicReport {
  from: string
  to: string
  totalAppointments: number
  byStatus: Record<string, number>
  byDoctor: { doctorId: string; doctorName: string; appointmentCount: number }[]
}

/**
 * Bashkim i AdminClinicDto (isApproved/isActive) me të dhënat publike të klinikës
 * (qyteti vjen nga degët) — nuk ka një endpoint të vetëm që i kthen të gjitha.
 */
export interface AdminClinicDetail extends AdminClinic {
  city: string
}

/** Pasqyron UpdateClinicRequest — vetëm këto fusha janë të ndryshueshme. */
export interface UpdateClinicRequest {
  name: string
  description?: string
  phoneNumber?: string
  email?: string
  website?: string
}

/** Pasqyron CreateClinicRequest — POST /api/admin/clinics (vetëm SuperAdmin). */
export interface CreateClinicRequest {
  name: string
  description?: string
  phoneNumber?: string
  email?: string
  website?: string
}

/** Pasqyron AssignClinicAdminRequest — POST /api/admin/clinics/{id}/admins. */
export interface AssignClinicAdminRequest {
  email: string
}
