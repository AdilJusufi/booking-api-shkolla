/**
 * The ONE place the frontend reasons about time zones.
 *
 * THE RULE (mirrors TimeZoneService on the backend):
 *   - Instants (appointments, absences, anything with a date and a time) are
 *     stored in UTC by the backend.
 *   - Every time a person types or sees is CLINIC time, Europe/Belgrade —
 *     regardless of the browser's own zone. A patient abroad booking 10:00 in
 *     Prishtina sees and sends 10:00.
 *   - On the wire both directions use clinic wall-clock strings WITHOUT an
 *     offset: "2026-10-30T09:00:00". Never send `toISOString()` (UTC, "Z") for
 *     a time a person picked — that was WR-03, an absence typed as 09:00–17:00
 *     saved as 08:00–16:00.
 *   - Recurring working hours stay plain "HH:mm" (day of week + time).
 *
 * Two representations are used:
 *   - wall strings ("yyyy-MM-ddTHH:mm[:ss]") — what the API speaks;
 *   - "naive" Dates whose LOCAL fields equal clinic wall-clock fields (what
 *     calendars render with getFullYear()/getDate()). Build them only through
 *     this module (clinicNow, clinicTodayDate, parseClinic). For "how long
 *     until" or "has it started" use clinicWallToEpoch, which is exact across
 *     DST in both zones.
 */

export const CLINIC_TIME_ZONE = 'Europe/Belgrade'

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CLINIC_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

interface WallParts {
  y: number
  m: number // 1-12
  d: number
  h: number
  mi: number
  s: number
}

/** Clinic wall-clock fields at a real instant. */
function wallPartsAt(epochMs: number): WallParts {
  const o: Record<string, string> = {}
  for (const p of partsFormatter.formatToParts(new Date(epochMs))) o[p.type] = p.value
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second }
}

/** Clinic UTC offset (ms) at a real instant: +1h in winter, +2h in summer. */
function offsetAt(epochMs: number): number {
  const p = wallPartsAt(epochMs)
  const wholeSeconds = epochMs - (((epochMs % 1000) + 1000) % 1000)
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - wholeSeconds
}

const WALL_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/

function parseWall(wall: string): WallParts | null {
  const m = wall.match(WALL_RE)
  if (!m) return null
  return {
    y: Number(m[1]),
    m: Number(m[2]),
    d: Number(m[3]),
    h: m[4] ? Number(m[4]) : 0,
    mi: m[5] ? Number(m[5]) : 0,
    s: m[6] ? Number(m[6]) : 0,
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** The real instant (epoch ms) of a clinic wall-clock string. */
export function clinicWallToEpoch(wall: string): number {
  const p = parseWall(wall)
  if (!p) return new Date(wall).getTime()
  const asIfUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s)
  const first = asIfUtc - offsetAt(asIfUtc)
  const second = asIfUtc - offsetAt(first)
  return second
}

/** Milliseconds from now until a clinic wall-clock time (negative if past). */
export function msUntilClinic(wall: string, nowMs: number = Date.now()): number {
  return clinicWallToEpoch(wall) - nowMs
}

/** "yyyy-MM-ddTHH:mm:ss" in clinic time for a real instant. */
export function epochToClinicWall(epochMs: number): string {
  const p = wallPartsAt(epochMs)
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}`
}

/** Current clinic wall-clock as a naive Date (local fields == Prishtina fields). */
export function clinicNow(nowMs: number = Date.now()): Date {
  const p = wallPartsAt(nowMs)
  return new Date(p.y, p.m - 1, p.d, p.h, p.mi, p.s)
}

/** Today's date in the clinic, "yyyy-MM-dd". */
export function clinicToday(nowMs: number = Date.now()): string {
  const p = wallPartsAt(nowMs)
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`
}

/** Today's clinic date as a naive local midnight — for calendar grids. */
export function clinicTodayDate(nowMs: number = Date.now()): Date {
  const p = wallPartsAt(nowMs)
  return new Date(p.y, p.m - 1, p.d)
}

/** Parse a clinic wall string into a naive Date (no zone shift). */
export function parseClinic(wall: string): Date {
  const p = parseWall(wall)
  if (!p) return new Date(wall)
  return new Date(p.y, p.m - 1, p.d, p.h, p.mi, p.s)
}

/**
 * Build the wire value for a date + time a person picked in clinic time:
 * "2026-10-30" + "09:00" → "2026-10-30T09:00:00". No offset, by design.
 */
export function toClinicWall(date: string, time: string): string {
  const t = time.length === 5 ? `${time}:00` : time
  return `${date}T${t}`
}

/** Has a clinic wall-clock moment already passed? */
export function isClinicPast(wall: string, nowMs: number = Date.now()): boolean {
  return clinicWallToEpoch(wall) <= nowMs
}
