import type {
  Appointment,
  AuthResponse,
  AvailableSlot,
  Clinic,
  ClinicDetails,
  CreateAppointmentRequest,
  Doctor,
  DoctorDetails,
  MedicalService,
  PagedResult,
  RegisterRequest,
  Specialty,
} from './types'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5080'

const TOKEN_KEY = 'termini.accessToken'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}
export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
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

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (auth) {
    const token = getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError('Nuk u lidhëm dot me serverin. A është backend-i i ndezur?', 0)
  }

  if (response.status === 204) return undefined as T

  const text = await response.text()
  const data = text ? safeParse(text) : null

  if (!response.ok) {
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

  getMyAppointments: (params: { page?: number } = {}) =>
    request<PagedResult<Appointment>>('/api/appointments/my', {
      auth: true,
      query: { Page: params.page ?? 1, PageSize: 50 },
    }),

  cancelAppointment: (id: string, reason?: string) =>
    request<void>(`/api/appointments/${id}/cancel`, { method: 'POST', body: { reason }, auth: true }),
}
