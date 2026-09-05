// Central error-to-message mapping. Every error surface in the app should
// route through getErrorMessage() rather than displaying ApiError.message
// (which may contain raw backend/RFC 7807 text) directly.
//
// This module has no React tree to hook into (it runs from catch blocks and
// event handlers all over the app, not component bodies), so it reads
// i18next directly via i18n.t() rather than the useTranslation() hook. Every
// lookup happens at call time, not at module load, so it always reflects
// whatever language is active *when the error occurs* — including a language
// switch made after the module was first imported.
import i18n from '../i18n'
import { ApiError } from './api'

function tCommon(key: string): string {
  return i18n.t(key, { ns: 'common' })
}

function tAuth(key: string): string {
  return i18n.t(key, { ns: 'auth' })
}

/** The double-booking conflict: the slot was taken between page load and submit. */
export function getSlotTakenMessage(): string {
  return tCommon('errors.slotTaken')
}

/** The optimistic-concurrency conflict: someone else edited the record first. */
export function getStaleRecordMessage(): string {
  return tCommon('errors.staleRecord')
}

// --- Auth-specific copy -----------------------------------------------------
// The backend now returns a structured `code` field (and matching RFC 7807
// `type` suffix) on every AuthenticationFailedException — see
// ExceptionHandlingMiddleware and AuthErrorCodes on the backend. Login's 401s
// use invalid_credentials / account_locked / email_not_confirmed; the 403
// deactivated-account case uses account_deactivated. classifyLoginError()
// below reads `code` first and only falls back to matching the backend's
// fixed Albanian `detail` text for clients/caches that predate the code field
// — that text is not UI copy, so it is not translated; only the messages
// shown to the user are.
//
// Functions, not constants, same reasoning as getSlotTakenMessage() above.
// Every call site already renders inside a component that has loaded the
// 'auth' namespace (LoginPage etc. use useTranslation('auth') themselves and
// suspend on it), so by the time a user can trigger one of these — submitting
// a form — the namespace is guaranteed to be ready.

export function getLoginInvalidCredentialsMessage(): string {
  return tAuth('login.invalidCredentials')
}

export function getLoginLockedMessage(): string {
  return tAuth('login.locked')
}

export function getLoginUnconfirmedEmailMessage(): string {
  return tAuth('login.unconfirmedEmail')
}

export function getLoginDeactivatedMessage(): string {
  return tAuth('login.deactivated')
}

export function getChangePasswordWrongCurrentMessage(): string {
  return tAuth('changePassword.wrongCurrent')
}

export function getAuthTokenInvalidMessage(): string {
  return tAuth('resetPassword.tokenInvalid')
}

export type LoginErrorKind = 'locked' | 'unconfirmed' | 'deactivated' | 'invalid' | 'other'

const LOGIN_ERROR_CODES: Record<string, LoginErrorKind> = {
  account_locked: 'locked',
  email_not_confirmed: 'unconfirmed',
  account_deactivated: 'deactivated',
  invalid_credentials: 'invalid',
}

/**
 * Distinguishes login's 401/403 sub-cases. Reads the structured `code` field
 * first (see ExceptionHandlingMiddleware / AuthErrorCodes on the backend);
 * falls back to matching the backend's Albanian `detail` text for older
 * responses that predate the code field. Falls back further to 'invalid' —
 * the safe, most common case — rather than risk misreporting an unrecognized
 * message as something more specific.
 */
export function classifyLoginError(error: unknown): LoginErrorKind {
  if (!(error instanceof ApiError)) return 'other'
  if (error.status !== 401 && error.status !== 403) return 'other'

  const data = error.data as { code?: unknown } | null | undefined
  if (typeof data?.code === 'string' && data.code in LOGIN_ERROR_CODES) {
    return LOGIN_ERROR_CODES[data.code]
  }

  if (error.status === 403) return 'other'
  if (/bllokuar/i.test(error.message)) return 'locked'
  if (/konfirmuar/i.test(error.message)) return 'unconfirmed'
  return 'invalid'
}

/**
 * True when a change-password 422 is specifically Identity's "current
 * password is wrong" failure. Identity's ChangePasswordAsync reports this as
 * an error *code* ("PasswordMismatch") used as the errors-dict key — not a
 * real field name — so it can't go through the generic getFieldErrors()
 * property-name matching used elsewhere.
 */
export function isWrongCurrentPasswordError(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 422) return false
  const data = error.data as { errors?: Record<string, unknown> } | null | undefined
  if (!data?.errors) return false
  return Object.keys(data.errors).some((key) => /passwordmismatch/i.test(key))
}

/**
 * The `code` a 409 carries (ConflictException.ErrorCode on the backend, e.g.
 * 'email-exists' / 'clinic-exists'). Needed wherever one endpoint can conflict
 * on more than one thing and the two need different copy — a bare status code
 * can't tell them apart.
 */
export function getConflictCode(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null
  const data = error.data as { code?: unknown } | null | undefined
  return typeof data?.code === 'string' ? data.code : null
}

export type ErrorMessageOverrides = Partial<{
  network: string
  400: string
  401: string
  403: string
  404: string
  409: string
  422: string
  429: string
  500: string
  default: string
}>

/**
 * Maps an error to user-facing localized copy, logging the original error to
 * the console with full diagnostic detail. Overrides let a call site supply
 * context-specific copy (e.g. a 409 during booking vs. a 409 during an edit
 * mean different things and need different messages) — already-translated
 * strings from the caller, same as before.
 */
export function getErrorMessage(error: unknown, overrides: ErrorMessageOverrides = {}): string {
  logError(error)

  if (!(error instanceof ApiError)) {
    return overrides.default ?? tCommon('errors.default')
  }
  if (error.status === 0) return overrides.network ?? tCommon('errors.network')
  if (error.status >= 500) return overrides[500] ?? tCommon('errors.500')

  switch (error.status) {
    case 400: return overrides[400] ?? tCommon('errors.400')
    case 401: return overrides[401] ?? tCommon('errors.401')
    case 403: return overrides[403] ?? tCommon('errors.403')
    case 404: return overrides[404] ?? tCommon('errors.404')
    case 409: return overrides[409] ?? tCommon('errors.409')
    case 422: return overrides[422] ?? tCommon('errors.422')
    case 429: return overrides[429] ?? tCommon('errors.429')
    default: return overrides.default ?? tCommon('errors.default')
  }
}

function logError(error: unknown): void {
  if (error instanceof ApiError) {
    // eslint-disable-next-line no-console
    console.error(`[API error] ${error.endpoint ?? '(unknown endpoint)'} → ${error.status}`, error.data ?? error.message)
  } else {
    // eslint-disable-next-line no-console
    console.error('[Unexpected error]', error)
  }
}

/**
 * Extracts field-level validation messages from a 400/422 ApiError's backend
 * `errors` object (ASP.NET ModelState / FluentValidation shape: PascalCase
 * keys → string[]; the backend uses 422 for FluentValidation failures, not
 * 400 — see ExceptionHandlingMiddleware). Returns null when the error isn't
 * a field-validation failure, so callers can fall back to a form-level
 * message and nothing is silently dropped.
 */
export function getFieldErrors(error: unknown): Record<string, string> | null {
  if (!(error instanceof ApiError) || (error.status !== 400 && error.status !== 422)) return null
  const data = error.data as Record<string, unknown> | null | undefined
  const errors = data?.errors
  if (!errors || typeof errors !== 'object') return null

  const out: Record<string, string> = {}
  for (const [key, messages] of Object.entries(errors as Record<string, unknown>)) {
    if (Array.isArray(messages) && typeof messages[0] === 'string') {
      out[toCamelCase(key)] = messages[0]
    }
  }
  return Object.keys(out).length > 0 ? out : null
}

function toCamelCase(key: string): string {
  return key.length > 0 ? key[0].toLowerCase() + key.slice(1) : key
}
