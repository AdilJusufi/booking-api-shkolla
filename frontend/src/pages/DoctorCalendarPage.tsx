import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Calendar,
  CalendarX,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  LayoutGrid,
  List,
  MoreVertical,
  TrendingUp,
  UserX,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import { AppointmentStatus } from '../lib/types'
import type { DoctorAppointment } from '../lib/types'
import { useToast } from '../context/ToastContext'
import { useDoctorSearch } from '../context/DoctorSearchContext'
import { Dropdown, EmptyState } from '../components/ui'
import { formatTime, monthName, weekdayName } from '../lib/format'

function parseLocal(iso: string): Date {
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/)
  if (!m) return new Date(iso)
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), m[4] ? Number(m[4]) : 0, m[5] ? Number(m[5]) : 0)
}

function toDateInput(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDateSq(date: Date): string {
  return `${weekdayName(date.getDay())}, ${date.getDate()} ${monthName(date.getMonth())} ${date.getFullYear()}`
}

function formatDateHeader(iso: string): string {
  const d = parseLocal(iso)
  return `${weekdayName(d.getDay()).toUpperCase()}, ${d.getDate()} ${monthName(d.getMonth()).toUpperCase()}`
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
}

function isToday(iso: string): boolean {
  return isSameDay(parseLocal(iso), new Date())
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.charAt(0) ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : ''
  return `${first}${last}`.toUpperCase()
}

function calculateDateRange(filter: string): { dateFrom: string; dateTo: string } {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  switch (filter) {
    case 'today':
      return { dateFrom: toDateInput(today), dateTo: toDateInput(today) }
    case 'month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1)
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      return { dateFrom: toDateInput(start), dateTo: toDateInput(end) }
    }
    case '3months': {
      const end = new Date(today)
      end.setDate(end.getDate() + 90)
      return { dateFrom: toDateInput(today), dateTo: toDateInput(end) }
    }
    case 'week':
    default: {
      const day = today.getDay()
      const diff = day === 0 ? 6 : day - 1
      const start = new Date(today)
      start.setDate(start.getDate() - diff)
      const end = new Date(start)
      end.setDate(end.getDate() + 6)
      return { dateFrom: toDateInput(start), dateTo: toDateInput(end) }
    }
  }
}

function statusBadgeClass(status: AppointmentStatus, t: (key: string) => string): { className: string; text: string } {
  switch (status) {
    case AppointmentStatus.Pending:
      return { className: 'doctor-badge doctor-badge--warn', text: t('calendar.badges.pending') }
    case AppointmentStatus.Confirmed:
      return { className: 'doctor-badge doctor-badge--primary', text: t('calendar.badges.confirmed') }
    case AppointmentStatus.Completed:
      return { className: 'doctor-badge doctor-badge--ok', text: t('calendar.badges.completed') }
    case AppointmentStatus.CancelledByPatient:
    case AppointmentStatus.CancelledByClinic:
      return { className: 'doctor-badge doctor-badge--danger', text: t('calendar.badges.cancelled') }
    case AppointmentStatus.NoShow:
      return { className: 'doctor-badge doctor-badge--muted', text: t('calendar.badges.noShow') }
    default:
      return { className: 'doctor-badge doctor-badge--muted', text: t('calendar.badges.unknown') }
  }
}

function SkeletonStats() {
  return (
    <div className="stats-row">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="card skeleton-shimmer" style={{ height: 84, flex: 1, minWidth: 160 }} />
      ))}
    </div>
  )
}

function SkeletonRows() {
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="skeleton-appt-row">
          <div className="skeleton-shimmer" style={{ width: 52, height: 44 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="skeleton-shimmer" style={{ height: 16, width: '40%' }} />
            <div className="skeleton-shimmer" style={{ height: 12, width: '60%' }} />
          </div>
        </div>
      ))}
    </>
  )
}

export default function DoctorCalendarPage() {
  const { t } = useTranslation('doctor')
  const { t: tCommon } = useTranslation('common')
  const DATE_OPTIONS = [
    { value: 'today', label: t('calendar.dateRange.today') },
    { value: 'week', label: t('calendar.dateRange.week') },
    { value: 'month', label: t('calendar.dateRange.month') },
    { value: '3months', label: t('calendar.dateRange.3months') },
  ]
  const STATUS_TABS: { value: string; label: string }[] = [
    { value: 'all', label: t('calendar.statusTabAll') },
    { value: String(AppointmentStatus.Pending), label: t('calendar.statusTabPending') },
    { value: String(AppointmentStatus.Confirmed), label: t('calendar.statusTabConfirmed') },
    { value: String(AppointmentStatus.Completed), label: t('calendar.statusTabCompleted') },
  ]
  const navigate = useNavigate()
  const { notify } = useToast()

  const { searchTerm } = useDoctorSearch()
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [view, setView] = useState<'lista' | 'ditore'>('lista')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('week')
  const [appointments, setAppointments] = useState<DoctorAppointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [actingId, setActingId] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 300)
    return () => clearTimeout(t)
  }, [searchTerm])

  const load = useCallback(() => {
    let active = true
    setLoading(true)
    setError('')
    const { dateFrom, dateTo } = calculateDateRange(dateFilter)
    api
      .getDoctorAppointments({
        page: 1,
        pageSize: 50,
        dateFrom,
        dateTo,
        status: statusFilter === 'all' ? undefined : (Number(statusFilter) as AppointmentStatus),
      })
      .then((r) => active && setAppointments(r.items))
      .catch((e) => active && setError(getErrorMessage(e)))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [statusFilter, dateFilter])

  useEffect(load, [load])

  const filtered = useMemo(() => {
    if (!debouncedSearch.trim()) return appointments
    const q = debouncedSearch.trim().toLowerCase()
    return appointments.filter((a) => a.patientName.toLowerCase().includes(q))
  }, [appointments, debouncedSearch])

  const stats = useMemo(() => {
    const today = new Date()
    const todayAppts = appointments.filter((a) => isToday(a.startDateTime))
    const todayCompleted = todayAppts.filter((a) => a.status === AppointmentStatus.Completed).length
    const pending = appointments.filter((a) => a.status === AppointmentStatus.Pending).length
    const confirmedToday = todayAppts.filter((a) => a.status === AppointmentStatus.Confirmed).length
    const thisMonth = appointments.filter((a) => {
      const d = parseLocal(a.startDateTime)
      return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear()
    }).length
    return { today: todayAppts.length, todayCompleted, pending, confirmedToday, thisMonth }
  }, [appointments])

  async function handleConfirm(id: string) {
    setActingId(id)
    setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, status: AppointmentStatus.Confirmed } : a)))
    try {
      await api.confirmDoctorAppointment(id)
      notify(t('calendar.confirmedToast'), 'ok')
    } catch (e) {
      notify(getErrorMessage(e), 'error')
    } finally {
      setActingId('')
    }
  }

  async function handleComplete(id: string) {
    setActingId(id)
    setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, status: AppointmentStatus.Completed } : a)))
    try {
      await api.completeDoctorAppointment(id)
      notify(t('calendar.completedToast'), 'ok')
    } catch (e) {
      notify(getErrorMessage(e), 'error')
    } finally {
      setActingId('')
    }
  }

  async function handleNoShow(id: string) {
    setActingId(id)
    setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, status: AppointmentStatus.NoShow } : a)))
    try {
      await api.markDoctorAppointmentNoShow(id)
      notify(t('calendar.noShowToast'), 'ok')
    } catch (e) {
      notify(getErrorMessage(e), 'error')
    } finally {
      setActingId('')
    }
  }

  const groupedByDate = useMemo(() => {
    const groups = new Map<string, DoctorAppointment[]>()
    const sorted = [...filtered].sort((a, b) => parseLocal(a.startDateTime).getTime() - parseLocal(b.startDateTime).getTime())
    for (const a of sorted) {
      const key = toDateInput(parseLocal(a.startDateTime))
      const arr = groups.get(key) ?? []
      arr.push(a)
      groups.set(key, arr)
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  const dayAppointments = useMemo(
    () => filtered.filter((a) => isSameDay(parseLocal(a.startDateTime), currentDate)),
    [filtered, currentDate],
  )

  return (
    <>
      <div className="doctor-cal-header">
        <div>
          <h1>{t('calendar.title')}</h1>
          <p className="doctor-cal-header__sub">{formatDateSq(new Date())}</p>
        </div>
        <div className="doctor-view-toggle">
          <button type="button" className={`doctor-view-toggle__btn ${view === 'lista' ? 'is-active' : ''}`} onClick={() => setView('lista')}>
            <List size={14} strokeWidth={1.5} /> {t('calendar.viewList')}
          </button>
          <button type="button" className={`doctor-view-toggle__btn ${view === 'ditore' ? 'is-active' : ''}`} onClick={() => setView('ditore')}>
            <LayoutGrid size={14} strokeWidth={1.5} /> {t('calendar.viewDay')}
          </button>
        </div>
      </div>

      {loading ? (
        <SkeletonStats />
      ) : (
        <div className="stats-row">
          <div className="card doctor-stat">
            <div>
              <div className="doctor-stat__label">{t('calendar.statTodayLabel')}</div>
              <div className="doctor-stat__count" style={{ color: 'var(--primary)' }}>{stats.today}</div>
              <div className="doctor-stat__sub">{t('calendar.statTodayCompletedSub', { count: stats.todayCompleted })}</div>
            </div>
            <div className="doctor-stat__icon" style={{ background: 'var(--primary-050)' }}>
              <Calendar size={20} strokeWidth={1.5} color="var(--primary)" />
            </div>
          </div>
          <div className="card doctor-stat">
            <div>
              <div className="doctor-stat__label">{t('calendar.statPendingLabel')}</div>
              <div className="doctor-stat__count" style={{ color: 'var(--warn)' }}>{stats.pending}</div>
              <div className="doctor-stat__sub">{t('calendar.statPendingSub')}</div>
            </div>
            <div className="doctor-stat__icon" style={{ background: 'var(--warn-bg)' }}>
              <Clock size={20} strokeWidth={1.5} color="var(--warn)" />
            </div>
          </div>
          <div className="card doctor-stat">
            <div>
              <div className="doctor-stat__label">{t('calendar.statConfirmedTodayLabel')}</div>
              <div className="doctor-stat__count" style={{ color: 'var(--ok)' }}>{stats.confirmedToday}</div>
              <div className="doctor-stat__sub">{t('calendar.statConfirmedTodaySub')}</div>
            </div>
            <div className="doctor-stat__icon" style={{ background: 'var(--ok-bg)' }}>
              <CheckCircle size={20} strokeWidth={1.5} color="var(--ok)" />
            </div>
          </div>
          <div className="card doctor-stat">
            <div>
              <div className="doctor-stat__label">{t('calendar.statMonthLabel')}</div>
              <div className="doctor-stat__count" style={{ color: 'var(--primary)' }}>{stats.thisMonth}</div>
              <div className="doctor-stat__sub">{t('calendar.statMonthSub')}</div>
            </div>
            <div className="doctor-stat__icon" style={{ background: 'var(--primary-050)' }}>
              <TrendingUp size={20} strokeWidth={1.5} color="var(--primary)" />
            </div>
          </div>
        </div>
      )}

      <div className="doctor-filter-row">
        <div className="status-tabs">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value}
              className={`status-tab ${statusFilter === t.value ? 'is-active' : ''}`}
              onClick={() => setStatusFilter(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Dropdown options={DATE_OPTIONS} value={dateFilter} onChange={setDateFilter} icon={Calendar} />
      </div>

      {error ? (
        <EmptyState
          icon={CalendarX}
          title={t('calendar.errorTitle')}
          hint={error}
          action={
            <button type="button" className="btn btn--primary btn--sm" onClick={load}>
              {tCommon('buttons.retry')}
            </button>
          }
        />
      ) : loading ? (
        <SkeletonRows />
      ) : view === 'lista' ? (
        groupedByDate.length === 0 ? (
          <EmptyState icon={CalendarX} title={t('calendar.noAppointmentsTitle')} hint={t('calendar.noAppointmentsHint')} />
        ) : (
          groupedByDate.map(([dateKey, items]) => (
            <div key={dateKey}>
              <div className="doctor-date-divider">
                <span className="doctor-date-divider__line" />
                <span className="doctor-date-divider__text">
                  {isToday(items[0].startDateTime) && <span className="doctor-date-divider__dot" />}
                  {isToday(items[0].startDateTime) ? `${t('calendar.todayPrefix')} · ${formatDateHeader(items[0].startDateTime)}` : formatDateHeader(items[0].startDateTime)}
                </span>
                <span className="doctor-date-divider__line" />
              </div>

              {items.map((a) => {
                const badge = statusBadgeClass(a.status, t)
                const durationMinutes = Math.round((parseLocal(a.endDateTime).getTime() - parseLocal(a.startDateTime).getTime()) / 60000)
                const startInFuture = parseLocal(a.startDateTime).getTime() > Date.now()
                return (
                  <div className="doctor-appt-row" key={a.id}>
                    <div className="doctor-appt-row__time">
                      <span className="doctor-appt-row__start">{formatTime(a.startDateTime)}</span>
                      <span className="doctor-appt-row__duration">{durationMinutes} {t('calendar.minutesShort')}</span>
                    </div>

                    <span className="doctor-appt-row__sep" />

                    <div className="doctor-appt-row__main">
                      <div className="doctor-appt-row__patient">
                        <span className="doctor-appt-row__avatar">{initialsFromName(a.patientName)}</span>
                        <span className="doctor-appt-row__name">{a.patientName}</span>
                      </div>
                      <div className="doctor-appt-row__meta">
                        <span>{a.serviceName}</span>
                        <span>·</span>
                        <span className={badge.className}>{badge.text}</span>
                      </div>
                    </div>

                    <div className="doctor-appt-row__actions">
                      {a.status === AppointmentStatus.Pending && (
                        <>
                          <button
                            type="button"
                            className="btn btn--primary btn--sm"
                            disabled={actingId === a.id}
                            onClick={() => handleConfirm(a.id)}
                          >
                            {t('calendar.confirmCta')}
                          </button>
                          <span title={t('calendar.markCancelledTitle')} style={{ cursor: 'pointer', display: 'inline-flex' }}>
                            <X size={18} strokeWidth={1.5} color="var(--muted)" />
                          </span>
                        </>
                      )}
                      {a.status === AppointmentStatus.Confirmed && !startInFuture && (
                        <>
                          <button
                            type="button"
                            className="doctor-btn-complete"
                            disabled={actingId === a.id}
                            onClick={() => handleComplete(a.id)}
                          >
                            {t('calendar.completeCta')}
                          </button>
                          <span
                            title={t('calendar.markNoShowTitle')}
                            style={{ cursor: 'pointer', color: 'var(--muted)', display: 'inline-flex' }}
                            onClick={() => handleNoShow(a.id)}
                          >
                            <UserX size={16} strokeWidth={1.5} />
                          </span>
                        </>
                      )}
                      <MoreVertical
                        size={18}
                        strokeWidth={1.5}
                        color="var(--muted)"
                        style={{ cursor: 'pointer' }}
                        onClick={() => navigate(`/mjeku-panel/terminet/${a.id}`)}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ))
        )
      ) : (
        <DitoreView
          currentDate={currentDate}
          setCurrentDate={setCurrentDate}
          appointments={dayAppointments}
          onOpen={(id) => navigate(`/mjeku-panel/terminet/${id}`)}
        />
      )}
    </>
  )
}

const START_HOUR = 8
const END_HOUR = 20
const HOUR_HEIGHT = 60

function DitoreView({
  currentDate,
  setCurrentDate,
  appointments,
  onOpen,
}: {
  currentDate: Date
  setCurrentDate: (d: Date) => void
  appointments: DoctorAppointment[]
  onOpen: (id: string) => void
}) {
  const { t } = useTranslation('doctor')
  const [, forceTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => forceTick((n) => n + 1), 60000)
    return () => clearInterval(timer)
  }, [])

  const today = isSameDay(currentDate, new Date())
  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i)
  const timelineHeight = (END_HOUR - START_HOUR) * HOUR_HEIGHT

  function shiftDay(dir: number) {
    const next = new Date(currentDate)
    next.setDate(next.getDate() + dir)
    setCurrentDate(next)
  }

  function topFor(iso: string): number {
    const d = parseLocal(iso)
    return (d.getHours() - START_HOUR + d.getMinutes() / 60) * HOUR_HEIGHT
  }

  const now = new Date()
  const nowTop = (now.getHours() - START_HOUR + now.getMinutes() / 60) * HOUR_HEIGHT

  return (
    <>
      <div className="doctor-ditore-nav">
        <button type="button" onClick={() => shiftDay(-1)}>
          <ChevronLeft size={20} strokeWidth={1.5} />
        </button>
        <div className="doctor-ditore-nav__center">
          <span>
            {today
              ? t('calendar.dayView.todayLabel', { weekday: weekdayName(currentDate.getDay()), day: currentDate.getDate(), month: monthName(currentDate.getMonth()) })
              : t('calendar.dayView.dateLabel', { weekday: weekdayName(currentDate.getDay()), day: currentDate.getDate(), month: monthName(currentDate.getMonth()) })}
          </span>
          {!today && (
            <button type="button" className="doctor-ditore-nav__today" onClick={() => setCurrentDate(new Date())}>
              {t('calendar.dayView.todayButton')}
            </button>
          )}
        </div>
        <button type="button" onClick={() => shiftDay(1)}>
          <ChevronRight size={20} strokeWidth={1.5} />
        </button>
      </div>

      {appointments.length === 0 ? (
        <div className="doctor-ditore-empty">
          <CalendarX size={48} strokeWidth={1.5} color="var(--line)" />
          <p>{t('calendar.dayView.noAppointmentsForDay')}</p>
        </div>
      ) : (
        <div className="doctor-timeline" style={{ height: timelineHeight }}>
          {hours.map((h) => (
            <div key={h} className="doctor-timeline__hourline" style={{ top: (h - START_HOUR) * HOUR_HEIGHT }}>
              <span className="doctor-timeline__hourlabel">{String(h).padStart(2, '0')}:00</span>
            </div>
          ))}

          {appointments.map((a) => {
            const top = topFor(a.startDateTime)
            const durationMinutes = Math.max(
              30,
              Math.round((parseLocal(a.endDateTime).getTime() - parseLocal(a.startDateTime).getTime()) / 60000),
            )
            const height = Math.max(52, (durationMinutes / 60) * HOUR_HEIGHT)
            const statusClass =
              a.status === AppointmentStatus.Pending
                ? 'is-pending'
                : a.status === AppointmentStatus.Confirmed
                  ? 'is-confirmed'
                  : a.status === AppointmentStatus.Completed
                    ? 'is-completed'
                    : 'is-cancelled'
            return (
              <div
                key={a.id}
                className={`doctor-timeline__block ${statusClass}`}
                style={{ top, height }}
                onClick={() => onOpen(a.id)}
              >
                <div className="doctor-timeline__block-name">{a.patientName}</div>
                <div className="doctor-timeline__block-service">{a.serviceName}</div>
              </div>
            )
          })}

          {today && nowTop >= 0 && nowTop <= timelineHeight && (
            <div className="doctor-timeline__now" style={{ top: nowTop }}>
              <span className="doctor-timeline__now-dot" />
              <span className="doctor-timeline__now-line" />
            </div>
          )}
        </div>
      )}
    </>
  )
}
