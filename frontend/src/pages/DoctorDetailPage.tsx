import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, ArrowUp, Calendar, CalendarX, ChevronLeft, ChevronRight, Clock, MapPin } from 'lucide-react'
import { api } from '../lib/api'
import type { AvailableSlot, DoctorBranch, DoctorDetails, DoctorService } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import { ErrorBox, SkeletonDetail, initials, specialtyIcon, specialtyLabel } from '../components/ui'
import { formatMoney, formatTime, toDateInput } from '../lib/format'

const DAYS_SQ = ['E Diel', 'E Hënë', 'E Martë', 'E Mërkurë', 'E Enjte', 'E Premte', 'E Shtunë']
const WEEK_HEADERS = ['HËN', 'MAR', 'MËR', 'ENJ', 'PRE', 'SHT', 'DIE']
const MONTHS_SQ = ['Janar', 'Shkurt', 'Mars', 'Prill', 'Maj', 'Qershor', 'Korrik', 'Gusht', 'Shtator', 'Tetor', 'Nëntor', 'Dhjetor']

function parseLocal(iso: string): Date {
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/)
  if (!m) return new Date(iso)
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), m[4] ? Number(m[4]) : 0, m[5] ? Number(m[5]) : 0)
}

function startOfWeek(d: Date): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const day = copy.getDay() // 0 = Sunday
  const diff = day === 0 ? 6 : day - 1 // week starts Monday
  copy.setDate(copy.getDate() - diff)
  return copy
}

function formatDateLabel(dateStr: string): string {
  const d = parseLocal(dateStr)
  return `${DAYS_SQ[d.getDay()]}, ${d.getDate()} ${MONTHS_SQ[d.getMonth()]}`
}

export default function DoctorDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()

  const [doctor, setDoctor] = useState<DoctorDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [currentStep, setCurrentStep] = useState(1)
  const [selectedService, setSelectedService] = useState<DoctorService | null>(null)
  const [selectedBranch, setSelectedBranch] = useState<DoctorBranch | null>(null)
  const [branchAutoSelected, setBranchAutoSelected] = useState(false)
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedSlot, setSelectedSlot] = useState('')
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))

  useEffect(() => {
    if (!id) return
    let active = true
    setLoading(true)
    api
      .getDoctor(id)
      .then((d) => {
        if (!active) return
        setDoctor(d)
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [id])

  function fetchSlots(date: string, branch: DoctorBranch, service: DoctorService) {
    if (!id) return
    setSlotsLoading(true)
    api
      .getAvailableSlots(id, branch.branchId, service.medicalServiceId, date)
      .then((s) => setAvailableSlots(s ?? []))
      .catch(() => setAvailableSlots([]))
      .finally(() => setSlotsLoading(false))
  }

  function pickService(service: DoctorService) {
    setSelectedService(service)
    setSelectedSlot('')
    if (doctor && doctor.branches.length === 1) {
      setSelectedBranch(doctor.branches[0])
      setBranchAutoSelected(true)
      setCurrentStep(3)
    } else {
      setSelectedBranch(null)
      setBranchAutoSelected(false)
      setCurrentStep(2)
    }
  }

  function pickBranch(branch: DoctorBranch) {
    setSelectedBranch(branch)
    setCurrentStep(3)
  }

  function pickDate(date: string) {
    setSelectedDate(date)
    setSelectedSlot('')
    setCurrentStep(4)
    if (selectedBranch && selectedService) fetchSlots(date, selectedBranch, selectedService)
  }

  function handleConfirm() {
    if (!id || !doctor || !selectedService || !selectedBranch || !selectedDate || !selectedSlot) return
    if (!isAuthenticated) {
      navigate(`/hyr?redirect=/mjeku/${id}`)
      return
    }
    sessionStorage.setItem(
      'termini_pending_booking',
      JSON.stringify({
        doctorId: id,
        doctorName: `Dr. ${doctor.firstName} ${doctor.lastName}`,
        serviceId: selectedService.medicalServiceId,
        serviceName: selectedService.name,
        serviceDurationMinutes: selectedService.durationMinutes,
        branchId: selectedBranch.branchId,
        branchName: selectedBranch.branchName,
        date: selectedDate,
        time: formatTime(selectedSlot),
        startDateTime: selectedSlot,
        price: selectedService.price,
        currency: selectedService.currency || 'EUR',
      }),
    )
    navigate('/rezervo/konfirmo')
  }

  if (loading) return <div className="container page"><SkeletonDetail label="Duke ngarkuar profilin" /></div>
  if (error) return <div className="container page"><ErrorBox message={error} /></div>
  if (!doctor) return null

  return (
    <div className="page">
      <div className="detail-hero">
        <div className="container">
          <Link to="/kerko" className="backlink link-icon">
            <ChevronLeft size={16} strokeWidth={1.5} /> Kthehu te kërkimi
          </Link>
          <div className="detail-hero__row">
            <div className="detail-hero__avatar" aria-hidden>
              {initials(doctor.firstName, doctor.lastName)}
            </div>
            <div>
              <h1>Dr. {doctor.firstName} {doctor.lastName}</h1>
              <div className="detail-hero__meta">
                {doctor.specialties.map((s) => {
                  const Icon = specialtyIcon(s)
                  return (
                    <span key={s} className="chip chip--light">
                      <Icon size={14} strokeWidth={1.5} /> {specialtyLabel(s)}
                    </span>
                  )
                })}
              </div>
              {doctor.yearsOfExperience > 0 && (
                <p className="detail-hero__desc">{doctor.yearsOfExperience} vjet përvojë</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="container detail-body detail-body--split">
        <div className="detail-col">
          {doctor.biography && (
            <section className="block">
              <h2 className="block__title">Rreth mjekut</h2>
              <p className="prose">{doctor.biography}</p>
            </section>
          )}

          <section className="block">
            <h2 className="block__title">Ku ordinon</h2>
            <div className="grid grid--branches">
              {doctor.branches.map((b) => (
                <div key={b.branchId} className="branch-card">
                  <strong>{b.clinicName}</strong>
                  <span>{b.branchName}</span>
                  <span>
                    <MapPin size={14} strokeWidth={1.5} /> {b.address}, {b.city}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="block">
            <h2 className="block__title">Shërbimet</h2>
            <div className="service-list">
              {doctor.services.map((s) => {
                const Icon = specialtyIcon(s.specialtyName)
                return (
                  <div key={s.medicalServiceId} className="service-row">
                    <span className="service-row__icon"><Icon size={20} strokeWidth={1.5} /></span>
                    <div className="service-row__info">
                      <strong>{s.name}</strong>
                      <span><Clock size={12} strokeWidth={1.5} /> {s.durationMinutes} min</span>
                    </div>
                    <span className="service-row__price">{formatMoney(s.price, s.currency)}</span>
                  </div>
                )
              })}
            </div>
          </section>
        </div>

        <aside className="booking">
          <div className="booking__card booking-widget">
            <div className="booking-widget__head">
              <h2 className="booking-widget__title">Rezervoni termin</h2>
              <p className="booking-widget__sub">Plotësoni hapat për të rezervuar.</p>
            </div>

            <StepIndicator currentStep={currentStep} showBranch={!branchAutoSelected} />

            {currentStep === 1 && (
              <div className="booking-step">
                <p className="booking-step__label">Zgjidhni shërbimin</p>
                <div className="booking-cards">
                  {doctor.services.map((s) => (
                    <button
                      key={s.medicalServiceId}
                      type="button"
                      className={`booking-choice ${selectedService?.medicalServiceId === s.medicalServiceId ? 'is-selected' : ''}`}
                      onClick={() => pickService(s)}
                    >
                      <span className="booking-choice__main">
                        <span className="booking-choice__name">{s.name}</span>
                        <span className="booking-choice__sub"><Clock size={11} strokeWidth={1.5} /> {s.durationMinutes} min</span>
                      </span>
                      <span className="booking-choice__price">{formatMoney(s.price, s.currency)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="booking-step">
                <button type="button" className="booking-back" onClick={() => { setCurrentStep(1); setSelectedBranch(null) }}>
                  <ArrowLeft size={13} strokeWidth={1.5} /> Ndrysho shërbimin
                </button>
                <p className="booking-step__label">Zgjidhni degën</p>
                <div className="booking-cards">
                  {doctor.branches.map((b) => (
                    <button
                      key={b.branchId}
                      type="button"
                      className={`booking-choice ${selectedBranch?.branchId === b.branchId ? 'is-selected' : ''}`}
                      onClick={() => pickBranch(b)}
                    >
                      <span className="booking-choice__main">
                        <span className="booking-choice__name">{b.branchName}</span>
                        <span className="booking-choice__sub">{b.address}, {b.city}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="booking-step">
                <button
                  type="button"
                  className="booking-back"
                  onClick={() => setCurrentStep(branchAutoSelected ? 1 : 2)}
                >
                  <ArrowLeft size={13} strokeWidth={1.5} /> {branchAutoSelected ? 'Ndrysho shërbimin' : 'Ndrysho degën'}
                </button>
                <p className="booking-step__label">Zgjidhni datën</p>
                <WeekStrip
                  weekStart={weekStart}
                  setWeekStart={setWeekStart}
                  selectedDate={selectedDate}
                  onPick={pickDate}
                />
              </div>
            )}

            {currentStep === 4 && (
              <div className="booking-step">
                <button type="button" className="booking-back" onClick={() => { setCurrentStep(3); setSelectedSlot('') }}>
                  <ArrowLeft size={13} strokeWidth={1.5} /> Ndrysho datën
                </button>
                <p className="booking-selected-date">
                  <Calendar size={13} strokeWidth={1.5} color="var(--primary)" /> {formatDateLabel(selectedDate)}
                </p>
                <p className="booking-step__label">Zgjidhni orën</p>
                {slotsLoading ? (
                  <div className="booking-slotgrid">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="booking-slot-skeleton skeleton-shimmer" />
                    ))}
                  </div>
                ) : availableSlots.length === 0 ? (
                  <div className="booking-slots-empty">
                    <CalendarX size={28} strokeWidth={1.5} color="var(--line)" style={{ margin: '0 auto 8px' }} />
                    <p>Nuk ka vende të lira për këtë datë.</p>
                    <button type="button" className="booking-empty-link" onClick={() => { setCurrentStep(3); setSelectedSlot('') }}>
                      Provoni datë tjetër <ArrowUp size={12} strokeWidth={1.5} />
                    </button>
                  </div>
                ) : (
                  <div className="booking-slotgrid">
                    {availableSlots.map((slot) => (
                      <button
                        key={slot.startDateTime}
                        type="button"
                        className={`booking-slot ${selectedSlot === slot.startDateTime ? 'is-selected' : ''} ${!slot.isAvailable ? 'is-unavailable' : ''}`}
                        disabled={!slot.isAvailable}
                        onClick={() => setSelectedSlot(slot.startDateTime)}
                      >
                        {formatTime(slot.startDateTime)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {selectedService && (
              <>
                <div className="booking__summary booking-widget__summary">
                  <div><span>{selectedService.name}</span><strong>{formatMoney(selectedService.price, selectedService.currency)}</strong></div>
                  {selectedDate && selectedSlot && (
                    <div><span>{formatDateLabel(selectedDate)}, {formatTime(selectedSlot)}</span></div>
                  )}
                </div>

                <button
                  className="btn btn--primary btn--block booking-widget__cta"
                  disabled={currentStep !== 4 || !selectedSlot}
                  onClick={handleConfirm}
                >
                  {currentStep === 4 && selectedSlot ? 'Konfirmo rezervimin' : 'Vazhdo'}
                  <ArrowRight size={16} strokeWidth={1.5} />
                </button>
              </>
            )}

            {!isAuthenticated && (
              <p className="booking__hint booking-widget__login">
                Duhet të jeni të kyçur për të rezervuar.{' '}
                <Link to={`/hyr?redirect=/mjeku/${id}`} className="booking-widget__login-link">Kyçuni <ArrowRight size={13} strokeWidth={1.5} /></Link>
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

const STEP_LABELS = ['Shërbimi', 'Dega', 'Data', 'Ora']

function StepIndicator({ currentStep, showBranch }: { currentStep: number; showBranch: boolean }) {
  return (
    <div className="booking-steps">
      {STEP_LABELS.map((label, i) => {
        const step = i + 1
        // When the branch step is skipped, mark "Dega" completed once past step 1.
        const isCompleted = step < currentStep || (!showBranch && step === 2 && currentStep >= 3)
        const isActive = step === currentStep
        const state = isActive ? 'is-active' : isCompleted ? 'is-completed' : ''
        return (
          <div className="booking-steps__item" key={label}>
            {i > 0 && <span className={`booking-steps__line ${step <= currentStep ? 'is-filled' : ''}`} />}
            <span className="booking-steps__col">
              <span className={`booking-steps__dot ${state}`} />
              <span className={`booking-steps__label ${state}`}>{label}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

function WeekStrip({
  weekStart,
  setWeekStart,
  selectedDate,
  onPick,
}: {
  weekStart: Date
  setWeekStart: (d: Date) => void
  selectedDate: string
  onPick: (date: string) => void
}) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const maxDate = new Date(today)
  maxDate.setDate(maxDate.getDate() + 60)
  const thisWeekStart = startOfWeek(today)

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })

  const atFirstWeek = weekStart.getTime() <= thisWeekStart.getTime()

  function shift(dir: number) {
    if (dir < 0 && atFirstWeek) return
    const next = new Date(weekStart)
    next.setDate(next.getDate() + dir * 7)
    setWeekStart(next)
  }

  return (
    <>
      <div className="booking-week__header">
        <button type="button" onClick={() => shift(-1)} disabled={atFirstWeek} className={atFirstWeek ? 'is-disabled' : ''}>
          <ChevronLeft size={18} strokeWidth={1.5} />
        </button>
        <span>{MONTHS_SQ[weekStart.getMonth()]} {weekStart.getFullYear()}</span>
        <button type="button" onClick={() => shift(1)}>
          <ChevronRight size={18} strokeWidth={1.5} />
        </button>
      </div>

      <div className="booking-week__days">
        {WEEK_HEADERS.map((label) => (
          <span key={label} className="booking-week__dayhead">{label}</span>
        ))}
      </div>

      <div className="booking-week__grid">
        {days.map((d) => {
          const dateStr = toDateInput(d)
          const isPast = d < today
          const isFuture = d > maxDate
          const isToday = dateStr === toDateInput(today)
          const isSelected = dateStr === selectedDate
          const disabled = isPast || isFuture
          return (
            <button
              key={dateStr}
              type="button"
              className={`booking-daybtn ${isSelected ? 'is-selected' : isToday ? 'is-today' : ''}`}
              disabled={disabled}
              onClick={() => onPick(dateStr)}
            >
              {d.getDate()}
            </button>
          )
        })}
      </div>
    </>
  )
}
