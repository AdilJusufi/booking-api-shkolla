// Tests for the silent-refresh interceptor in lib/api.ts.
//
// What is NOT covered here: that the real backend issues valid refresh tokens,
// that rotation works end-to-end, or that theft detection revokes all sessions.
// Those require a running backend. These tests verify the client-side interceptor
// logic against a mocked server — the more likely class of bug, caught repeatably.
//
// Implementation note: api.ts uses a module-level `refreshInFlight` variable for
// deduplication. It is reset to null in a `.finally()` callback, so it is always
// null between tests as long as each test awaits its promises to completion.

import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '../test/server'
import { API_BASE_URL } from '../test/api-base'
import {
  ApiError,
  api,
  getRefreshToken,
  getToken,
  registerSessionExpiredHandler,
  setRefreshToken,
  setToken,
} from './api'
import { buildAppointment, pagedResult } from '../test/fixtures'

const u = (path: string) => `${API_BASE_URL}${path}`

const OLD_ACCESS  = 'old-access-token'
const OLD_REFRESH = 'old-refresh-token'
const NEW_ACCESS  = 'new-access-token'
const NEW_REFRESH = 'new-refresh-token'

// A valid AuthResponse body — only the fields refreshAccessToken() actually reads.
const REFRESH_RESPONSE = {
  accessToken: NEW_ACCESS,
  refreshToken: NEW_REFRESH,
  userId: 'u-001',
  firstName: 'Testi',
  lastName: 'Pacienti',
  email: 'test@rezervomjekun.com',
  roles: ['Patient'],
}

// Seed both tokens before every test.
beforeEach(() => {
  setToken(OLD_ACCESS)
  setRefreshToken(OLD_REFRESH)
})

// Prevent the session-expired spy from leaking across tests.
afterEach(() => {
  registerSessionExpiredHandler(() => undefined)
})

// ─── Shared handler factories ─────────────────────────────────────────────────

/**
 * An appointments handler that returns 401 for the old token and 200 for the
 * new one, mirroring how the real backend would behave after a token rotation.
 */
function appointmentsWithTokenCheck() {
  return http.get(u('/api/appointments/my'), ({ request }) => {
    if (request.headers.get('Authorization') === `Bearer ${NEW_ACCESS}`) {
      return HttpResponse.json(pagedResult([buildAppointment()]))
    }
    return new HttpResponse(null, { status: 401 })
  })
}

/**
 * A refresh endpoint that returns new tokens, with a counter you can inspect.
 */
function refreshEndpoint(opts: { status?: number } = {}) {
  const { status = 200 } = opts
  let callCount = 0
  const handler = http.post(u('/api/auth/refresh-token'), () => {
    callCount++
    if (status !== 200) {
      return new HttpResponse(JSON.stringify({ detail: 'Token ka skaduar.' }), { status })
    }
    return HttpResponse.json(REFRESH_RESPONSE)
  })
  return { handler, calls: () => callCount }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('silent-refresh interceptor', () => {

  // ── 1. Happy path ───────────────────────────────────────────────────────────
  it('refreshes on 401 and returns the retried response to the caller — the 401 never surfaces', async () => {
    const { handler: refresh, calls: refreshCalls } = refreshEndpoint()
    server.use(appointmentsWithTokenCheck(), refresh)

    // The caller should receive the successful (retried) response.
    const result = await api.getMyAppointments()

    expect(result.items).toHaveLength(1)
    expect(refreshCalls()).toBe(1)
  })

  // ── 2. Token rotation ───────────────────────────────────────────────────────
  it('persists both the new access token and the new refresh token after a rotation', async () => {
    const { handler: refresh } = refreshEndpoint()
    server.use(appointmentsWithTokenCheck(), refresh)

    await api.getMyAppointments()

    // A test that only checks the access token misses the rotation failure mode:
    // the next refresh silently fails an hour later with an obsolete refresh token.
    expect(getToken()).toBe(NEW_ACCESS)
    expect(getRefreshToken()).toBe(NEW_REFRESH)
  })

  // ── 3. Refresh failure clears the session ───────────────────────────────────
  it('clears both tokens and notifies the session-expired handler when the refresh call returns 401', async () => {
    const onExpired = vi.fn()
    registerSessionExpiredHandler(onExpired)

    const { handler: refresh } = refreshEndpoint({ status: 401 })
    // Appointments always 401 so the interceptor fires.
    server.use(
      http.get(u('/api/appointments/my'), () => new HttpResponse(null, { status: 401 })),
      refresh,
    )

    await expect(api.getMyAppointments()).rejects.toBeInstanceOf(ApiError)

    expect(getToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
    // The handler must be notified exactly once so the "session expired" toast
    // appears exactly once (a double-call would show it twice in the real app).
    expect(onExpired).toHaveBeenCalledTimes(1)
  })

  // ── 4a. No infinite loop — refresh 401 terminates ──────────────────────────
  it('does not retry the refresh call when the refresh endpoint itself returns 401', async () => {
    const { handler: refresh, calls: refreshCalls } = refreshEndpoint({ status: 401 })
    server.use(
      http.get(u('/api/appointments/my'), () => new HttpResponse(null, { status: 401 })),
      refresh,
    )

    await expect(api.getMyAppointments()).rejects.toBeInstanceOf(ApiError)

    // The refresh endpoint was hit once and the flow terminated — no recursion.
    expect(refreshCalls()).toBe(1)
  })

  // ── 4b. Retried request 401 does not trigger a second refresh ───────────────
  it('fails cleanly when the retried request also returns 401 — no second refresh cycle', async () => {
    const { handler: refresh, calls: refreshCalls } = refreshEndpoint()
    // Refresh succeeds but the original endpoint keeps returning 401.
    server.use(
      http.get(u('/api/appointments/my'), () => new HttpResponse(null, { status: 401 })),
      refresh,
    )

    await expect(api.getMyAppointments()).rejects.toBeInstanceOf(ApiError)

    // One refresh was attempted, but no second one because the interceptor block
    // inside request() executes at most once per call.
    expect(refreshCalls()).toBe(1)
  })

  // ── 5. Concurrent request deduplication ────────────────────────────────────
  it('fires exactly one refresh for a burst of concurrent 401s and retries all in-flight requests', async () => {
    const { handler: refresh, calls: refreshCalls } = refreshEndpoint()
    server.use(appointmentsWithTokenCheck(), refresh)

    // Three simultaneous authenticated requests — the realistic dashboard case.
    const [r1, r2, r3] = await Promise.all([
      api.getMyAppointments(),
      api.getMyAppointments(),
      api.getMyAppointments(),
    ])

    // One refresh, not three.
    expect(refreshCalls()).toBe(1)

    // All three callers received their successful responses.
    expect(r1.items).toHaveLength(1)
    expect(r2.items).toHaveLength(1)
    expect(r3.items).toHaveLength(1)
  })

  // ── 6. No refresh token present ────────────────────────────────────────────
  it('logs out immediately on 401 when no refresh token is stored — does not call the refresh endpoint', async () => {
    // Remove the refresh token; only the (expired) access token remains.
    setRefreshToken(null)

    server.use(
      http.get(u('/api/appointments/my'), () => new HttpResponse(null, { status: 401 })),
      // No refresh handler added. With onUnhandledRequest: 'error', any stray
      // call to the refresh endpoint would fail this test outright.
    )

    await expect(api.getMyAppointments()).rejects.toBeInstanceOf(ApiError)

    // Tokens are cleared by expireSession() on the direct-401 path.
    expect(getToken()).toBeNull()
  })

  // ── 7. Non-401 errors pass through untouched ────────────────────────────────
  it.each([
    ['400 Bad Request',            400],
    ['403 Forbidden',              403],
    ['404 Not Found',              404],
    ['500 Internal Server Error',  500],
  ])('%s does not trigger a refresh attempt', async (_label, status) => {
    server.use(
      http.get(u('/api/appointments/my'), () =>
        new HttpResponse(JSON.stringify({ detail: 'error' }), { status }),
      ),
      // No refresh handler — any call to it would hard-fail the test.
    )

    const err = await api.getMyAppointments().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(status)
  })

  // ── 8. Auth endpoint 401 is not intercepted ─────────────────────────────────
  it('surfaces a login 401 as a normal ApiError and does not attempt to refresh', async () => {
    server.use(
      http.post(u('/api/auth/login'), () =>
        new HttpResponse(
          JSON.stringify({ detail: 'Kredencialet janë të pasakta.' }),
          { status: 401 },
        ),
      ),
      // No refresh handler — any call to it would hard-fail the test.
    )

    const err = await api.login('wrong@rezervomjekun.com', 'wrongpassword').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(401)
  })

})
