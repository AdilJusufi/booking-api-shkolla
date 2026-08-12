import type {
  AdminClinic,
  AdminClinicDetail,
  AdminDoctor,
  Appointment,
  AppointmentStatus,
  AssignClinicAdminRequest,
  AuditLog,
  AuditLogQuery,
  AuthResponse,
  AvailableSlot,
  Clinic,
  ClinicBranch,
  ClinicDetails,
  ClinicReport,
  CloudinarySignature,
  CreateAppointmentRequest,
  CreateBranchRequest,
  CreateClinicRequest,
  CreateDependentRequest,
  CreateDoctorRequest,
  CreateMedicalServiceRequest,
  CreateSpecialtyRequest,
  CreateUnavailabilityRequest,
  CreateWorkingScheduleRequest,
  Dependent,
  Doctor,
  DoctorAppointment,
  DoctorDetails,
  DoctorWorkingSchedule,
  MedicalService,
  PagedResult,
  PatientProfile,
  RegisterRequest,
  Specialty,
  UnavailabilityDto,
  UpdateClinicRequest,
  UpdatePatientProfileRequest,
  UpdateSpecialtyRequest,
} from './types'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5080'

const TOKEN_KEY = 'termini.accessToken'
const REFRESH_TOKEN_KEY = 'termini.refreshToken'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}
export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}
export function setRefreshToken(token: string | null) {
  if (token) localStorage.setItem(REFRESH_TOKEN_KEY, token)
  else localStorage.removeItem(REFRESH_TOKEN_KEY)
}

/**
 * `AuthProvider` registers itself here on mount so this module — which has no
 * React context access — can force a logout when a refresh attempt fails
 * (refresh token itself expired/revoked). Left null in contexts where auth
 * isn't wired (tests, etc.); the interceptor just clears storage in that case.
 */
let onSessionExpired: (() => void) | null = null
export function registerSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/** Raw, non-intercepted call — used only by the refresh itself so a failed
 * refresh can never recursively trigger another refresh attempt. */
async function refreshAccessToken(): Promise<string> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) throw new ApiError('Sesioni juaj ka skaduar.', 401)

  const response = await fetch(`${BASE_URL}/api/auth/refresh-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })

  if (!response.ok) {
    throw new ApiError('Sesioni juaj ka skaduar.', response.status)
  }

  const data = (await response.json()) as AuthResponse
  setToken(data.accessToken)
  setRefreshToken(data.refreshToken)
  return data.accessToken
}

// Concurrent 401s share one in-flight refresh instead of each racing the backend.
let refreshInFlight: Promise<string> | null = null

function expireSession() {
  setToken(null)
  setRefreshToken(null)
  onSessionExpired?.()
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean; query?: Record<string, unknown> } = {},
): Promise<T> {
  const { method = 'GET', body, auth = false, query } = options

  let url = `${BASE_URL}${path}`
  if (query) {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, String(value))
      }
    }
    const qs = params.toString()
    if (qs) url += `?${qs}`
  }

  async function attempt(): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (auth) {
      const token = getToken()
      if (token) headers['Authorization'] = `Bearer ${token}`
    }
    try {
      return await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
    } catch {
      throw new ApiError('Nuk u lidhëm dot me serverin. A është backend-i i ndezur?', 0)
    }
  }

  let response = await attempt()

  // Only authenticated requests get the refresh treatment — a 401 from
  // /auth/login (wrong password) is a normal error, not an expired session.
  if (response.status === 401 && auth && getRefreshToken()) {
    try {
      refreshInFlight ??= refreshAccessToken().finally(() => {
        refreshInFlight = null
      })
      await refreshInFlight
      response = await attempt()
    } catch {
      expireSession()
      // Fall through with the original 401 response so the caller still
      // gets a normal ApiError instead of an unhandled rejection.
    }
  }

  if (response.status === 204) return undefined as T

  const text = await response.text()
  const data = text ? safeParse(text) : null

  if (!response.ok) {
    if (response.status === 401 && auth) expireSession()
    throw new ApiError(extractError(data, response.status), response.status)
  }

  return data as T
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/** Backend paging validators reject PageSize outside [1,100] with a 400/422 —
 * clamp here so no caller can reintroduce that by passing an out-of-range value. */
function clampPageSize(size: number): number {
  return Math.min(100, Math.max(1, size))
}

function extractError(data: unknown, status: number): string {
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>
    if (typeof obj.detail === 'string') return obj.detail
    if (typeof obj.message === 'string') return obj.message
    if (typeof obj.title === 'string') return obj.title
    if (obj.errors && typeof obj.errors === 'object') {
      const first = Object.values(obj.errors as Record<string, string[]>)[0]
      if (Array.isArray(first) && first[0]) return first[0]
    }
  }
  if (typeof data === 'string' && data) return data
  if (status === 401) return 'Të dhënat e hyrjes janë të pasakta.'
  if (status === 403) return 'Nuk keni leje për këtë veprim.'
  if (status === 404) return 'Nuk u gjet.'
  return 'Ndodhi një gabim. Provoni përsëri.'
}

export const api = {
  // --- Auth ---
  login: (email: string, password: string) =>
    request<AuthResponse>('/api/auth/login', { method: 'POST', body: { email, password } }),
  register: (payload: RegisterRequest) =>
    request<AuthResponse>('/api/auth/register', { method: 'POST', body: payload }),
  confirmEmail: (token: string, email: string) =>
    request<void>('/api/auth/confirm-email', { method: 'POST', body: { token, email } }),
  forgotPassword: (email: string) =>
    request<void>('/api/auth/forgot-password', { method: 'POST', body: { email } }),
  resetPassword: (token: string, email: string, newPassword: string) =>
    request<void>('/api/auth/reset-password', { method: 'POST', body: { token, email, newPassword } }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>('/api/auth/change-password', { method: 'POST', body: { currentPassword, newPassword }, auth: true }),
  revokeToken: (refreshToken: string) =>
    request<void>('/api/auth/revoke-token', { method: 'POST', body: { refreshToken }, auth: true }),

  // --- Publike ---
  getSpecialties: () => request<Specialty[]>('/api/specialties'),

  searchClinics: (params: {
    city?: string
    specialtyId?: string
    searchTerm?: string
    page?: number
    pageSize?: number
  }) =>
    request<PagedResult<Clinic>>('/api/clinics', {
      query: {
        City: params.city,
        SpecialtyId: params.specialtyId,
        SearchTerm: params.searchTerm,
        Page: params.page ?? 1,
        PageSize: params.pageSize ?? 12,
      },
    }),

  getClinic: (id: string) => request<ClinicDetails>(`/api/clinics/${id}`),
  getClinicDoctors: (id: string) => request<Doctor[]>(`/api/clinics/${id}/doctors`),
  getClinicServices: (id: string) => request<MedicalService[]>(`/api/clinics/${id}/services`),

  searchDoctors: (params: { searchTerm?: string; specialtyId?: string; clinicId?: string; page?: number }) =>
    request<PagedResult<Doctor>>('/api/doctors', {
      query: {
        SearchTerm: params.searchTerm,
        SpecialtyId: params.specialtyId,
        ClinicId: params.clinicId,
        Page: params.page ?? 1,
        PageSize: 12,
      },
    }),

  getDoctor: (id: string) => request<DoctorDetails>(`/api/doctors/${id}`),

  getAvailableSlots: (doctorId: string, branchId: string, serviceId: string, date: string) =>
    request<AvailableSlot[]>(`/api/doctors/${doctorId}/available-slots`, {
      query: { BranchId: branchId, ServiceId: serviceId, Date: date },
    }),

  // --- Pacient (kërkon token) ---
  createAppointment: (payload: CreateAppointmentRequest) =>
    request<Appointment>('/api/appointments', { method: 'POST', body: payload, auth: true }),

  getMyAppointments: (params: { page?: number; pageSize?: number; dateFrom?: string; dateTo?: string } = {}) =>
    request<PagedResult<Appointment>>('/api/appointments/my', {
      auth: true,
      query: {
        Page: params.page ?? 1,
        PageSize: clampPageSize(params.pageSize ?? 50),
        From: params.dateFrom,
        To: params.dateTo,
      },
    }),

  getMyAppointment: (id: string) => request<Appointment>(`/api/appointments/my/${id}`, { auth: true }),

  cancelAppointment: (id: string, reason?: string) =>
    request<void>(`/api/appointments/${id}/cancel`, { method: 'POST', body: { reason }, auth: true }),

  rescheduleAppointment: (id: string, newStartDateTime: string) =>
    request<Appointment>(`/api/appointments/${id}/reschedule`, {
      method: 'POST',
      body: { newStartDateTime },
      auth: true,
    }),

  // --- Profili i pacientit ---
  getMyProfile: () => request<PatientProfile>('/api/patients/me', { auth: true }),

  updateMyProfile: (payload: UpdatePatientProfileRequest) =>
    request<PatientProfile>('/api/patients/me', { method: 'PUT', body: payload, auth: true }),

  getDependents: () => request<Dependent[]>('/api/patients/me/dependents', { auth: true }),

  createDependent: (payload: CreateDependentRequest) =>
    request<Dependent>('/api/patients/me/dependents', { method: 'POST', body: payload, auth: true }),

  updateDependent: (id: string, payload: CreateDependentRequest) =>
    request<Dependent>(`/api/patients/me/dependents/${id}`, { method: 'PUT', body: payload, auth: true }),

  deleteDependent: (id: string) =>
    request<void>(`/api/patients/me/dependents/${id}`, { method: 'DELETE', auth: true }),

  // --- Kalendari i mjekut ---
  getDoctorAppointments: (params: { page?: number; pageSize?: number; dateFrom?: string; dateTo?: string; status?: AppointmentStatus } = {}) =>
    request<PagedResult<DoctorAppointment>>('/api/doctor/appointments', {
      auth: true,
      query: {
        Page: params.page ?? 1,
        PageSize: clampPageSize(params.pageSize ?? 50),
        From: params.dateFrom,
        To: params.dateTo,
        Status: params.status,
      },
    }),

  getDoctorAppointmentDetail: (id: string) =>
    request<DoctorAppointment>(`/api/doctor/appointments/${id}`, { auth: true }),

  confirmDoctorAppointment: (id: string) =>
    request<DoctorAppointment>(`/api/doctor/appointments/${id}/confirm`, { method: 'POST', auth: true }),

  completeDoctorAppointment: (id: string) =>
    request<DoctorAppointment>(`/api/doctor/appointments/${id}/complete`, { method: 'POST', auth: true }),

  markDoctorAppointmentNoShow: (id: string) =>
    request<DoctorAppointment>(`/api/doctor/appointments/${id}/no-show`, { method: 'POST', auth: true }),

  updateDoctorAppointmentInternalNote: (id: string, note: string) =>
    request<DoctorAppointment>(`/api/doctor/appointments/${id}/internal-note`, {
      method: 'PUT',
      body: { internalNote: note },
      auth: true,
    }),

  // --- Orari i punës i mjekut ---
  getWorkingSchedules: () => request<DoctorWorkingSchedule[]>('/api/doctor/working-schedules', { auth: true }),

  createWorkingSchedule: (payload: CreateWorkingScheduleRequest) =>
    request<DoctorWorkingSchedule>('/api/doctor/working-schedules', { method: 'POST', body: payload, auth: true }),

  deleteWorkingSchedule: (id: string) =>
    request<void>(`/api/doctor/working-schedules/${id}`, { method: 'DELETE', auth: true }),

  getUnavailability: (from?: string, to?: string) =>
    request<UnavailabilityDto[]>('/api/doctor/unavailability', { auth: true, query: { from, to } }),

  createUnavailability: (payload: CreateUnavailabilityRequest) =>
    request<UnavailabilityDto>('/api/doctor/unavailability', { method: 'POST', body: payload, auth: true }),

  deleteUnavailability: (id: string) =>
    request<void>(`/api/doctor/unavailability/${id}`, { method: 'DELETE', auth: true }),

  // --- Klinikat e Administratorit të Klinikës ---
  getAdminClinics: () => request<AdminClinic[]>('/api/admin/clinics', { auth: true }),

  getClinicReport: (clinicId: string, dateFrom: string, dateTo: string) =>
    request<ClinicReport>(`/api/admin/clinics/${clinicId}/report`, {
      auth: true,
      query: { from: dateFrom, to: dateTo },
    }),

  /**
   * Nuk ekziston GET /api/admin/clinics/{id} — marrim listën administrative
   * (për isApproved/isActive) dhe qytetin nga degët publike.
   */
  getAdminClinicDetail: async (id: string): Promise<AdminClinicDetail> => {
    const [clinics, details] = await Promise.all([
      request<AdminClinic[]>('/api/admin/clinics', { auth: true }),
      request<ClinicDetails>(`/api/clinics/${id}`).catch(() => null),
    ])
    const clinic = clinics.find((c) => c.id === id)
    if (!clinic) throw new ApiError('Klinika nuk u gjet ose nuk keni qasje.', 404)
    return { ...clinic, city: details?.branches[0]?.city ?? '' }
  },

  updateClinic: (id: string, payload: UpdateClinicRequest) =>
    request<AdminClinic>(`/api/admin/clinics/${id}`, { method: 'PUT', body: payload, auth: true }),

  getClinicUploadSignature: (id: string) =>
    request<CloudinarySignature>(`/api/admin/clinics/${id}/upload-signature`, { auth: true }),

  deactivateClinic: (id: string) =>
    request<AdminClinic>(`/api/admin/clinics/${id}/deactivate`, { method: 'POST', auth: true }),

  // --- SuperAdmin — klinikat ---
  createClinic: (payload: CreateClinicRequest) =>
    request<AdminClinic>('/api/admin/clinics', { method: 'POST', body: payload, auth: true }),

  approveClinic: (id: string) =>
    request<AdminClinic>(`/api/admin/clinics/${id}/approve`, { method: 'POST', auth: true }),

  activateClinic: (id: string) =>
    request<AdminClinic>(`/api/admin/clinics/${id}/activate`, { method: 'POST', auth: true }),

  assignClinicAdmin: (id: string, payload: AssignClinicAdminRequest) =>
    request<void>(`/api/admin/clinics/${id}/admins`, { method: 'POST', body: payload, auth: true }),

  // --- SuperAdmin — specializimet (CUD; GET vjen nga endpoint-i publik i specialties) ---
  createSpecialty: (payload: CreateSpecialtyRequest) =>
    request<Specialty>('/api/admin/specialties', { method: 'POST', body: payload, auth: true }),

  updateSpecialty: (id: string, payload: UpdateSpecialtyRequest) =>
    request<Specialty>(`/api/admin/specialties/${id}`, { method: 'PUT', body: payload, auth: true }),

  deleteSpecialty: (id: string) =>
    request<void>(`/api/admin/specialties/${id}`, { method: 'DELETE', auth: true }),

  // --- SuperAdmin — përdoruesit (nuk ka GET listë, vetëm veprime by-id) ---
  deactivateUser: (id: string) =>
    request<void>(`/api/admin/users/${id}/deactivate`, { method: 'POST', auth: true }),

  activateUser: (id: string) =>
    request<void>(`/api/admin/users/${id}/activate`, { method: 'POST', auth: true }),

  // --- SuperAdmin — regjistrat e auditimit ---
  getAuditLogs: (query: AuditLogQuery = {}) =>
    request<PagedResult<AuditLog>>('/api/admin/audit-logs', {
      auth: true,
      query: {
        EntityName: query.entityName,
        UserId: query.userId,
        From: query.from,
        To: query.to,
        Page: query.page ?? 1,
        PageSize: query.pageSize ?? 50,
      },
    }),

  /** Nuk ekziston listë administrative e degëve — përdorim endpoint-in publik. */
  getClinicBranches: (clinicId: string) =>
    request<ClinicBranch[]>(`/api/clinics/${clinicId}/branches`),

  createClinicBranch: (clinicId: string, payload: CreateBranchRequest) =>
    request<ClinicBranch>(`/api/admin/clinics/${clinicId}/branches`, {
      method: 'POST',
      body: payload,
      auth: true,
    }),

  createClinicService: (clinicId: string, payload: CreateMedicalServiceRequest) =>
    request<MedicalService>(`/api/admin/clinics/${clinicId}/services`, {
      method: 'POST',
      body: payload,
      auth: true,
    }),

  createClinicDoctor: (clinicId: string, payload: CreateDoctorRequest) =>
    request<AdminDoctor>(`/api/admin/clinics/${clinicId}/doctors`, {
      method: 'POST',
      body: payload,
      auth: true,
    }),

  createDoctorScheduleAsAdmin: (doctorId: string, payload: CreateWorkingScheduleRequest) =>
    request<DoctorWorkingSchedule>(`/api/admin/doctors/${doctorId}/working-schedules`, {
      method: 'POST',
      body: payload,
      auth: true,
    }),

  createDoctorUnavailabilityAsAdmin: (doctorId: string, payload: CreateUnavailabilityRequest) =>
    request<UnavailabilityDto>(`/api/admin/doctors/${doctorId}/unavailability`, {
      method: 'POST',
      body: payload,
      auth: true,
    }),
}
