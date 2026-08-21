import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CalendarX,
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Info,
  MapPin,
  Phone,
  XCircle,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api, ApiError } from '../lib/api'
import { getErrorMessage, getSlotTakenMessage } from '../lib/errors'
import { AppointmentStatus } from '../lib/types'
import type { Appointment, AvailableSlot, ClinicDetails, DoctorDetails } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { Badge, ErrorBox, Pending, initials, specialtyLabel } from '../components/ui'
import { monthName, toDateInput, weekdayName } from '../lib/format'

function parseLocal(iso: string): Date {
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/)
  if (!m) return new Date(iso)
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), m[4] ? Number(m[4]) : 0, m[5] ? Number(m[5]) : 0)
}

function formatDateSq(iso: string): string {
  const d = parseLocal(iso)
  return `${weekdayName(d.getDay())}, ${d.getDate()} ${monthName(d.getMonth())} ${d.getFullYear()}`
}

function formatTimeSq(iso: string): string {
  const d = parseLocal(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatDayMonthTime(iso: string): string {
  const d = parseLocal(iso)
  return `${d.getDate()} ${monthName(d.getMonth(), 'short')}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const ACTIVE_STATUSES = [AppointmentStatus.Pending, AppointmentStatus.Confirmed]

const TIMELINE_COLORS: Partial<Record<AppointmentStatus, string>> = {
  [AppointmentStatus.Pending]: 'var(--warn)',
  [AppointmentStatus.Confirmed]: 'var(--primary)',
  [AppointmentStatus.CheckedIn]: 'var(--ok)',
  [AppointmentStatus.InProgress]: 'var(--ok)',
  [AppointmentStatus.Completed]: 'var(--ok)',
  [AppointmentStatus.CancelledByPatient]: 'var(--danger)',
  [AppointmentStatus.CancelledByClinic]: 'var(--danger)',
  [AppointmentStatus.NoShow]: 'var(--danger)',
  [AppointmentStatus.Rescheduled]: 'var(--warn)',
}

const STATUS_KEYS: Partial<Record<AppointmentStatus, string>> = {
  [AppointmentStatus.Pending]: 'pending',
  [AppointmentStatus.Confirmed]: 'confirmed',
  [AppointmentStatus.CheckedIn]: 'checkedIn',
  [AppointmentStatus.InProgress]: 'inProgress',
  [AppointmentStatus.Completed]: 'completed',
  [AppointmentStatus.CancelledByPatient]: 'cancelledByPatient',
  [AppointmentStatus.CancelledByClinic]: 'cancelledByClinic',
  [AppointmentStatus.NoShow]: 'noShow',
  [AppointmentStatus.Rescheduled]: 'rescheduled',
}

/** One line per status for the sidebar status card. */
function statusDescription(status: AppointmentStatus, t: (key: string) => string): string {
  const key = STATUS_KEYS[status]
  return key ? t(`appointmentDetail.statusDescriptions.${key}`) : t('appointmentDetail.statusDescriptionFallback')
}

function timelineLabel(status: AppointmentStatus, t: (key: string) => string): string {
  const key = STATUS_KEYS[status]
  return t(`appointmentDetail.timelineLabels.${key ?? 'unknown'}`)
}

function statusBadge(status: AppointmentStatus, t: (key: string) => string) {
  switch (status) {
    case AppointmentStatus.Pending:
      return <Badge tone="warn">{t('appointmentsList.badges.pending')}</Badge>
    case AppointmentStatus.Confirmed:
      return <Badge tone="primary">{t('appointmentsList.badges.confirmed')}</Badge>
    case AppointmentStatus.CheckedIn:
      return <Badge tone="ok">{t('appointmentsList.badges.checkedIn')}</Badge>
    case AppointmentStatus.InProgress:
      return <Badge tone="primary">{t('appointmentsList.badges.inProgress')}</Badge>
    case AppointmentStatus.Completed:
      return <Badge tone="ok">{t('appointmentsList.badges.completed')}</Badge>
    case AppointmentStatus.CancelledByPatient:
    case AppointmentStatus.CancelledByClinic:
      return <Badge tone="danger">{t('appointmentsList.badges.cancelledByPatient')}</Badge>
    case AppointmentStatus.NoShow:
      return <Badge tone="muted">{t('appointmentsList.badges.noShow')}</Badge>
    case AppointmentStatus.Rescheduled:
      return <Badge tone="warn">{t('appointmentsList.badges.rescheduled')}</Badge>
    default:
      return <Badge tone="muted">{t('appointmentsList.badges.unknown')}</Badge>
  }
}

function hoursUntil(iso: string): number {
  return (parseLocal(iso).getTime() - Date.now()) / (1000 * 60 * 60)
}

function DetailSkeleton() {
  return (
    <div className="detail-page">
      <div className="skeleton-shimmer" style={{ height: 16, width: 160, marginBottom: 20, borderRadius: 6 }} />
      <div className="apptdetail-layout">
        <div>
          <div className="card skeleton-shimmer" style={{ height: 200, marginBottom: 16 }} />
          <div className="card skeleton-shimmer" style={{ height: 100 }} />
        </div>
        <div className="card skeleton-shimmer" style={{ height: 160 }} />
      </div>
    </div>
  )
}

export default function AppointmentDetailPage() {
  const { t } = useTranslation('patient')
  const { t: tCommon } = useTranslation('common')
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { notify } = useToast()

  const [appointment, setAppointment] = useState<Appointment | null>(null)
  const [doctor, setDoctor] = useState<DoctorDetails | null>(null)
  const [clinic, setClinic] = useState<ClinicDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [loadError, setLoadError] = useState('')

  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  const [showReschedule, setShowReschedule] = useState(false)
  // First day of the visible 7-day strip; starts at today so bookable dates show first.
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  })
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedSlot, setSelectedSlot] = useState('')
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [rescheduling, setRescheduling] = useState(false)

  const load = useCallback(() => {
    if (!id) return
    let active = true
    setLoading(true)
    setNotFound(false)
    setLoadError('')
    api
      .getMyAppointment(id)
      .then((a) => {
        if (!active) return
        setAppointment(a)
        return Promise.all([
          api.getDoctor(a.doctorId).then((d) => {
            if (active) setDoctor(d)
          }),
          // Best-effort — the phone-number tel: link is a nicety, not core detail.
          api
            .getClinic(a.clinicId)
            .then((c) => {
              if (active) setClinic(c)
            })
            .catch(() => undefined),
        ])
      })
      .catch((e) => {
        if (!active) return
        if (e instanceof ApiError && e.status === 401) {
          navigate('/hyr', { state: { from: `/terminet/${id}` } })
          return
        }
        // A genuine 404 means the appointment doesn't exist / isn't the
        // caller's — that's a distinct state from "the request failed",
        // which needs a retry affordance instead of a permanent dead end.
        if (e instanceof ApiError && e.status === 404) {
          setNotFound(true)
        } else {
          setLoadError(getErrorMessage(e))
        }
      })
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [id, navigate])

  useEffect(load, [load])

  const service = useMemo(
    () => doctor?.services.find((s) => s.medicalServiceId === appointment?.medicalServiceId),
    [doctor, appointment],
  )
  const branch = useMemo(
    () => doctor?.branches.find((b) => b.branchId === appointment?.clinicBranchId),
    [doctor, appointment],
  )

  const canCancel = appointment ? ACTIVE_STATUSES.includes(appointment.status) && hoursUntil(appointment.startDateTime) > 12 : false
  const within12h = appointment ? ACTIVE_STATUSES.includes(appointment.status) && hoursUntil(appointment.startDateTime) <= 12 : false

  async function handleConfirmCancel() {
    if (!appointment) return
    setCancelling(true)
    try {
      await api.cancelAppointment(appointment.id, t('appointmentDetail.cancelReasonDefault'))
      setAppointment((prev) => (prev ? { ...prev, status: AppointmentStatus.CancelledByPatient } : prev))
      setShowCancelConfirm(false)
      notify(t('appointmentDetail.cancelledToast'), 'ok')
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        navigate('/hyr')
        return
      }
      notify(getErrorMessage(e), 'error')
    } finally {
      setCancelling(false)
    }
  }

  function openReschedule() {
    setShowReschedule(true)
    setSelectedDate('')
    setSelectedSlot('')
    setAvailableSlots([])
  }

  function selectDate(date: string) {
    setSelectedDate(date)
    setSelectedSlot('')
    if (!appointment || !doctor || !branch || !service) return
    setSlotsLoading(true)
    api
      .getAvailableSlots(doctor.id, branch.branchId, service.medicalServiceId, date)
      .then(setAvailableSlots)
      .catch(() => setAvailableSlots([]))
      .finally(() => setSlotsLoading(false))
  }

  async function handleConfirmReschedule() {
    if (!appointment || !selectedDate || !selectedSlot) return
    setRescheduling(true)
    try {
      const updated = await api.rescheduleAppointment(appointment.id, selectedSlot)
      setAppointment(updated)
      notify(t('appointmentDetail.rescheduledToast'), 'ok')
      navigate('/terminet')
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        // Expected outcome, not an error state: the slot was taken between
        // page load and submit. Toast + refetch, no ErrorBox.
        notify(getSlotTakenMessage(), 'error')
        setSelectedSlot('')
        selectDate(selectedDate)
      } else if (e instanceof ApiError && e.status === 401) {
        navigate('/hyr')
      } else {
        notify(getErrorMessage(e), 'error')
      }
    } finally {
      setRescheduling(false)
    }
  }

  if (loading) return <DetailSkeleton />

  if (loadError) {
    return (
      <div className="detail-page">
        <ErrorBox message={loadError} onRetry={load} />
      </div>
    )
  }

  if (notFound || !appointment) {
    return (
      <div className="apptdetail-notfound">
        <CalendarX size={64} strokeWidth={1.5} color="var(--line)" style={{ margin: '0 auto 16px' }} />
        <h2>{t('appointmentDetail.notFoundTitle')}</h2>
        <p>{t('appointmentDetail.notFoundHint')}</p>
        <Link to="/terminet" className="btn btn--ghost">
          <ChevronLeft size={16} strokeWidth={1.5} /> {t('appointmentDetail.backToAppointments')}
        </Link>
      </div>
    )
  }

  const doctorInitials = doctor ? initials(doctor.firstName, doctor.lastName) : '—'
  const durationMinutes = service?.durationMinutes ?? Math.round((parseLocal(appointment.endDateTime).getTime() - parseLocal(appointment.startDateTime).getTime()) / 60000)

  return (
    <div className="detail-page">
      <Link to="/terminet" className="link-icon apptdetail-back">
        <ChevronLeft size={16} strokeWidth={1.5} /> {t('appointmentDetail.backToAppointments')}
      </Link>

      <div className="apptdetail-layout">
        <div>
          <div className="card apptdetail-card">
            <div className="apptdetail-top">
              {statusBadge(appointment.status, t)}
              <span className="apptdetail-ref">{t('appointmentDetail.refLabel')}: #{appointment.id.slice(0, 7).toUpperCase()}</span>
            </div>

            <p className="apptdetail-section-label">{t('appointmentDetail.timeAndPlace')}</p>
            <div className="apptdetail-grid">
              <div className="apptdetail-item">
                <span className="apptdetail-label">{t('appointmentDetail.dateLabel')}</span>
                <span className="apptdetail-value apptdetail-value--lg">{formatDateSq(appointment.startDateTime)}</span>
              </div>
              <div className="apptdetail-item">
                <span className="apptdetail-label">{t('appointmentDetail.timeLabel')}</span>
                <span className="apptdetail-value apptdetail-value--md">
                  {formatTimeSq(appointment.startDateTime)} – {formatTimeSq(appointment.endDateTime)}
                  <span className="apptdetail-duration-pill">({durationMinutes} min)</span>
                </span>
              </div>
              <div className="apptdetail-item">
                <span className="apptdetail-label">{t('appointmentDetail.clinicLabel')}</span>
                <span className="apptdetail-value">{appointment.clinicName} — {appointment.branchName}</span>
              </div>
              <div className="apptdetail-item">
                <span className="apptdetail-label">{t('appointmentDetail.branchLabel')}</span>
                <span className="apptdetail-value apptdetail-value--row">
                  <MapPin size={13} strokeWidth={1.5} color="var(--muted)" />
                  {appointment.branchAddress}{branch?.city ? `, ${branch.city}` : ''}
                </span>
              </div>
            </div>

            <div className="apptdetail-divider" />

            <p className="apptdetail-section-label">{t('appointmentDetail.doctorAndService')}</p>
            <div className="apptdetail-doctor">
              <div className="apptdetail-avatar">{doctorInitials}</div>
              <div>
                <h2 className="apptdetail-doctor__name">Dr. {doctor?.firstName ?? appointment.doctorName} {doctor?.lastName ?? ''}</h2>
                <div className="apptdetail-doctor__meta">
                  {service && <span className="apptdetail-spec-chip">{specialtyLabel(service.specialtyName)}</span>}
                </div>
              </div>
            </div>
            <div className="apptdetail-grid" style={{ marginTop: 14 }}>
              <div className="apptdetail-item">
                <span className="apptdetail-label">{t('appointmentDetail.serviceLabel')}</span>
                <span className="apptdetail-value">{appointment.serviceName}</span>
              </div>
              <div className="apptdetail-item">
                <span className="apptdetail-label">{t('appointmentDetail.durationLabel')}</span>
                <span className="apptdetail-value">{t('appointmentDetail.durationMinutes', { count: durationMinutes })}</span>
              </div>
              <div className="apptdetail-item">
                <span className="apptdetail-label">{t('appointmentDetail.priceLabel')}</span>
                <span className="apptdetail-value">{service ? `${service.price.toFixed(2)} ${service.currency}` : '—'}</span>
              </div>
            </div>

            <div className="apptdetail-divider" />

            <p className="apptdetail-section-label">{t('appointmentDetail.patientSectionTitle')}</p>
            <div className="apptdetail-grid">
              <div className="apptdetail-item">
                <span className="apptdetail-label">{t('appointmentDetail.bookedForLabel')}</span>
                <span className="apptdetail-value">
                  {appointment.dependentName
                    ? appointment.dependentName
                    : `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || user?.email}
                </span>
              </div>
              <div className="apptdetail-item">
                <span className="apptdetail-label">{t('appointmentDetail.typeLabel')}</span>
                <span className="apptdetail-value">{appointment.dependentName ? t('appointmentDetail.typeFamilyMember') : t('appointmentDetail.typeIndividual')}</span>
              </div>
            </div>

            {appointment.patientNote && (
              <div className="apptdetail-note">
                <span className="apptdetail-note__label">{t('appointmentDetail.noteLabel')}</span>
                <p className="apptdetail-note__text">{appointment.patientNote}</p>
              </div>
            )}
          </div>

          <div className="card apptdetail-timeline-card">
            <h3 className="apptdetail-timeline__heading">{t('appointmentDetail.statusHistoryTitle')}</h3>
            <div className="apptdetail-timeline">
              <div className="apptdetail-timeline__event">
                <span className="apptdetail-timeline__dot" style={{ background: TIMELINE_COLORS[appointment.status] ?? 'var(--muted)' }} />
                <div>
                  <div className="apptdetail-timeline__label" style={{ color: TIMELINE_COLORS[appointment.status] ?? 'var(--muted)' }}>
                    {timelineLabel(appointment.status, t)}
                  </div>
                  <div className="apptdetail-timeline__time">{formatDayMonthTime(new Date().toISOString())}</div>
                </div>
              </div>
              <div className="apptdetail-timeline__event apptdetail-timeline__event--last">
                <span className="apptdetail-timeline__dot" style={{ background: 'var(--ok)' }} />
                <div>
                  <div className="apptdetail-timeline__label" style={{ color: 'var(--ok)' }}>{t('appointmentDetail.bookedEventLabel')}</div>
                  <div className="apptdetail-timeline__time">{formatDayMonthTime(appointment.createdAt)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card apptdetail-action">
          {!showReschedule && (
            <div className="apptdetail-status-card">
              {statusBadge(appointment.status, t)}
              <p className="apptdetail-status-desc">
                {statusDescription(appointment.status, t)}
              </p>
            </div>
          )}

          {showReschedule ? (
            <RescheduleUi
              weekStart={weekStart}
              setWeekStart={setWeekStart}
              selectedDate={selectedDate}
              selectDate={selectDate}
              selectedSlot={selectedSlot}
              setSelectedSlot={setSelectedSlot}
              availableSlots={availableSlots}
              slotsLoading={slotsLoading}
              currentStart={appointment.startDateTime}
              rescheduling={rescheduling}
              onCancel={() => setShowReschedule(false)}
              onConfirm={handleConfirmReschedule}
            />
          ) : appointment.status === AppointmentStatus.Completed ? (
            <>
              <div className="apptdetail-state apptdetail-state--ok">
                <CheckCircle size={28} strokeWidth={1.5} color="var(--ok)" style={{ margin: '0 auto 8px' }} />
                <p>{t('appointmentDetail.completedMessage')}</p>
              </div>
              <Link to={`/mjeku/${appointment.doctorId}`} className="btn btn--primary btn--block" style={{ marginTop: 12 }}>
                {t('appointmentDetail.bookAnotherCta')} <ArrowRight size={14} strokeWidth={1.5} />
              </Link>
            </>
          ) : appointment.status === AppointmentStatus.CancelledByPatient || appointment.status === AppointmentStatus.CancelledByClinic ? (
            <>
              <div className="apptdetail-state apptdetail-state--danger">
                <XCircle size={28} strokeWidth={1.5} color="var(--danger)" style={{ margin: '0 auto 8px' }} />
                <p>{t('appointmentDetail.cancelledMessage')}</p>
              </div>
              <Link to="/kerko" className="btn btn--ghost btn--block" style={{ marginTop: 12 }}>
                {t('appointmentDetail.findAnotherCta')} <ArrowRight size={14} strokeWidth={1.5} />
              </Link>
            </>
          ) : within12h ? (
            <div className="apptdetail-warning">
              <AlertTriangle size={16} strokeWidth={1.5} color="var(--warn)" />
              <span>{t('appointmentDetail.cannotCancelWithin12h')}</span>
            </div>
          ) : canCancel ? (
            <>
              <div className="apptdetail-countdown">
                <Clock size={15} strokeWidth={1.5} color="var(--primary)" />
                <span>{formatCountdown(hoursUntil(appointment.startDateTime), t)}</span>
              </div>

              <button type="button" className="apptdetail-btn-primary" onClick={openReschedule}>
                <CalendarDays size={16} strokeWidth={1.5} />
                {t('appointmentDetail.rescheduleCta')}
              </button>

              <button
                type="button"
                className="apptdetail-btn-danger-outline"
                onClick={() => setShowCancelConfirm((v) => !v)}
              >
                <XCircle size={16} strokeWidth={1.5} />
                {t('appointmentDetail.cancelCta')}
              </button>

              {showCancelConfirm && (
                <div className="apptdetail-cancel-confirm">
                  <p>{t('appointmentDetail.cancelConfirmPrompt', { lastName: doctor?.lastName ?? '' })}</p>
                  <div className="apptdetail-cancel-confirm__row">
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      style={{ flex: 1 }}
                      onClick={() => setShowCancelConfirm(false)}
                    >
                      {tCommon('appointment.actions.cancel')}
                    </button>
                    <button
                      type="button"
                      className="apptdetail-btn-danger-solid"
                      style={{ flex: 1 }}
                      disabled={cancelling}
                      onClick={handleConfirmCancel}
                    >
                      {cancelling ? t('appointmentDetail.cancelling') : t('appointmentDetail.confirmCancelYes')}
                    </button>
                  </div>
                </div>
              )}

              <p className="apptdetail-cancel-note">{t('appointmentDetail.cancelDeadlineNote')}</p>
            </>
          ) : null}

          {!showReschedule && (
            <>
              <div className="apptdetail-infobox">
                <Info size={15} strokeWidth={1.5} color="var(--primary)" />
                <div>
                  <span>{t('appointmentDetail.questionsHint')}</span>
                  {clinic?.phoneNumber && (
                    <a href={`tel:${clinic.phoneNumber}`} className="apptdetail-infobox__phone">
                      <Phone size={13} strokeWidth={1.5} /> {clinic.phoneNumber}
                    </a>
                  )}
                </div>
              </div>

              <Link to="/terminet" className="apptdetail-backlink">
                <ChevronLeft size={14} strokeWidth={1.5} style={{ display: 'inline' }} /> {t('appointmentDetail.backToAppointments')}
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function formatCountdown(hours: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (hours > 24) {
    const days = Math.floor(hours / 24)
    return t('appointmentDetail.countdownDays', { count: days })
  }
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return t('appointmentDetail.countdownHoursMinutes', { hours: h, minutes: m })
}

function RescheduleUi({
  weekStart,
  setWeekStart,
  selectedDate,
  selectDate,
  selectedSlot,
  setSelectedSlot,
  availableSlots,
  slotsLoading,
  currentStart,
  rescheduling,
  onCancel,
  onConfirm,
}: {
  weekStart: Date
  setWeekStart: (d: Date) => void
  selectedDate: string
  selectDate: (date: string) => void
  selectedSlot: string
  setSelectedSlot: (slot: string) => void
  availableSlots: AvailableSlot[]
  slotsLoading: boolean
  currentStart: string
  rescheduling: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const { t } = useTranslation('patient')
  const { t: tCommon } = useTranslation('common')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  // Earliest selectable day is tomorrow — rescheduling onto the current day
  // isn't a meaningful choice for a patient picking a new date.
  const minDate = new Date(today)
  minDate.setDate(minDate.getDate() + 1)
  const maxDate = new Date(today)
  maxDate.setDate(maxDate.getDate() + 30)

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })

  function shiftWeek(dir: number) {
    const next = new Date(weekStart)
    next.setDate(next.getDate() + dir * 7)
    setWeekStart(next)
  }

  const currentTimeStr = formatTimeSq(currentStart)

  return (
    <>
      <div className="apptdetail-reschedule__header">
        <h3>{t('appointmentDetail.rescheduleTitle')}</h3>
        <button type="button" className="apptdetail-reschedule__cancel" onClick={onCancel}>
          <ArrowLeft size={14} strokeWidth={1.5} /> {tCommon('appointment.actions.cancel')}
        </button>
      </div>

      <div className="apptdetail-weekstrip__header">
        <button type="button" onClick={() => shiftWeek(-1)}>
          <ChevronLeft size={18} strokeWidth={1.5} />
        </button>
        <span>{monthName(weekStart.getMonth())} {weekStart.getFullYear()}</span>
        <button type="button" onClick={() => shiftWeek(1)}>
          <ChevronRight size={18} strokeWidth={1.5} />
        </button>
      </div>

      <div className="apptdetail-weekstrip">
        {days.map((d) => {
          const dateStr = toDateInput(d)
          const isPast = d < minDate
          const isFuture = d > maxDate
          const isToday = dateStr === toDateInput(today)
          const isSelected = dateStr === selectedDate
          const disabled = isPast || isFuture
          return (
            <div key={dateStr} className="apptdetail-weekstrip__col">
              <div className="apptdetail-weekstrip__day">{weekdayName(d.getDay(), 'short').toUpperCase()}</div>
              <button
                type="button"
                className={`apptdetail-daybtn ${isSelected ? 'is-selected' : isToday ? 'is-today' : ''}`}
                disabled={disabled}
                onClick={() => selectDate(dateStr)}
              >
                {d.getDate()}
              </button>
            </div>
          )
        })}
      </div>

      <div className="apptdetail-slotgrid">
        {slotsLoading ? (
          Array.from({ length: 6 }).map((_, i) => <div key={i} className="apptdetail-slot-skeleton skeleton-shimmer" />)
        ) : !selectedDate ? null : availableSlots.length === 0 ? (
          <p className="apptdetail-slot-empty">{t('appointmentDetail.rescheduleNoSlotsForDate')}</p>
        ) : (
          availableSlots.map((slot) => {
            const time = formatTimeSq(slot.startDateTime)
            const isOriginal = time === currentTimeStr && toDateInput(parseLocal(slot.startDateTime)) === toDateInput(parseLocal(currentStart))
            const isSelected = selectedSlot === slot.startDateTime
            const disabled = !slot.isAvailable || isOriginal
            return (
              <button
                key={slot.startDateTime}
                type="button"
                className={`apptdetail-slot ${isSelected ? 'is-selected' : ''} ${isOriginal ? 'is-original' : ''} ${!slot.isAvailable ? 'is-unavailable' : ''}`}
                disabled={disabled}
                onClick={() => setSelectedSlot(slot.startDateTime)}
              >
                {time}
              </button>
            )
          })
        )}
      </div>

      {selectedDate && selectedSlot && (
        <div className="apptdetail-summary">
          {t('appointmentDetail.rescheduleNewDateSummary', { date: formatDateSq(selectedSlot), time: formatTimeSq(selectedSlot) })}
        </div>
      )}

      <button
        type="button"
        className="btn btn--primary btn--block"
        disabled={!selectedSlot || rescheduling}
        onClick={onConfirm}
      >
        {rescheduling ? (
          <>
            <Pending /> {t('appointmentDetail.reschedulingInProgress')}
          </>
        ) : (
          <>
            <Check size={16} strokeWidth={1.5} /> {t('appointmentDetail.confirmReschedule')}
          </>
        )}
      </button>
    </>
  )
}
