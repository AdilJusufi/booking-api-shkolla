// Tests the request-building logic in api.ts directly, by capturing the
// actual outgoing request URL through MSW rather than asserting on internals.

import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../test/server'
import { API_BASE_URL } from '../test/api-base'
import { pagedResult } from '../test/fixtures'
import { api } from './api'

function captureRequestUrl(path: string): Promise<URL> {
  return new Promise((resolve) => {
    server.use(
      http.get(`${API_BASE_URL}${path}`, ({ request }) => {
        resolve(new URL(request.url))
        return HttpResponse.json(pagedResult([]))
      }),
    )
  })
}

beforeEach(() => {
  localStorage.setItem('rezervo.accessToken', 'test-token')
})

describe('api.getMyAppointments — query construction (3c)', () => {
  it('a default load sends page and pageSize within backend limits, with no date filters', async () => {
    const captured = captureRequestUrl('/api/appointments/my')
    await api.getMyAppointments({})
    const url = await captured

    expect(url.searchParams.get('Page')).toBe('1')
    const pageSize = Number(url.searchParams.get('PageSize'))
    expect(pageSize).toBeGreaterThanOrEqual(1)
    expect(pageSize).toBeLessThanOrEqual(100)
  })

  it('omits unset date filters from the query string rather than sending them as empty strings', async () => {
    const captured = captureRequestUrl('/api/appointments/my')
    await api.getMyAppointments({ page: 1, pageSize: 20 })
    const url = await captured

    expect(url.searchParams.has('From')).toBe(false)
    expect(url.searchParams.has('To')).toBe(false)
  })

  it('serialises date filters verbatim as yyyy-MM-dd when provided', async () => {
    const captured = captureRequestUrl('/api/appointments/my')
    await api.getMyAppointments({ dateFrom: '2026-08-01', dateTo: '2026-08-31' })
    const url = await captured

    expect(url.searchParams.get('From')).toBe('2026-08-01')
    expect(url.searchParams.get('To')).toBe('2026-08-31')
  })

  it('a pageSize of 100 (the backend maximum) is sent through unchanged', async () => {
    const captured = captureRequestUrl('/api/appointments/my')
    await api.getMyAppointments({ pageSize: 100 })
    const url = await captured

    expect(url.searchParams.get('PageSize')).toBe('100')
  })

  it('a pageSize of 101 does not get sent — it is clamped to the backend maximum', async () => {
    const captured = captureRequestUrl('/api/appointments/my')
    await api.getMyAppointments({ pageSize: 101 })
    const url = await captured

    expect(url.searchParams.get('PageSize')).not.toBe('101')
    expect(Number(url.searchParams.get('PageSize'))).toBeLessThanOrEqual(100)
  })
})

describe('api.getDoctorAppointments — query construction (3c)', () => {
  it('omits the status filter when unset rather than sending an empty value', async () => {
    const captured = captureRequestUrl('/api/doctor/appointments')
    await api.getDoctorAppointments({ dateFrom: '2026-08-10', dateTo: '2026-08-16' })
    const url = await captured

    expect(url.searchParams.has('Status')).toBe(false)
    expect(url.searchParams.get('From')).toBe('2026-08-10')
    expect(url.searchParams.get('To')).toBe('2026-08-16')
  })

  it('a pageSize of 101 does not get sent — it is clamped to the backend maximum', async () => {
    const captured = captureRequestUrl('/api/doctor/appointments')
    await api.getDoctorAppointments({ pageSize: 101 })
    const url = await captured

    expect(Number(url.searchParams.get('PageSize'))).toBeLessThanOrEqual(100)
  })
})

describe('api search query construction — omission of unset filters (3c)', () => {
  it('searchClinics omits city/specialty/searchTerm when unset', async () => {
    const captured = captureRequestUrl('/api/clinics')
    await api.searchClinics({})
    const url = await captured

    expect(url.searchParams.has('City')).toBe(false)
    expect(url.searchParams.has('SpecialtyId')).toBe(false)
    expect(url.searchParams.has('SearchTerm')).toBe(false)
    expect(url.searchParams.get('Page')).toBe('1')
  })

  it('searchClinics sends an empty-string filter as omitted, not as City=', async () => {
    const captured = captureRequestUrl('/api/clinics')
    await api.searchClinics({ city: '' })
    const url = await captured

    expect(url.searchParams.has('City')).toBe(false)
  })
})
