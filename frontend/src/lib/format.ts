import i18n, { type SupportedLanguage } from '../i18n'
import { AppointmentStatus } from './types'

/**
 * Display order Monday-first while the backend's DayOfWeek (and JS
 * Date.getDay()) stays Sunday(0)..Saturday(6). Single shared source — do not
 * redeclare this per-file; every page that groups or lists by weekday
 * (WorkingSchedulePage, ClinicDoctorsPage's admin schedule modal, the
 * weekday multi-select) imports this one.
 */
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

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

/**
 * Localized weekday name for a JS Date.getDay() index (0 = Sunday .. 6 =
 * Saturday). Looked up from a static translation table (common.json
 * "dates.weekdaysLong"/"weekdaysShort") rather than Intl.DateTimeFormat:
 * Intl's weekday/month names depend on the runtime's ICU locale data, and
 * that data is not guaranteed complete for every BCP-47 tag — some Chrome/V8
 * builds silently fall back to English for "sq" specifically (confirmed:
 * Intl.DateTimeFormat.supportedLocalesOf(['sq']) returns [] while 'sr-Latn',
 * 'de', 'ja', etc. resolve fine), with no error to catch. A static table
 * removes the runtime dependency entirely — the same reason statusLabel()
 * below reads from i18next rather than formatting enum names on the fly.
 * Callers that want ALL CAPS (table headers, etc.) uppercase it themselves.
 */
export function weekdayName(dayOfWeek: number, style: 'long' | 'short' = 'long'): string {
  const key = style === 'short' ? 'dates.weekdaysShort' : 'dates.weekdaysLong'
  const names = i18n.t(key, { ns: 'common', returnObjects: true }) as unknown as string[]
  return names[dayOfWeek] ?? ''
}

/** Localized month name for a 0-based month index — see weekdayName for why this reads a static table instead of Intl. */
export function monthName(monthIndex: number, style: 'long' | 'short' = 'long'): string {
  const key = style === 'short' ? 'dates.monthsShort' : 'dates.monthsLong'
  const names = i18n.t(key, { ns: 'common', returnObjects: true }) as unknown as string[]
  return names[monthIndex] ?? ''
}

/** Ora HH:mm nga një ISO string, pa e zhvendosur nga zona kohore. */
export function formatTime(iso: string): string {
  const m = iso.match(/T(\d{2}):(\d{2})/)
  return m ? `${m[1]}:${m[2]}` : iso
}

/**
 * e.g. "E Premte, 4 Shtator 2026". Built from the static weekdayName/monthName
 * tables rather than Intl.DateTimeFormat — see the comment on weekdayName for
 * why: Intl silently drops to English on ICU-limited runtimes for "sq", and a
 * full date string inherits that defect just as much as a bare weekday name.
 */
export function formatDateLong(iso: string): string {
  const d = parseLocal(iso)
  return `${weekdayName(d.getDay())}, ${d.getDate()} ${monthName(d.getMonth())} ${d.getFullYear()}`
}

/** e.g. "4 Shtator 2026, 09:00" — see formatDateLong for why this avoids Intl.DateTimeFormat. */
export function formatDateTime(iso: string): string {
  const d = parseLocal(iso)
  const date = `${d.getDate()} ${monthName(d.getMonth())} ${d.getFullYear()}`
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
