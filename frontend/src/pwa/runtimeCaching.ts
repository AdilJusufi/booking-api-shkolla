// ────────────────────────────────────────────────────────────────────────────
//  Workbox runtime caching rules. ORDER IS LOAD-BEARING.
//
//  Workbox matches routes in registration order and the FIRST match wins, so
//  every NetworkOnly deny rule sits before any caching rule. If you add a
//  rule, add deny rules above the allow rules, never below.
//
//  This is a medical app. Nothing patient-identifying, nothing authenticated,
//  and nothing time-sensitive is written to disk. When in doubt: do not cache.
//  An endpoint with no matching route just goes to the network uncached, which
//  is the safe default.
//
//  urlPattern is a *function*, not a RegExp, for two reasons:
//   1. The API is cross-origin (VITE_API_URL != app origin). Workbox ignores a
//      RegExp route on a cross-origin request unless the match starts at index
//      0 — an easy and silent footgun.
//   2. Matching on url.pathname is origin-agnostic, so these rules hold in dev
//      (localhost:5080) and in production alike.
//
//  These functions are serialised into the generated service worker by
//  workbox-build, so each one MUST be self-contained: no references to
//  module scope, no shared helpers, no closures.
//
//  Lives in its own module (rather than inline in vite.config.ts) so the
//  matchers can be unit-tested directly — see runtimeCaching.test.ts.
// ────────────────────────────────────────────────────────────────────────────

export type RuntimeCacheHandler = 'NetworkOnly' | 'NetworkFirst' | 'StaleWhileRevalidate' | 'CacheFirst'

export interface RuntimeCacheRule {
  urlPattern: (context: { url: URL; request: Request }) => boolean
  handler: RuntimeCacheHandler
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  options?: {
    cacheName?: string
    expiration?: { maxEntries?: number; maxAgeSeconds?: number }
    cacheableResponse?: { statuses: number[] }
  }
}

export const runtimeCaching: RuntimeCacheRule[] = [
  // ---- DENY: credentials and tokens ----------------------------------------
  {
    urlPattern: ({ url }) => url.pathname.startsWith('/api/auth/'),
    handler: 'NetworkOnly',
  },
  // ---- DENY: all appointment data ------------------------------------------
  // A cached "Confirmed" that is now "Cancelled" is actively harmful.
  {
    urlPattern: ({ url }) => url.pathname.startsWith('/api/appointments'),
    handler: 'NetworkOnly',
  },
  // ---- DENY: real-time slot availability ------------------------------------
  // A stale slot leads straight to a 409 and a failed booking. Checked before
  // the doctor-detail rule below, which is otherwise a near-miss for
  // /api/doctors/{id}/available-slots.
  {
    urlPattern: ({ url }) => url.pathname.includes('/available-slots'),
    handler: 'NetworkOnly',
  },
  // ---- DENY: patient profile + dependents (authenticated) -------------------
  {
    urlPattern: ({ url }) => url.pathname.startsWith('/api/patients/'),
    handler: 'NetworkOnly',
  },
  // ---- DENY: doctor portal (authenticated) ----------------------------------
  // NOTE the singular: '/api/doctor/' is the authenticated doctor portal;
  // '/api/doctors/' is the public directory. This prefix cannot match the
  // plural because the next character there is 's'.
  {
    urlPattern: ({ url }) => url.pathname.startsWith('/api/doctor/'),
    handler: 'NetworkOnly',
  },
  // ---- DENY: clinic admin + super admin (authenticated) ---------------------
  {
    urlPattern: ({ url }) => url.pathname.startsWith('/api/admin/'),
    handler: 'NetworkOnly',
  },
  // ---- DENY: every mutation, on any path ------------------------------------
  // Workbox only routes GET by default, so these are belt-and-braces: they
  // make the intent explicit and stop a future rule from ever background-
  // syncing a booking.
  { urlPattern: ({ url }) => url.pathname.startsWith('/api/'), handler: 'NetworkOnly', method: 'POST' },
  { urlPattern: ({ url }) => url.pathname.startsWith('/api/'), handler: 'NetworkOnly', method: 'PUT' },
  { urlPattern: ({ url }) => url.pathname.startsWith('/api/'), handler: 'NetworkOnly', method: 'DELETE' },
  { urlPattern: ({ url }) => url.pathname.startsWith('/api/'), handler: 'NetworkOnly', method: 'PATCH' },

  // ---- ALLOW: public reference data -----------------------------------------
  // Specialties are a near-static lookup list. The `authorization` guard is
  // defence in depth: these endpoints are unauthenticated today, and if that
  // ever changes the response stops being cached rather than silently landing
  // on disk.
  {
    urlPattern: ({ url, request }) =>
      url.pathname === '/api/specialties' && !request.headers.has('authorization'),
    handler: 'StaleWhileRevalidate',
    options: {
      cacheName: 'rezervo-specialties',
      expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 7 },
      cacheableResponse: { statuses: [200] },
    },
  },
  // ---- ALLOW: public clinic detail (+ its sub-resources) --------------------
  // Matches /api/clinics/{id} and /api/clinics/{id}/(doctors|services|branches).
  // Deliberately NOT the search list (/api/clinics?...): filtered result sets
  // are lower value to cache and higher churn.
  {
    urlPattern: ({ url, request }) =>
      /^\/api\/clinics\/[^/]+(\/(doctors|services|branches))?$/.test(url.pathname) &&
      !request.headers.has('authorization'),
    handler: 'StaleWhileRevalidate',
    options: {
      cacheName: 'rezervo-clinic-detail',
      expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 },
      cacheableResponse: { statuses: [200] },
    },
  },
  // ---- ALLOW: public doctor detail -------------------------------------------
  // Matches /api/doctors/{id} only. The trailing [^/]+$ cannot match
  // /api/doctors/{id}/available-slots, and the deny rule above catches it first
  // regardless.
  {
    urlPattern: ({ url, request }) =>
      /^\/api\/doctors\/[^/]+$/.test(url.pathname) && !request.headers.has('authorization'),
    handler: 'StaleWhileRevalidate',
    options: {
      cacheName: 'rezervo-doctor-detail',
      expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 },
      cacheableResponse: { statuses: [200] },
    },
  },

  // ---- ALLOW: web fonts (no user data) ---------------------------------------
  {
    urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
    handler: 'StaleWhileRevalidate',
    options: {
      cacheName: 'rezervo-google-fonts-stylesheets',
      expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 7 },
    },
  },
  {
    urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
    handler: 'CacheFirst',
    options: {
      cacheName: 'rezervo-google-fonts-files',
      expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
      cacheableResponse: { statuses: [0, 200] },
    },
  },
]

/**
 * Resolves which rule Workbox would apply to a request, using the same
 * first-match-wins semantics. Returns null when no rule matches, which means
 * the request goes to the network uncached.
 */
export function resolveHandler(
  rawUrl: string,
  init: { method?: string; headers?: Record<string, string> } = {},
): RuntimeCacheHandler | null {
  const method = (init.method ?? 'GET').toUpperCase()
  const url = new URL(rawUrl)
  const request = { headers: new Headers(init.headers ?? {}) } as Request

  for (const rule of runtimeCaching) {
    if ((rule.method ?? 'GET') !== method) continue
    if (rule.urlPattern({ url, request })) return rule.handler
  }
  return null
}
