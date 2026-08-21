import i18n, { type SupportedLanguage } from '../i18n'
import { AppointmentStatus } from './types'

/**
 * Maps our language codes to the BCP-47 tags Intl needs. Serbian is pinned to
 * the Latin variant explicitly — the app only ships Latin sr copy (see
 * i18n.ts), and a bare "sr" tag risks resolving to Cyrillic month/weekday
 * names in some ICU builds, which would silently mismatch the rest of the UI.
 */
const INTL_LOCALES: Record<SupportedLanguage, string> = {
  sq: 'sq',
  en: 'en',
  sr: 'sr-Latn',
}

/**
 * Re-read on every call rather than cached: i18next's resolvedLanguage can
 * change mid-session (the language switcher), and every formatter here is
 * called fresh each render/sort/export — see the note in errors.ts for why a
 * cached value would go stale after a runtime language switch.
 */
function activeLocale(): string {
  return INTL_LOCALES[(i18n.resolvedLanguage as SupportedLanguage) ?? 'sq'] ?? 'sq'
}

function capitalizeFirst(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)
}

/** Capitalizes every word — Intl gives lowercase weekday/month names, but
 * dropdown options and standalone headings read better in title case. */
function capitalizeWords(s: string): string {
  return s.replace(/\S+/g, capitalizeFirst)
}

/**
 * Localized weekday name for a JS Date.getDay() index (0 = Sunday .. 6 =
 * Saturday), independent of any specific date — built off a fixed reference
 * week (2023-01-01 was a Sunday) so callers don't need a real Date on hand.
 * Returned title-cased ("E Hënë" / "Monday" / "Ponedeljak"); callers that want
 * ALL CAPS (table headers, etc.) uppercase it themselves.
 */
export function weekdayName(dayOfWeek: number, style: 'long' | 'short' = 'long'): string {
  const reference = new Date(Date.UTC(2023, 0, 1 + dayOfWeek))
  return capitalizeWords(
    new Intl.DateTimeFormat(activeLocale(), { weekday: style, timeZone: 'UTC' }).format(reference),
  )
}

/** Localized month name for a 0-based month index, title-cased — see weekdayName. */
export function monthName(monthIndex: number, style: 'long' | 'short' = 'long'): string {
  const reference = new Date(Date.UTC(2023, monthIndex, 1))
  return capitalizeWords(
    new Intl.DateTimeFormat(activeLocale(), { month: style, timeZone: 'UTC' }).format(reference),
  )
}

/** Ora HH:mm nga një ISO string, pa e zhvendosur nga zona kohore. */
export function formatTime(iso: string): string {
  const m = iso.match(/T(\d{2}):(\d{2})/)
  return m ? `${m[1]}:${m[2]}` : iso
}

/** e.g. "Monday, July 20, 2026" / "E hënë, 20 korrik 2026" */
export function formatDateLong(iso: string): string {
  const d = parseLocal(iso)
  return capitalizeFirst(
    new Intl.DateTimeFormat(activeLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d),
  )
}

/** e.g. "July 20, 2026, 09:00" / "20 korrik 2026, 09:00" */
export function formatDateTime(iso: string): string {
  const d = parseLocal(iso)
  const date = capitalizeFirst(
    new Intl.DateTimeFormat(activeLocale(), { day: 'numeric', month: 'long', year: 'numeric' }).format(d),
  )
  return `${date}, ${formatTime(iso)}`
}

/** yyyy-MM-dd nga një objekt Date (koha lokale). */
export function toDateInput(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseLocal(iso: string): Date {
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/)
  if (!m) return new Date(iso)
  return new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    m[4] ? Number(m[4]) : 0,
    m[5] ? Number(m[5]) : 0,
  )
}

export function formatMoney(price: number, currency: string): string {
  return new Intl.NumberFormat(activeLocale(), {
    style: 'currency',
    currency: currency || 'EUR',
    maximumFractionDigits: 0,
  }).format(price)
}

/** Locale-aware thousands separators for a plain count/stat number. */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat(activeLocale()).format(value)
}

/**
 * Reads i18next directly rather than via useTranslation(): this is a plain
 * module used from non-component code (list sorting, CSV-style exports,
 * etc.) as well as components, so it can't assume a hook context. Every call
 * re-reads the active language — see the note in errors.ts for why that
 * matters after a runtime language switch.
 */
export function statusLabel(status: AppointmentStatus): { text: string; tone: string } {
  const t = (key: string) => i18n.t(`appointment.status.${key}`, { ns: 'common' })
  switch (status) {
    case AppointmentStatus.Pending:
      return { text: t('pending'), tone: 'warn' }
    case AppointmentStatus.Confirmed:
      return { text: t('confirmed'), tone: 'ok' }
    case AppointmentStatus.CheckedIn:
      return { text: t('checkedIn'), tone: 'ok' }
    case AppointmentStatus.InProgress:
      return { text: t('inProgress'), tone: 'ok' }
    case AppointmentStatus.Completed:
      return { text: t('completed'), tone: 'muted' }
    case AppointmentStatus.CancelledByPatient:
      return { text: t('cancelledByPatient'), tone: 'danger' }
    case AppointmentStatus.CancelledByClinic:
      return { text: t('cancelledByClinic'), tone: 'danger' }
    case AppointmentStatus.NoShow:
      return { text: t('noShow'), tone: 'danger' }
    case AppointmentStatus.Rescheduled:
      return { text: t('rescheduled'), tone: 'muted' }
    default:
      return { text: t('unknown'), tone: 'muted' }
  }
}

export function isUpcoming(a: { status: AppointmentStatus; startDateTime: string }): boolean {
  const cancelled = [
    AppointmentStatus.CancelledByPatient,
    AppointmentStatus.CancelledByClinic,
    AppointmentStatus.Completed,
    AppointmentStatus.NoShow,
  ]
  if (cancelled.includes(a.status)) return false
  return parseLocal(a.startDateTime).getTime() > Date.now() - 60 * 60 * 1000
}
