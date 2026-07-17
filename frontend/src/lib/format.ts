import { AppointmentStatus } from './types'

const MONTHS_SQ = [
  'janar', 'shkurt', 'mars', 'prill', 'maj', 'qershor',
  'korrik', 'gusht', 'shtator', 'tetor', 'nëntor', 'dhjetor',
]

const WEEKDAYS_SQ = ['E diel', 'E hënë', 'E martë', 'E mërkurë', 'E enjte', 'E premte', 'E shtunë']

/** Ora HH:mm nga një ISO string, pa e zhvendosur nga zona kohore. */
export function formatTime(iso: string): string {
  const m = iso.match(/T(\d{2}):(\d{2})/)
  return m ? `${m[1]}:${m[2]}` : iso
}

/** p.sh. "E hënë, 20 korrik 2026" */
export function formatDateLong(iso: string): string {
  const d = parseLocal(iso)
  return `${WEEKDAYS_SQ[d.getDay()]}, ${d.getDate()} ${MONTHS_SQ[d.getMonth()]} ${d.getFullYear()}`
}

/** p.sh. "20 korrik 2026, 09:00" */
export function formatDateTime(iso: string): string {
  const d = parseLocal(iso)
  return `${d.getDate()} ${MONTHS_SQ[d.getMonth()]} ${d.getFullYear()}, ${formatTime(iso)}`
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
  const symbol = currency === 'EUR' || !currency ? '€' : currency
  return `${symbol}${price.toFixed(0)}`
}

export function statusLabel(status: AppointmentStatus): { text: string; tone: string } {
  switch (status) {
    case AppointmentStatus.Pending:
      return { text: 'Në pritje', tone: 'warn' }
    case AppointmentStatus.Confirmed:
      return { text: 'Konfirmuar', tone: 'ok' }
    case AppointmentStatus.CheckedIn:
      return { text: 'Në pritje në klinikë', tone: 'ok' }
    case AppointmentStatus.InProgress:
      return { text: 'Në proces', tone: 'ok' }
    case AppointmentStatus.Completed:
      return { text: 'Përfunduar', tone: 'muted' }
    case AppointmentStatus.CancelledByPatient:
      return { text: 'Anuluar nga ju', tone: 'danger' }
    case AppointmentStatus.CancelledByClinic:
      return { text: 'Anuluar nga klinika', tone: 'danger' }
    case AppointmentStatus.NoShow:
      return { text: 'Nuk u paraqit', tone: 'danger' }
    case AppointmentStatus.Rescheduled:
      return { text: 'Riplanifikuar', tone: 'muted' }
    default:
      return { text: 'I panjohur', tone: 'muted' }
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
