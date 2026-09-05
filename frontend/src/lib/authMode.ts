/**
 * The two sides of the sign-in / sign-up toggle. The backend has a single
 * /api/auth/login endpoint and a single set of roles — this mode is purely a
 * client-side lens over that: it picks which roles are expected, which portal
 * the user lands in, and which registration form is shown.
 */
export const AUTH_MODES = ['patient', 'clinic'] as const

export type AuthMode = (typeof AUTH_MODES)[number]

/** Roles each side of the toggle accepts.
 *
 * SuperAdmin sits on the clinic side deliberately: it has no patient portal of
 * its own, and administering clinics is the closest thing to what the clinic
 * tab means. It still lands in ROLE_HOME.SuperAdmin (/super-admin/...), not in
 * a clinic's own panel — the tab is the door, not the destination. */
export const MODE_ROLES: Record<AuthMode, readonly string[]> = {
  patient: ['Patient'],
  clinic: ['ClinicAdmin', 'Doctor', 'SuperAdmin'],
}

/** URL round-trip: /hyr?si=klinike. Albanian values, to match the route slugs
 * the rest of the app uses (/hyr, /regjistrohu) rather than mixing languages. */
const MODE_PARAM = 'si'

const PARAM_TO_MODE: Record<string, AuthMode> = {
  pacient: 'patient',
  klinike: 'clinic',
}

const MODE_TO_PARAM: Record<AuthMode, string> = {
  patient: 'pacient',
  clinic: 'klinike',
}

/** Patient is the default: it's the overwhelmingly common case, and it keeps a
 * bare /hyr behaving exactly as it did before the toggle existed. */
export function readAuthMode(search: string): AuthMode {
  const raw = new URLSearchParams(search).get(MODE_PARAM)
  return (raw && PARAM_TO_MODE[raw.toLowerCase()]) || 'patient'
}

/** Search string for a mode — empty for the default, so /hyr stays clean. */
export function authModeSearch(mode: AuthMode): string {
  return mode === 'patient' ? '' : `?${MODE_PARAM}=${MODE_TO_PARAM[mode]}`
}

export function rolesMatchMode(roles: readonly string[], mode: AuthMode): boolean {
  return roles.some((role) => MODE_ROLES[mode].includes(role))
}
