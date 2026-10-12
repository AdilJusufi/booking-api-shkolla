import { Link } from 'react-router-dom'
import { CalendarX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ScheduleAffectedAppointment } from '../lib/types'
import { formatDateTime, formatTime } from '../lib/format'

/**
 * Shown inside the schedule edit form when the backend refuses an edit with
 * 409 `schedule-has-booked-appointments`: the booked appointments the new
 * hours would leave uncovered. The edit is blocked rather than applied, so
 * the list is what the user needs to act on (reschedule/cancel, then retry).
 */
export default function ScheduleAffectedList({
  appointments,
  linkTo,
}: {
  appointments: ScheduleAffectedAppointment[]
  /** Detail route per appointment, when the current portal has one. */
  linkTo?: (id: string) => string
}) {
  const { t } = useTranslation('common')
  if (appointments.length === 0) return null

  return (
    <div className="schedule-affected" role="alert">
      <p className="schedule-affected__title">
        <CalendarX size={16} strokeWidth={1.5} aria-hidden />
        {t('scheduleConflict.title', { count: appointments.length })}
      </p>
      <ul className="schedule-affected__list">
        {appointments.map((a) => {
          const label = (
            <>
              <strong>{formatDateTime(a.startDateTime)}–{formatTime(a.endDateTime)}</strong>
              <span>{a.patientName} · {a.serviceName}</span>
            </>
          )
          return (
            <li key={a.id}>
              {linkTo ? <Link to={linkTo(a.id)}>{label}</Link> : <div>{label}</div>}
            </li>
          )
        })}
      </ul>
      <p className="schedule-affected__hint">{t('scheduleConflict.hint')}</p>
    </div>
  )
}
