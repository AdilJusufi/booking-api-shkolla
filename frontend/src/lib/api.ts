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
  confirmEmail: (token: string) =>
    request<void>('/api/auth/confirm-email', { method: 'POST', body: { token } }),
  forgotPassword: (email: string) =>
    request<void>('/api/auth/forgot-password', { method: 'POST', body: { email } }),
  resetPassword: (token: string, email: string, newPassword: string) =>
    request<void>('/api/auth/reset-password', { method: 'POST', body: { token, email, newPassword } }),

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
        PageSize: params.pageSize ?? 50,
        From: params.dateFrom,
        To: params.dateTo,
      },
    }),

  cancelAppointment: (id: string, reason?: string) =>
    request<void>(`/api/appointments/${id}/cancel`, { method: 'POST', body: { reason }, auth: true }),
}


//  claude said:

// ── Token management ──────────────────────────────────────────────────────────
// let _refreshToken: string | null = null;                    // in-memory only
// export const setRefreshToken = (t: string) => { _refreshToken = t; };
// export const getRefreshToken = () => _refreshToken;
// export const clearTokens = () => {
//   localStorage.removeItem('accessToken');
//   localStorage.removeItem('user');
//   _refreshToken = null;
// };

// // ── Base fetch with auto-refresh ──────────────────────────────────────────────
// let _refreshPromise: Promise<string> | null = null;

// export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
//   const token = localStorage.getItem('accessToken');
//   const headers = new Headers(init.headers);
//   if (token) headers.set('Authorization', `Bearer ${token}`);
//   headers.set('Content-Type', 'application/json');

//   let res = await fetch(`${import.meta.env.VITE_API_URL}${path}`, { ...init, headers });

//   if (res.status === 401 && _refreshToken) {
//     // Deduplicate concurrent refresh calls
//     if (!_refreshPromise) {
//       _refreshPromise = refreshAccessToken().finally(() => { _refreshPromise = null; });
//     }
//     try {
//       const newToken = await _refreshPromise;
//       headers.set('Authorization', `Bearer ${newToken}`);
//       res = await fetch(`${import.meta.env.VITE_API_URL}${path}`, { ...init, headers });
//     } catch {
//       clearTokens();
//       window.location.href = '/hyr';
//     }
//   }

//   return res;
// }

// async function refreshAccessToken(): Promise<string> {
//   const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/refresh-token`, {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({ refreshToken: _refreshToken }),
//   });
//   if (!res.ok) throw new Error('Refresh failed');
//   const data = await res.json();
//   localStorage.setItem('accessToken', data.accessToken);
//   _refreshToken = data.refreshToken;   // rotate
//   return data.accessToken;
// }

// // ── Auth endpoints ────────────────────────────────────────────────────────────
// export async function login(email: string, password: string) {
//   const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/login`, {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({ email, password }),
//   });
//   if (!res.ok) throw await res.json();
//   const data = await res.json();
//   localStorage.setItem('accessToken', data.accessToken);
//   localStorage.setItem('user', JSON.stringify(data.user));
//   setRefreshToken(data.refreshToken);
//   return data;
// }

// export async function logout() {
//   try {
//     await apiFetch('/api/auth/revoke-token', {
//       method: 'POST',
//       body: JSON.stringify({ refreshToken: _refreshToken }),
//     });
//   } finally {
//     clearTokens();
//   }
// }

// export const forgotPassword = (email: string) =>
//   fetch(`${import.meta.env.VITE_API_URL}/api/auth/forgot-password`, {
//     method: 'POST', headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({ email }),
//   });

// export const resetPassword = (token: string, email: string, newPassword: string) =>
//   fetch(`${import.meta.env.VITE_API_URL}/api/auth/reset-password`, {
//     method: 'POST', headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({ token, email, newPassword }),
//   });

// export const confirmEmail = (token: string) =>
//   fetch(`${import.meta.env.VITE_API_URL}/api/auth/confirm-email`, {
//     method: 'POST', headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({ token }),
//   });

// export const changePassword = (currentPassword: string, newPassword: string) =>
//   apiFetch('/api/auth/change-password', {
//     method: 'POST',
//     body: JSON.stringify({ currentPassword, newPassword }),
//   });



///////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////
// Patient — appointments
// export const getMyAppointments = (params?: {
//   status?: string; dateFrom?: string; dateTo?: string; page?: number; pageSize?: number;
// }) => apiFetch(`/api/appointments/my?${new URLSearchParams(params as any)}`);

// export const getMyAppointment = (id: string) =>
//   apiFetch(`/api/appointments/my/${id}`);

// export const cancelAppointment = (id: string) =>
//   apiFetch(`/api/appointments/${id}/cancel`, { method: 'POST' });

// export const rescheduleAppointment = (id: string, newStartDateTime: string) =>
//   apiFetch(`/api/appointments/${id}/reschedule`, {
//     method: 'POST',
//     body: JSON.stringify({ newStartDateTime }),
//   });

// // Patient — profile
// export const getMyProfile = () => apiFetch('/api/patients/me');

// export const updateMyProfile = (data: Partial<PatientProfile>) =>
//   apiFetch('/api/patients/me', { method: 'PUT', body: JSON.stringify(data) });

// // Patient — dependents
// export const getDependents = () => apiFetch('/api/patients/me/dependents');

// export const addDependent = (data: CreateDependentRequest) =>
//   apiFetch('/api/patients/me/dependents', { method: 'POST', body: JSON.stringify(data) });

// export const updateDependent = (id: string, data: Partial<CreateDependentRequest>) =>
//   apiFetch(`/api/patients/me/dependents/${id}`, { method: 'PUT', body: JSON.stringify(data) });

// export const deleteDependent = (id: string) =>
//   apiFetch(`/api/patients/me/dependents/${id}`, { method: 'DELETE' });


/////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////

// ── Doctor — Appointments ────────────────────────────────────────────────────
// export const getDoctorAppointments = (params?: {
//   status?: string; dateFrom?: string; dateTo?: string; page?: number; pageSize?: number;
// }) => apiFetch(`/api/doctor/appointments?${new URLSearchParams(params as any)}`);

// export const getDoctorAppointment = (id: string) =>
//   apiFetch(`/api/doctor/appointments/${id}`);

// export const confirmAppointment = (id: string) =>
//   apiFetch(`/api/doctor/appointments/${id}/confirm`, { method: 'POST' });

// export const completeAppointment = (id: string) =>
//   apiFetch(`/api/doctor/appointments/${id}/complete`, { method: 'POST' });

// export const markNoShow = (id: string) =>
//   apiFetch(`/api/doctor/appointments/${id}/no-show`, { method: 'POST' });

// export const updateInternalNote = (id: string, internalNote: string) =>
//   apiFetch(`/api/doctor/appointments/${id}/internal-note`, {
//     method: 'PUT',
//     body: JSON.stringify({ internalNote }),
//   });

// // ── Doctor — Working Schedules ───────────────────────────────────────────────
// export const getWorkingSchedules = () =>
//   apiFetch('/api/doctor/working-schedules');

// export const addWorkingSchedule = (data: CreateScheduleRequest) =>
//   apiFetch('/api/doctor/working-schedules', {
//     method: 'POST',
//     body: JSON.stringify(data),
//   });

// export const deleteWorkingSchedule = (id: string) =>
//   apiFetch(`/api/doctor/working-schedules/${id}`, { method: 'DELETE' });

// // ── Doctor — Unavailability ──────────────────────────────────────────────────
// export const getUnavailability = () =>
//   apiFetch('/api/doctor/unavailability');

// export const addUnavailability = (data: CreateUnavailabilityRequest) =>
//   apiFetch('/api/doctor/unavailability', {
//     method: 'POST',
//     body: JSON.stringify(data),
//   });

// export const deleteUnavailability = (id: string) =>
//   apiFetch(`/api/doctor/unavailability/${id}`, { method: 'DELETE' });

// // ── TypeScript interfaces ─────────────────────────────────────────────────────
// interface CreateScheduleRequest {
//   clinicBranchId: string;
//   dayOfWeek: number;           // 0 = Sunday ... 6 = Saturday
//   startTime: string;           // "HH:mm"
//   endTime: string;             // "HH:mm"
//   slotDurationMinutes: number;
//   validFrom?: string;          // ISO date
//   validUntil?: string;         // ISO date
// }

// interface CreateUnavailabilityRequest {
//   clinicBranchId?: string;
//   startDateTime: string;       // ISO 8601
//   endDateTime: string;
//   reason?: string;
// }

// interface DoctorWorkingSchedule {
//   id: string;
//   clinicBranchId: string;
//   branchName: string;
//   clinicName: string;
//   dayOfWeek: number;
//   startTime: string;
//   endTime: string;
//   slotDurationMinutes: number;
//   validFrom?: string;
//   validUntil?: string;
//   isActive: boolean;
// }

// interface DoctorUnavailability {
//   id: string;
//   clinicBranchId?: string;
//   branchName?: string;
//   startDateTime: string;
//   endDateTime: string;
//   reason?: string;
// }



/////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////



// ── Clinic Admin — Clinics ───────────────────────────────────────────────────
// export const getAdminClinics = () =>
//   apiFetch('/api/admin/clinics');

// export const updateClinic = (id: string, data: Partial<ClinicUpdateRequest>) =>
//   apiFetch(`/api/admin/clinics/${id}`, { method: 'PUT', body: JSON.stringify(data) });

// export const addBranch = (clinicId: string, data: CreateBranchRequest) =>
//   apiFetch(`/api/admin/clinics/${clinicId}/branches`, {
//     method: 'POST', body: JSON.stringify(data),
//   });

// export const addService = (clinicId: string, data: CreateServiceRequest) =>
//   apiFetch(`/api/admin/clinics/${clinicId}/services`, {
//     method: 'POST', body: JSON.stringify(data),
//   });

// export const addDoctorToClinic = (clinicId: string, data: CreateDoctorRequest) =>
//   apiFetch(`/api/admin/clinics/${clinicId}/doctors`, {
//     method: 'POST', body: JSON.stringify(data),
//   });

// export const getClinicReport = (clinicId: string, dateFrom: string, dateTo: string) =>
//   apiFetch(`/api/admin/clinics/${clinicId}/report?dateFrom=${dateFrom}&dateTo=${dateTo}`);

// // ── Clinic Admin — Doctor schedules ─────────────────────────────────────────
// export const adminAddDoctorSchedule = (doctorId: string, data: CreateScheduleRequest) =>
//   apiFetch(`/api/admin/doctors/${doctorId}/working-schedules`, {
//     method: 'POST', body: JSON.stringify(data),
//   });

// export const adminAddDoctorUnavailability = (doctorId: string, data: CreateUnavailabilityRequest) =>
//   apiFetch(`/api/admin/doctors/${doctorId}/unavailability`, {
//     method: 'POST', body: JSON.stringify(data),
//   });

// // ── Clinic Admin — Appointments ──────────────────────────────────────────────
// export const adminBookAppointment = (data: AdminBookRequest) =>
//   apiFetch('/api/admin/appointments', { method: 'POST', body: JSON.stringify(data) });

// export const adminUpdateAppointment = (id: string, data: AdminUpdateRequest) =>
//   apiFetch(`/api/admin/appointments/${id}`, { method: 'PUT', body: JSON.stringify(data) });

// export const adminCancelAppointment = (id: string) =>
//   apiFetch(`/api/admin/appointments/${id}/cancel`, { method: 'POST' });

// export const adminRescheduleAppointment = (id: string, newStartDateTime: string) =>
//   apiFetch(`/api/admin/appointments/${id}/reschedule`, {
//     method: 'POST', body: JSON.stringify({ newStartDateTime }),
//   });

// // ── TypeScript interfaces ────────────────────────────────────────────────────
// interface ClinicUpdateRequest {
//   name: string;
//   email?: string;
//   phone?: string;
//   website?: string;
//   description?: string;
// }

// interface CreateBranchRequest {
//   name: string;
//   address: string;
//   city: string;
//   municipality?: string;
//   lat?: number;
//   lng?: number;
//   phone?: string;
// }

// interface CreateServiceRequest {
//   specialtyId: string;
//   name: string;
//   description?: string;
//   durationMinutes: number;
//   price: number;
//   currency: string;
// }

// interface CreateDoctorRequest {
//   firstName: string;
//   lastName: string;
//   email: string;
//   licenseNumber: string;
//   specialtyIds: string[];
//   yearsOfExperience?: number;
//   clinicBranchId: string;
//   biography?: string;
// }

// interface AdminBookRequest {
//   doctorId: string;
//   clinicBranchId: string;
//   medicalServiceId: string;
//   startDateTime: string;
//   patientEmail: string;
//   notes?: string;
// }

// interface AdminUpdateRequest {
//   startDateTime?: string;
//   notes?: string;
// }