import { useEffect, useRef, useState, type TouchEvent } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import type { DayAvailability } from '../lib/types'
import { monthName, toDateInput, weekdayName } from '../lib/format'
import { clinicNow, parseClinic } from '../lib/clinicTime'

// Display order Monday-first while JS Date.getDay() stays Sunday(0)..Saturday(6).
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

/** How far ahead the calendar lets a patient (or the clinic, on their behalf) book. */
export const MAX_DAYS_AHEAD = 60

const parseLocal = parseClinic

type DayState = 'past' | 'tooFar' | DayAvailability

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

/**
 * Month grid for the booking flow. Days the doctor doesn't work, fully booked
 * days, past days and days beyond the booking window are rendered disabled
 * (greyed, struck through for closed) but stay tappable so a short message can
 * explain why; they are aria-disabled rather than `disabled` for that reason.
 * Swipe left/right on the grid to change month; the arrow buttons stay.
 */
export default function MonthCalendar({
  doctorId,
  branchId,
  serviceId,
  selectedDate,
  onPick,
}: {
  doctorId: string
  branchId: string
  serviceId: string
  selectedDate: string
  onPick: (date: string) => void
}) {
  const { t } = useTranslation('patient')
  const today = clinicNow()
  today.setHours(0, 0, 0, 0)
  const maxDate = new Date(today)
  maxDate.setDate(maxDate.getDate() + MAX_DAYS_AHEAD)
  const firstMonth = startOfMonth(today)
  const lastMonth = startOfMonth(maxDate)

  const [month, setMonth] = useState(() => (selectedDate ? startOfMonth(parseLocal(selectedDate)) : firstMonth))
  const [slideDir, setSlideDir] = useState<'next' | 'prev' | ''>('')
  const [dayStates, setDayStates] = useState<Record<string, DayAvailability>>({})
  const [loadingDays, setLoadingDays] = useState(false)
  const [notice, setNotice] = useState('')
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  const canPrev = month.getTime() > firstMonth.getTime()
  const canNext = month.getTime() < lastMonth.getTime()

  useEffect(() => {
    const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0)
    const from = month < today ? today : month
    const to = monthEnd > maxDate ? maxDate : monthEnd
    if (from > to) return
    let active = true
    setLoadingDays(true)
    api
      .getAvailableDays(doctorId, branchId, serviceId, toDateInput(from), toDateInput(to))
      .then((days) => {
        if (!active) return
        setDayStates((prev) => {
          const next = { ...prev }
          for (const d of days) next[d.date.slice(0, 10)] = d.status
          return next
        })
      })
      // On failure every future day stays tappable — the slot step still
      // tells the truth, so a lost calendar hint never blocks booking.
      .catch(() => {})
      .finally(() => active && setLoadingDays(false))
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- today/maxDate derive from the clock; month + ids are the real inputs
  }, [month, doctorId, branchId, serviceId])

  useEffect(() => () => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
  }, [])

  function shift(dir: 1 | -1) {
    if (dir < 0 && !canPrev) return
    if (dir > 0 && !canNext) return
    setSlideDir(dir > 0 ? 'next' : 'prev')
    setMonth(new Date(month.getFullYear(), month.getMonth() + dir, 1))
  }

  function showNotice(text: string) {
    setNotice(text)
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(''), 2000)
  }

  function stateOf(d: Date): DayState {
    if (d < today) return 'past'
    if (d > maxDate) return 'tooFar'
    return dayStates[toDateInput(d)] ?? 'Available'
  }

  const NOTICE: Record<Exclude<DayState, 'Available'>, string> = {
    past: t('doctorDetail.dayPast'),
    tooFar: t('doctorDetail.dayTooFar'),
    Closed: t('doctorDetail.dayClosed'),
    Full: t('doctorDetail.dayFull'),
  }

  // Monday-first grid: leading blanks for the days before the 1st.
  const leading = (month.getDay() + 6) % 7
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells: (Date | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)),
  ]

  function onTouchStart(e: TouchEvent) {
    const p = e.touches[0]
    touchStart.current = { x: p.clientX, y: p.clientY }
  }
  function onTouchEnd(e: TouchEvent) {
    const start = touchStart.current
    touchStart.current = null
    if (!start) return
    const p = e.changedTouches[0]
    const dx = p.clientX - start.x
    const dy = p.clientY - start.y
    // Horizontal, deliberate swipes only — a vertical page scroll that drifts
    // sideways must not flip the month.
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return
    shift(dx < 0 ? 1 : -1)
  }

  return (
    <div className="booking-cal">
      <div className="booking-week__header">
        <button type="button" onClick={() => shift(-1)} disabled={!canPrev} aria-label={t('doctorDetail.prevMonth')}>
          <ChevronLeft size={20} strokeWidth={1.5} />
        </button>
        <span aria-live="polite">{monthName(month.getMonth())} {month.getFullYear()}</span>
        <button type="button" onClick={() => shift(1)} disabled={!canNext} aria-label={t('doctorDetail.nextMonth')}>
          <ChevronRight size={20} strokeWidth={1.5} />
        </button>
      </div>

      <div className="booking-week__days">
        {WEEK_ORDER.map((day) => (
          <span key={day} className="booking-week__dayhead">{weekdayName(day, 'short').toUpperCase()}</span>
        ))}
      </div>

      <div
        key={toDateInput(month)}
        className={`booking-week__grid booking-cal__grid ${slideDir ? `is-slide-${slideDir}` : ''} ${loadingDays ? 'is-loading' : ''}`}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {cells.map((d, i) => {
          if (!d) return <span key={`blank-${i}`} aria-hidden />
          const dateStr = toDateInput(d)
          const state = stateOf(d)
          const disabled = state !== 'Available'
          const isToday = dateStr === toDateInput(today)
          const isSelected = dateStr === selectedDate
          const cls = [
            'booking-daybtn',
            isSelected ? 'is-selected' : isToday ? 'is-today' : '',
            disabled ? `is-off is-${state.toLowerCase()}` : '',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <button
              key={dateStr}
              type="button"
              className={cls}
              aria-disabled={disabled || undefined}
              aria-label={disabled ? `${d.getDate()} — ${NOTICE[state as Exclude<DayState, 'Available'>]}` : undefined}
              onClick={() => (disabled ? showNotice(NOTICE[state as Exclude<DayState, 'Available'>]) : onPick(dateStr))}
            >
              {d.getDate()}
            </button>
          )
        })}
      </div>

      <div className="booking-cal__legend" aria-hidden>
        <span><i className="booking-cal__swatch booking-cal__swatch--open" /> {t('doctorDetail.legendAvailable')}</span>
        <span><i className="booking-cal__swatch booking-cal__swatch--full" /> {t('doctorDetail.legendFull')}</span>
        <span><i className="booking-cal__swatch booking-cal__swatch--closed" /> {t('doctorDetail.legendClosed')}</span>
      </div>

      <div className="booking-cal__notice-slot" role="status" aria-live="polite">
        {notice && <p className="booking-cal__notice">{notice}</p>}
      </div>
    </div>
  )
}
