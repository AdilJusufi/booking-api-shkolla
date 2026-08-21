// The consequential test in the PWA work: proves that no authenticated,
// patient-identifying, or time-sensitive endpoint is ever written to disk.
//
// resolveHandler() replays Workbox's first-match-wins semantics over the same
// rule array that vite.config.ts feeds to workbox-build, so a reordering that
// would start caching patient data fails here rather than in production.
import { describe, expect, it } from 'vitest'
import { resolveHandler, runtimeCaching } from './runtimeCaching'

// The app talks to a different origin than it is served from; every rule must
// hold regardless of which. Both are exercised for each case below.
const ORIGINS = ['http://localhost:5080', 'https://api.rezervomjekun.com']

/** Asserts a path resolves the same way from every API origin. */
function handlerFor(path: string, init?: { method?: string; headers?: Record<string, string> }) {
  const results = ORIGINS.map((origin) => resolveHandler(origin + path, init))
  expect(new Set(results).size, `origin-dependent result for ${path}: ${JSON.stringify(results)}`).toBe(1)
  return results[0]
}

/** Anything not served straight from the network is, by definition, on disk. */
function expectNeverCached(path: string, init?: { method?: string; headers?: Record<string, string> }) {
  const handler = handlerFor(path, init)
  expect(handler === 'NetworkOnly' || handler === null, `${path} resolved to ${handler}`).toBe(true)
}

describe('runtime caching — endpoints that must never touch the cache', () => {
  it.each([
    ['/api/appointments/my'],
    ['/api/appointments/my/appt-123'],
    ['/api/appointments/appt-123/cancel'],
    ['/api/appointments'],
  ])('appointment data: %s', (path) => expectNeverCached(path))

  it.each([
    ['/api/doctors/doctor-1/available-slots'],
    ['/api/doctors/doctor-1/available-slots?Date=2026-08-20'],
  ])('real-time slot availability: %s', (path) => expectNeverCached(path))

  it.each([
    ['/api/patients/me'],
    ['/api/patients/me/dependents'],
    ['/api/patients/me/dependents/dep-1'],
  ])('patient profile data: %s', (path) => expectNeverCached(path))

  it.each([
    ['/api/doctor/appointments'],
    ['/api/doctor/appointments/appt-1'],
    ['/api/doctor/working-schedules'],
    ['/api/doctor/unavailability'],
  ])('authenticated doctor portal: %s', (path) => expectNeverCached(path))

  it.each([
    ['/api/admin/clinics'],
    ['/api/admin/clinics/clinic-1/report'],
    ['/api/admin/audit-logs'],
    ['/api/admin/users/user-1/deactivate'],
  ])('admin + super-admin: %s', (path) => expectNeverCached(path))

  it.each([
    ['/api/auth/login'],
    ['/api/auth/register'],
    ['/api/auth/refresh-token'],
    ['/api/auth/reset-password'],
    ['/api/auth/change-password'],
  ])('credentials and tokens: %s', (path) => expectNeverCached(path))

  it.each(['POST', 'PUT', 'DELETE', 'PATCH'])('every %s mutation, on any api path', (method) => {
    expectNeverCached('/api/appointments', { method })
    expectNeverCached('/api/clinics/clinic-1', { method })
    expectNeverCached('/api/specialties', { method })
  })

  it('never caches a request carrying an Authorization header, even on an otherwise cacheable path', () => {
    const headers = { authorization: 'Bearer some-access-token' }
    expectNeverCached('/api/specialties', { headers })
    expectNeverCached('/api/clinics/clinic-1', { headers })
    expectNeverCached('/api/doctors/doctor-1', { headers })
  })
})

describe('runtime caching — public reference data that is safe to cache', () => {
  it('caches the specialties lookup', () => {
    expect(handlerFor('/api/specialties')).toBe('StaleWhileRevalidate')
  })

  it.each([
    ['/api/clinics/clinic-1'],
    ['/api/clinics/clinic-1/doctors'],
    ['/api/clinics/clinic-1/services'],
    ['/api/clinics/clinic-1/branches'],
  ])('caches public clinic detail: %s', (path) => {
    expect(handlerFor(path)).toBe('StaleWhileRevalidate')
  })

  it('caches public doctor detail', () => {
    expect(handlerFor('/api/doctors/doctor-1')).toBe('StaleWhileRevalidate')
  })

  it('leaves filtered search results uncached — they churn and are low value', () => {
    expect(handlerFor('/api/clinics?City=Prishtin%C3%AB')).toBeNull()
    expect(handlerFor('/api/doctors?SearchTerm=gashi')).toBeNull()
  })
})

describe('runtime caching — ordering invariant', () => {
  it('registers every NetworkOnly deny rule before the first caching rule', () => {
    const firstCaching = runtimeCaching.findIndex((r) => r.handler !== 'NetworkOnly')
    const lastDeny = runtimeCaching.map((r) => r.handler).lastIndexOf('NetworkOnly')
    expect(
      lastDeny,
      'a NetworkOnly rule appears after a caching rule — first-match-wins means it may never be reached',
    ).toBeLessThan(firstCaching)
  })

  it('resolves the available-slots deny rule ahead of the doctor-detail caching rule', () => {
    // These two paths differ only by a trailing segment; the deny rule must win.
    expect(handlerFor('/api/doctors/doctor-1')).toBe('StaleWhileRevalidate')
    expect(handlerFor('/api/doctors/doctor-1/available-slots')).toBe('NetworkOnly')
  })

  it('does not let the authenticated /api/doctor/ prefix leak into public /api/doctors/', () => {
    // One character apart; a sloppy prefix would silently cache the doctor portal.
    expect(handlerFor('/api/doctor/appointments')).toBe('NetworkOnly')
    expect(handlerFor('/api/doctors/doctor-1')).toBe('StaleWhileRevalidate')
  })
})
