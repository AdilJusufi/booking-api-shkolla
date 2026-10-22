import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clinicNow,
  clinicToday,
  clinicWallToEpoch,
  epochToClinicWall,
  isClinicPast,
  msUntilClinic,
  parseClinic,
  toClinicWall,
} from './clinicTime'

// Node honours a runtime change of process.env.TZ, so each block can pretend
// the browser lives somewhere else — the clinic answer must not move.
const ORIGINAL_TZ = process.env.TZ

function inBrowserZone(zone: string, body: () => void) {
  describe(`browser in ${zone}`, () => {
    beforeEach(() => {
      process.env.TZ = zone
    })
    afterEach(() => {
      process.env.TZ = ORIGINAL_TZ
    })
    body()
  })
}

for (const zone of ['Europe/Belgrade', 'America/New_York', 'UTC', 'Asia/Tokyo']) {
  inBrowserZone(zone, () => {
    it('winter (CET, +1): 09:00 clinic time is 08:00 UTC', () => {
      expect(new Date(clinicWallToEpoch('2026-01-15T09:00:00')).toISOString()).toBe('2026-01-15T08:00:00.000Z')
    })

    it('summer (CEST, +2): 09:00 clinic time is 07:00 UTC', () => {
      expect(new Date(clinicWallToEpoch('2026-07-15T09:00:00')).toISOString()).toBe('2026-07-15T07:00:00.000Z')
    })

    it('late-October DST change: 30 Oct 2026 (after 25 Oct switch) is +1', () => {
      expect(new Date(clinicWallToEpoch('2026-10-30T09:00:00')).toISOString()).toBe('2026-10-30T08:00:00.000Z')
      expect(new Date(clinicWallToEpoch('2026-10-30T17:00:00')).toISOString()).toBe('2026-10-30T16:00:00.000Z')
      // the day before the switch is still summer time
      expect(new Date(clinicWallToEpoch('2026-10-24T09:00:00')).toISOString()).toBe('2026-10-24T07:00:00.000Z')
    })

    it('a 09:00–17:00 absence is sent as clinic wall-clock, never as UTC', () => {
      expect(toClinicWall('2026-10-30', '09:00')).toBe('2026-10-30T09:00:00')
      expect(toClinicWall('2026-10-30', '17:00')).toBe('2026-10-30T17:00:00')
    })

    it('round-trips an instant through clinic wall-clock', () => {
      const instant = Date.UTC(2026, 9, 25, 0, 30) // 02:30 CEST on the switch night
      expect(epochToClinicWall(instant)).toBe('2026-10-25T02:30:00')
      expect(epochToClinicWall(Date.UTC(2026, 9, 25, 1, 30))).toBe('2026-10-25T02:30:00') // repeated hour, now CET
    })

    it('"today" is the clinic date, not the browser date', () => {
      // 23:30 UTC on 14 Jan = 00:30 on 15 Jan in Prishtina; New York is still on the 14th.
      const now = Date.UTC(2026, 0, 14, 23, 30)
      expect(clinicToday(now)).toBe('2026-01-15')
      const naive = clinicNow(now)
      expect([naive.getFullYear(), naive.getMonth(), naive.getDate(), naive.getHours(), naive.getMinutes()]).toEqual([2026, 0, 15, 0, 30])
    })

    it('displays a clinic time as the same wall-clock in any browser', () => {
      const d = parseClinic('2026-10-30T10:00:00')
      expect([d.getHours(), d.getMinutes(), d.getDate()]).toEqual([10, 0, 30])
    })

    it('hours-until and has-started use the real instant', () => {
      const now = Date.UTC(2026, 9, 30, 8, 0) // 09:00 in Prishtina
      expect(msUntilClinic('2026-10-30T10:00:00', now)).toBe(60 * 60 * 1000)
      expect(isClinicPast('2026-10-30T08:59:00', now)).toBe(true)
      expect(isClinicPast('2026-10-30T09:01:00', now)).toBe(false)
    })
  })
}
