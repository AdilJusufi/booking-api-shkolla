import { useEffect, useMemo, useState } from 'react'
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
  MapPin,
  XCircle,
} from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { AppointmentStatus } from '../lib/types'
import type { Appointment, AvailableSlot, DoctorDetails } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { Badge, Pending, initials, specialtyLabel } from '../components/ui'
import { toDateInput } from '../lib/format'

const DAYS_SQ = ['E Diel', 'E Hënë', 'E Martë', 'E Mërkurë', 'E Enjte', 'E Premte', 'E Shtunë']
const DAY_ABBR_SQ = ['DIE', 'HËN', 'MAR', 'MËR', 'ENJ', 'PRE', 'SHT']
const MONTHS_SQ = ['Janar', 'Shkurt', 'Mars', 'Prill', 'Maj', 'Qershor', 'Korrik', 'Gusht', 'Shtator', 'Tetor', 'Nëntor', 'Dhjetor']
const MONTHS_ABBR_SQ = ['Jan', 'Shk', 'Mar', 'Pri', 'Maj', 'Qer', 'Kor', 'Gus', 'Sht', 'Tet', 'Nën', 'Dhj']

function parseLocal(iso: string): Date {
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/)
  if (!m) return new Date(iso)
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), m[4] ? Number(m[4]) : 0, m[5] ? Number(m[5]) : 0)
}

function formatDateSq(iso: string): string {
  const d = parseLocal(iso)
  return `${DAYS_SQ[d.getDay()]}, ${d.getDate()} ${MONTHS_SQ[d.getMonth()]} ${d.getFullYear()}`
}

function formatTimeSq(iso: string): string {
  const d = parseLocal(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
} 

function formatDayMonthTime(iso: string): string {
  const d = parseLocal(iso)
  return `${d.getDate()} ${MONTHS_ABBR_SQ[d.getMonth()]}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const ACTIVE_STATUSES = [AppointmentStatus.Pending, AppointmentStatus.Confirmed]
const TIMELINE_LABELS: Partial<Record<AppointmentStatus, { text: string; color: string }>> = {
  [AppointmentStatus.Pending]: { text: 'Në pritje', color: 'var(--warn)' },
  [AppointmentStatus.Confirmed]: { text: 'Konfirmuar', color: 'var(--primary)' },
  [AppointmentStatus.CheckedIn]: { text: 'Mbërritur në klinikë', color: 'var(--ok)' },
  [AppointmentStatus.InProgress]: { text: 'Në proces', color: 'var(--ok)' },
  [AppointmentStatus.Completed]: { text: 'Përfunduar', color: 'var(--ok)' },
  [AppointmentStatus.CancelledByPatient]: { text: 'Anuluar nga ju', color: 'var(--danger)' },
  [AppointmentStatus.CancelledByClinic]: { text: 'Anuluar nga klinika', color: 'var(--danger)' },
  [AppointmentStatus.NoShow]: { text: 'Nuk u paraqit', color: 'var(--danger)' },
  [AppointmentStatus.Rescheduled]: { text: 'Riplanifikuar', color: 'var(--warn)' },
}

function statusBadge(status: AppointmentStatus) {
  switch (status) {
    case AppointmentStatus.Pending:
      return <Badge tone="warn">NË PRITJE</Badge>
    case AppointmentStatus.Confirmed:
      return <Badge tone="primary">KONFIRMUAR</Badge>
    case AppointmentStatus.CheckedIn:
      return <Badge tone="ok">MBËRRITUR</Badge>
    case AppointmentStatus.InProgress:
      return <span className="badge" style={{ background: '#ede9fe', color: '#7c3aed' }}>NË PROGRES</span>
    case AppointmentStatus.Completed:
      return <Badge tone="ok">PËRFUNDUAR</Badge>
    case AppointmentStatus.CancelledByPatient:
    case AppointmentStatus.CancelledByClinic:
      return <Badge tone="danger">ANULUAR</Badge>
    case AppointmentStatus.NoShow:
      return <Badge tone="muted">NUK U PARAQIT</Badge>
    case AppointmentStatus.Rescheduled:
      return <Badge tone="warn">RISCHEDULUAR</Badge>
    default:
      return <Badge tone="muted">I PANJOHUR</Badge>
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
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { notify } = useToast()

  const [appointment, setAppointment] = useState<Appointment | null>(null)
  const [doctor, setDoctor] = useState<DoctorDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

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

  useEffect(() => {
    if (!id) return
    let active = true
    setLoading(true)
    setNotFound(false)
    api
      .getMyAppointment(id)
      .then((a) => {
        if (!active) return
        setAppointment(a)
        return api.getDoctor(a.doctorId).then((d) => {
          if (active) setDoctor(d)
        })
      })
      .catch((e) => {
        if (!active) return
        if (e instanceof ApiError && e.status === 401) {
          navigate('/hyr', { state: { from: `/terminet/${id}` } })
          return
        }
        setNotFound(true)
      })
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [id, navigate])

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
      await api.cancelAppointment(appointment.id, 'Anuluar nga pacienti')
      setAppointment((prev) => (prev ? { ...prev, status: AppointmentStatus.CancelledByPatient } : prev))
      setShowCancelConfirm(false)
      notify('Termini u anulua.', 'error')
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        navigate('/hyr')
        return
      }
      notify('Gabim. Provoni përsëri.', 'error')
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
      notify('Termini u rischedulua me sukses.', 'ok')
      navigate('/terminet')
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        notify('Ky termin u mor. Zgjidhni orë tjetër.', 'error')
        setSelectedSlot('')
        selectDate(selectedDate)
      } else if (e instanceof ApiError && e.status === 401) {
        navigate('/hyr')
      } else {
        notify('Gabim. Provoni përsëri.', 'error')
      }
    } finally {
      setRescheduling(false)
    }
  }

  if (loading) return <DetailSkeleton />

  if (notFound || !appointment) {
    return (
      <div className="apptdetail-notfound">
        <CalendarX size={64} strokeWidth={1.5} color="var(--line)" style={{ margin: '0 auto 16px' }} />
        <h2>Termini nuk u gjet</h2>
        <p>Ky termin nuk ekziston ose nuk keni akses.</p>
        <Link to="/terminet" className="btn btn--ghost">
          <ChevronLeft size={16} strokeWidth={1.5} /> Kthehu te terminet
        </Link>
      </div>
    )
  }

  const doctorInitials = doctor ? initials(doctor.firstName, doctor.lastName) : '—'
  const durationMinutes = service?.durationMinutes ?? Math.round((parseLocal(appointment.endDateTime).getTime() - parseLocal(appointment.startDateTime).getTime()) / 60000)

  return (
    <div className="detail-page">
      <Link to="/terminet" className="link-icon apptdetail-back">
        <ChevronLeft size={16} strokeWidth={1.5} /> Kthehu te terminet
      </Link>

      <div className="apptdetail-layout">
        <div>
          <div className="card apptdetail-card">
            <div className="apptdetail-top">
              {statusBadge(appointment.status)}
              <span className="apptdetail-ref">REF: #{appointment.id.slice(0, 7).toUpperCase()}</span>
            </div>

            <div className="apptdetail-doctor">
              <div className="apptdetail-avatar">{doctorInitials}</div>
              <div>
                <h2 className="apptdetail-doctor__name">Dr. {doctor?.firstName ?? appointment.doctorName} {doctor?.lastName ?? ''}</h2>
                <div className="apptdetail-doctor__meta">
                  {service && <span className="apptdetail-spec-chip">{specialtyLabel(service.specialtyName)}</span>}
                  <span className="apptdetail-sep">—</span>
                  <span className="apptdetail-muted">{appointment.clinicName}</span>
                  <span className="apptdetail-sep">—</span>
                  <span className="apptdetail-muted">{appointment.branchName}</span>
                </div>
              </div>
            </div>

            <div className="apptdetail-divider" />

            <div className="apptdetail-grid">
              <div className="apptdetail-item">
                <span className="apptdetail-label">Data</span>
                <span className="apptdetail-value apptdetail-value--lg">{formatDateSq(appointment.startDateTime)}</span>
              </div>
              <div className="apptdetail-item">
                <span className="apptdetail-label">Ora</span>
                <span className="apptdetail-value apptdetail-value--md">
                  {formatTimeSq(appointment.startDateTime)} – {formatTimeSq(appointment.endDateTime)}
                  <span className="apptdetail-duration-pill">({durationMinutes} min)</span>
                </span>
              </div>
              <div className="apptdetail-item">
                <span className="apptdetail-label">Shërbimi</span>
                <span className="apptdetail-value">{appointment.serviceName}</span>
              </div>
              <div className="apptdetail-item">
                <span className="apptdetail-label">Çmimi</span>
                <span className="apptdetail-value">{service ? `${service.price} ${service.currency === 'EUR' ? '€' : service.currency}` : '—'}</span>
              </div>
              <div className="apptdetail-item">
                <span className="apptdetail-label">Dega</span>
                <span className="apptdetail-value apptdetail-value--row">
                  <MapPin size={13} strokeWidth={1.5} color="var(--muted)" />
                  {appointment.branchAddress}{branch?.city ? `, ${branch.city}` : ''}
                </span>
              </div>
              <div className="apptdetail-item">
                <span className="apptdetail-label">Rezervuar për</span>
                <span className="apptdetail-value">
                  {appointment.dependentName ? appointment.dependentName : `Unë (${user?.email ?? ''})`}
                </span>
              </div>
            </div>

            {appointment.patientNote && (
              <div className="apptdetail-note">
                <span className="apptdetail-note__label">Keni shënim:</span>
                <p className="apptdetail-note__text">{appointment.patientNote}</p>
              </div>
            )}
          </div>

          <div className="card apptdetail-timeline-card">
            <h3 className="apptdetail-timeline__heading">Historiku i statusit</h3>
            <div className="apptdetail-timeline">
              <div className="apptdetail-timeline__event">
                <span className="apptdetail-timeline__dot" style={{ background: TIMELINE_LABELS[appointment.status]?.color ?? 'var(--muted)' }} />
                <div>
                  <div className="apptdetail-timeline__label" style={{ color: TIMELINE_LABELS[appointment.status]?.color ?? 'var(--muted)' }}>
                    {TIMELINE_LABELS[appointment.status]?.text ?? 'I panjohur'}
                  </div>
                  <div className="apptdetail-timeline__time">{formatDayMonthTime(new Date().toISOString())}</div>
                </div>
              </div>
              <div className="apptdetail-timeline__event apptdetail-timeline__event--last">
                <span className="apptdetail-timeline__dot" style={{ background: 'var(--ok)' }} />
                <div>
                  <div className="apptdetail-timeline__label" style={{ color: 'var(--ok)' }}>Rezervuar</div>
                  <div className="apptdetail-timeline__time">{formatDayMonthTime(appointment.createdAt)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card apptdetail-action">
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
                <p>Takimi u përfundua me sukses.</p>
              </div>
              <Link to={`/mjeku/${appointment.doctorId}`} className="btn btn--primary btn--block" style={{ marginTop: 12 }}>
                Rezervoni termin tjetër <ArrowRight size={14} strokeWidth={1.5} />
              </Link>
            </>
          ) : appointment.status === AppointmentStatus.CancelledByPatient || appointment.status === AppointmentStatus.CancelledByClinic ? (
            <>
              <div className="apptdetail-state apptdetail-state--danger">
                <XCircle size={28} strokeWidth={1.5} color="var(--danger)" style={{ margin: '0 auto 8px' }} />
                <p>Termini u anulua.</p>
              </div>
              <Link to="/kerko" className="btn btn--ghost btn--block" style={{ marginTop: 12 }}>
                Gjeni termin tjetër <ArrowRight size={14} strokeWidth={1.5} />
              </Link>
            </>
          ) : within12h ? (
            <div className="apptdetail-warning">
              <AlertTriangle size={16} strokeWidth={1.5} color="var(--warn)" />
              <span>Anulimi nuk është i mundur — takimi fillon brenda 12 orëve.</span>
            </div>
          ) : canCancel ? (
            <>
              <div className="apptdetail-countdown">
                <Clock size={15} strokeWidth={1.5} color="var(--primary)" />
                <span>{formatCountdown(hoursUntil(appointment.startDateTime))}</span>
              </div>

              <button type="button" className="apptdetail-btn-primary" onClick={openReschedule}>
                <CalendarDays size={16} strokeWidth={1.5} />
                Rischeduloni terminin
              </button>

              <button
                type="button"
                className="apptdetail-btn-danger-outline"
                onClick={() => setShowCancelConfirm((v) => !v)}
              >
                <XCircle size={16} strokeWidth={1.5} />
                Anuloni terminin
              </button>

              {showCancelConfirm && (
                <div className="apptdetail-cancel-confirm">
                  <p>Anuloni terminin me Dr. {doctor?.lastName ?? ''}?</p>
                  <div className="apptdetail-cancel-confirm__row">
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      style={{ flex: 1 }}
                      onClick={() => setShowCancelConfirm(false)}
                    >
                      Anulo
                    </button>
                    <button
                      type="button"
                      className="apptdetail-btn-danger-solid"
                      style={{ flex: 1 }}
                      disabled={cancelling}
                      onClick={handleConfirmCancel}
                    >
                      {cancelling ? 'Duke anuluar…' : 'Po, anulo'}
                    </button>
                  </div>
                </div>
              )}

              <p className="apptdetail-cancel-note">Mund të anuloni deri 12 orë para takimit.</p>
            </>
          ) : null}

          {!showReschedule && (
            <Link to="/terminet" className="apptdetail-backlink">
              <ChevronLeft size={14} strokeWidth={1.5} style={{ display: 'inline' }} /> Kthehu te terminet
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

function formatCountdown(hours: number): string {
  if (hours > 24) {
    const days = Math.floor(hours / 24)
    return `Mbetet ${days} ditë`
  }
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return `Mbetet ${h} orë ${m} min`
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
  const today = new Date()
  today.setHours(0, 0, 0, 0)
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
        <h3>Zgjidhni datë të re</h3>
        <button type="button" className="apptdetail-reschedule__cancel" onClick={onCancel}>
          <ArrowLeft size={14} strokeWidth={1.5} /> Anulo
        </button>
      </div>

      <div className="apptdetail-weekstrip__header">
        <button type="button" onClick={() => shiftWeek(-1)}>
          <ChevronLeft size={18} strokeWidth={1.5} />
        </button>
        <span>{MONTHS_SQ[weekStart.getMonth()]} {weekStart.getFullYear()}</span>
        <button type="button" onClick={() => shiftWeek(1)}>
          <ChevronRight size={18} strokeWidth={1.5} />
        </button>
      </div>

      <div className="apptdetail-weekstrip">
        {days.map((d) => {
          const dateStr = toDateInput(d)
          const isPast = d < today
          const isFuture = d > maxDate
          const isToday = dateStr === toDateInput(today)
          const isSelected = dateStr === selectedDate
          const disabled = isPast || isFuture
          return (
            <div key={dateStr} className="apptdetail-weekstrip__col">
              <div className="apptdetail-weekstrip__day">{DAY_ABBR_SQ[d.getDay()]}</div>
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
          <p className="apptdetail-slot-empty">Nuk ka vende të lira për këtë datë.</p>
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
          Data e re: {formatDateSq(selectedSlot)} ora {formatTimeSq(selectedSlot)}
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
            <Pending /> Duke rischeduluar…
          </>
        ) : (
          <>
            <Check size={16} strokeWidth={1.5} /> Konfirmo rischedulimin
          </>
        )}
      </button>
    </>
  )
}
