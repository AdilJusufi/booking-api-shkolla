import { useCallback, useEffect, useRef, useState, type TouchEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, ArrowUp, Calendar, CalendarX, Check, ChevronLeft, ChevronRight, Clock, MapPin } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import type { AvailableSlot, DayAvailability, DoctorBranch, DoctorDetails, DoctorService } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import { ErrorBox, SkeletonDetail, initials, specialtyIcon } from '../components/ui'
import { useSpecialtyLabel } from '../context/SpecialtyNamesContext'
import { formatMoney, formatTime, monthName, toDateInput, weekdayName } from '../lib/format'
import { SITE_NAME, doctorSeo } from '../lib/seo'
import { useSeo } from '../lib/useSeo'

// Display order Monday-first while JS Date.getDay() stays Sunday(0)..Saturday(6).
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

function parseLocal(iso: string): Date {
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/)
  if (!m) return new Date(iso)
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), m[4] ? Number(m[4]) : 0, m[5] ? Number(m[5]) : 0)
}

/** How far ahead the calendar lets a patient book. */
const MAX_DAYS_AHEAD = 60

function formatDateLabel(dateStr: string): string {
  const d = parseLocal(dateStr)
  return `${weekdayName(d.getDay())}, ${d.getDate()} ${monthName(d.getMonth())}`
}

export default function DoctorDetailPage() {
  const { t } = useTranslation('patient')
  const specialtyLabel = useSpecialtyLabel()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const preselectServiceId = searchParams.get('sherbimi')

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
  const bookingRef = useRef<HTMLDivElement>(null)
  const servicesRef = useRef<HTMLElement>(null)

  const load = useCallback(() => {
    if (!id) return
    let active = true
    setLoading(true)
    setError('')
    api
      .getDoctor(id)
      .then((d) => {
        if (!active) return
        setDoctor(d)
      })
      .catch((e) => active && setError(getErrorMessage(e)))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [id])

  useEffect(load, [load])

  // An error / unknown id is still served as HTTP 200 (SPA), so it must say noindex itself.
  useSeo(doctor ? doctorSeo(doctor, { t, specialtyLabel }) : error ? { title: SITE_NAME, noindex: true } : null)

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
    setSelectedDate('')
    if (doctor && doctor.branches.length === 1) {
      setSelectedBranch(doctor.branches[0])
      setBranchAutoSelected(true)
      setCurrentStep(3)
    } else {
      setSelectedBranch(null)
      setBranchAutoSelected(false)
      setCurrentStep(2)
    }
    // Below the split-layout breakpoint the widget sits under the services
    // list — bring it into view so the tap visibly starts the booking.
    if (window.matchMedia('(max-width: 900px)').matches) {
      requestAnimationFrame(() => bookingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }
  }

  // `?sherbimi=` (set by the clinic page's service list) starts the booking on
  // that service. Logged-out visitors sign in first and come back to this same
  // URL; the param is dropped once applied so going back doesn't re-trigger it.
  useEffect(() => {
    if (!preselectServiceId || !doctor || !id) return
    if (!isAuthenticated) {
      navigate('/hyr', { replace: true, state: { from: `/mjeku/${id}?sherbimi=${encodeURIComponent(preselectServiceId)}` } })
      return
    }
    const service = doctor.services.find((s) => s.medicalServiceId === preselectServiceId)
    if (service) pickService(service)
    setSearchParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectServiceId, doctor, id, isAuthenticated])

  function clearService() {
    setSelectedService(null)
    setSelectedBranch(null)
    setBranchAutoSelected(false)
    setSelectedDate('')
    setSelectedSlot('')
    setCurrentStep(1)
  }

  /** One step back from wherever the user is — every step has this. */
  function goBack() {
    if (currentStep === 4) {
      setSelectedSlot('')
      setCurrentStep(3)
    } else if (currentStep === 3) {
      setSelectedDate('')
      if (branchAutoSelected) clearService()
      else {
        setSelectedBranch(null)
        setCurrentStep(2)
      }
    } else if (currentStep === 2) {
      clearService()
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
      // `state`, jo `?redirect=` në URL: LoginPage lexon vetëm location.state (shih
      // ProtectedRoute dhe thirrësit e tjerë), kështu që parametri i vjetër i query-t
      // injorohej në heshtje — përdoruesi kthehej te faqja kryesore dhe e humbte
      // zgjedhjen e slotit. State-i s'mund të mbushet nga një link i krijuar nga jashtë,
      // ndaj s'ka as sipërfaqe për ridrejtim të hapur.
      navigate('/hyr', { state: { from: `/mjeku/${id}` } })
      return
    }
    sessionStorage.setItem(
      'rezervo_pending_booking',
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

  if (loading) return <div className="container page"><SkeletonDetail label={t('doctorDetail.loadingLabel')} /></div>
  if (error) return <div className="container page"><ErrorBox message={error} onRetry={load} /></div>
  if (!doctor) return null

  return (
    <div className="page">
      <div className="detail-hero">
        <div className="container">
          <Link to="/kerko" className="backlink link-icon">
            <ChevronLeft size={16} strokeWidth={1.5} /> {t('doctorDetail.backToSearch')}
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
                <p className="detail-hero__desc">{t('doctorDetail.experienceYears', { count: doctor.yearsOfExperience })}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="container detail-body detail-body--split">
        <div className="detail-col">
          {doctor.biography && (
            <section className="block">
              <h2 className="block__title">{t('doctorDetail.aboutTitle')}</h2>
              <p className="prose">{doctor.biography}</p>
            </section>
          )}

          <section className="block">
            <h2 className="block__title">{t('doctorDetail.whereTitle')}</h2>
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

          <section className="block" ref={servicesRef}>
            <h2 className="block__title">{t('doctorDetail.servicesTitle')}</h2>
            {isAuthenticated && <p className="block__hint">{t('doctorDetail.servicesHint')}</p>}
            <div className="service-list">
              {doctor.services.map((s) => {
                const Icon = specialtyIcon(s.specialtyName)
                const isSelected = selectedService?.medicalServiceId === s.medicalServiceId
                const info = (
                  <>
                    <span className="service-row__icon">
                      {isSelected ? <Check size={20} strokeWidth={2} /> : <Icon size={20} strokeWidth={1.5} />}
                    </span>
                    <span className="service-row__info">
                      <strong>{s.name}</strong>
                      <span>
                        <Clock size={12} strokeWidth={1.5} /> {s.durationMinutes} {t('doctorDetail.minutesShort')}
                        {isSelected && <span className="service-row__selected">· {t('doctorDetail.selectedLabel')}</span>}
                      </span>
                    </span>
                    <span className="service-row__price">{formatMoney(s.price, s.currency)}</span>
                  </>
                )
                // Logged-out visitors get the same list read-only: booking starts after sign-in.
                return isAuthenticated ? (
                  <button
                    key={s.medicalServiceId}
                    type="button"
                    className={`service-row service-row--pick ${isSelected ? 'is-selected' : ''}`}
                    aria-pressed={isSelected}
                    onClick={() => pickService(s)}
                  >
                    {info}
                  </button>
                ) : (
                  <div key={s.medicalServiceId} className="service-row">{info}</div>
                )
              })}
            </div>
          </section>
        </div>

        <aside className="booking">
          <div className="booking__card booking-widget" ref={bookingRef}>
            <div className="booking-widget__head">
              <h2 className="booking-widget__title">{t('doctorDetail.bookingTitle')}</h2>
              {isAuthenticated && <p className="booking-widget__sub">{t('doctorDetail.bookingSubtitle')}</p>}
            </div>

            {isAuthenticated ? (
              <>
                <StepIndicator currentStep={currentStep} showBranch={!branchAutoSelected} />

                {currentStep === 1 && (
                  <div className="booking-step booking-step--intro">
                    <p className="booking-intro">{t('doctorDetail.pickServiceHint')}</p>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm booking-intro__cta"
                      onClick={() => servicesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    >
                      {t('doctorDetail.pickServiceCta')} <ArrowUp size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                )}

                {currentStep > 1 && (
                  <button type="button" className="booking-back" onClick={goBack}>
                    <ArrowLeft size={16} strokeWidth={1.75} /> {t('doctorDetail.back')}
                  </button>
                )}

                {currentStep === 2 && (
                  <div className="booking-step">
                    <p className="booking-step__label">{t('doctorDetail.chooseBranch')}</p>
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

                {currentStep === 3 && selectedBranch && selectedService && id && (
                  <div className="booking-step">
                    <p className="booking-step__label">{t('doctorDetail.chooseDate')}</p>
                    <MonthCalendar
                      doctorId={id}
                      branchId={selectedBranch.branchId}
                      serviceId={selectedService.medicalServiceId}
                      selectedDate={selectedDate}
                      onPick={pickDate}
                    />
                  </div>
                )}

                {currentStep === 4 && (
                  <div className="booking-step">
                    <p className="booking-selected-date">
                      <Calendar size={13} strokeWidth={1.5} color="var(--primary)" /> {formatDateLabel(selectedDate)}
                    </p>
                    <p className="booking-step__label">{t('doctorDetail.chooseTime')}</p>
                    {slotsLoading ? (
                      <div className="booking-slotgrid">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <div key={i} className="booking-slot-skeleton skeleton-shimmer" />
                        ))}
                      </div>
                    ) : availableSlots.length === 0 ? (
                      <div className="booking-slots-empty">
                        <CalendarX size={28} strokeWidth={1.5} color="var(--line)" style={{ margin: '0 auto 8px' }} />
                        <p>{t('doctorDetail.noSlotsForDate')}</p>
                        <button type="button" className="booking-empty-link" onClick={goBack}>
                          {t('doctorDetail.tryAnotherDate')} <ArrowUp size={12} strokeWidth={1.5} />
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
                      {currentStep === 4 && selectedSlot ? t('doctorDetail.confirmBooking') : t('doctorDetail.continueCta')}
                      <ArrowRight size={16} strokeWidth={1.5} />
                    </button>
                  </>
                )}
              </>
            ) : (
              <div className="booking-login">
                <p className="booking-login__text">{t('doctorDetail.loginToBookHint')}</p>
                <Link to="/hyr" state={{ from: `/mjeku/${id}` }} className="btn btn--primary btn--block">
                  {t('doctorDetail.loginToBook')} <ArrowRight size={16} strokeWidth={1.5} />
                </Link>
                <Link to="/regjistrohu" className="booking-login__register">{t('doctorDetail.registerCta')}</Link>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

function StepIndicator({ currentStep, showBranch }: { currentStep: number; showBranch: boolean }) {
  const { t } = useTranslation('patient')
  const STEP_LABELS = [t('doctorDetail.steps.service'), t('doctorDetail.steps.branch'), t('doctorDetail.steps.date'), t('doctorDetail.steps.time')]
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
function MonthCalendar({
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
  const today = new Date()
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
