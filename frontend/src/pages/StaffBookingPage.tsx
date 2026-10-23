import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CalendarX, Check, ChevronLeft, Info, Search, UserPlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api, ApiError } from '../lib/api'
import { getErrorMessage, getSlotTakenMessage } from '../lib/errors'
import type {
  AdminClinic,
  AdminDoctorDetail,
  AdminDoctorService,
  AdminPatientDependent,
  AdminPatientSearchResult,
  AvailableSlot,
  ClinicBranch,
} from '../lib/types'
import { useToast } from '../context/ToastContext'
import { useAdminBreadcrumb } from '../context/AdminBreadcrumbContext'
import { Badge, CustomSelect, ErrorBox, Pending, SkeletonRows, type CustomSelectOption } from '../components/ui'
import MonthCalendar from '../components/MonthCalendar'
import { formatDateLong, formatMoney, formatTime } from '../lib/format'
import { clinicToday } from '../lib/clinicTime'

/** The patient the booking is for, whether found by search or just created. */
interface ChosenPatient {
  patientProfileId: string
  firstName: string
  lastName: string
  isNameMasked: boolean
  contact?: string
  dependents: AdminPatientDependent[]
}

const EMPTY_NEW_PATIENT = { firstName: '', lastName: '', phoneNumber: '', email: '', dateOfBirth: '' }

/**
 * Clinic staff booking on behalf of a patient (phone / front desk). Same rules as
 * the patient flow — the backend checks working hours, absences and double
 * booking — and the same calendar component. Patient lookup is exact phone or
 * email only; for someone who has never been to this clinic the server sends
 * only the surname initial, and the page never asks for more.
 */
export default function StaffBookingPage() {
  const { t } = useTranslation('admin')
  const navigate = useNavigate()
  const { notify } = useToast()
  const { setTrail } = useAdminBreadcrumb()

  useEffect(() => {
    setTrail([t('layout.appointmentsBreadcrumb'), t('staffBooking.breadcrumb')])
    return () => setTrail([])
  }, [setTrail, t])

  // ---------- Step 1: patient ----------
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [results, setResults] = useState<AdminPatientSearchResult[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [newPatient, setNewPatient] = useState(EMPTY_NEW_PATIENT)
  const [createError, setCreateError] = useState('')
  const [savingPatient, setSavingPatient] = useState(false)
  const [existingNotice, setExistingNotice] = useState(false)
  const [patient, setPatient] = useState<ChosenPatient | null>(null)
  const [dependentId, setDependentId] = useState('')

  async function handleSearch(e: FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    setSearching(true)
    setSearchError('')
    setResults(null)
    setCreating(false)
    try {
      const r = await api.searchAdminPatients(q)
      setResults(r.items)
    } catch (err) {
      setSearchError(getErrorMessage(err))
    } finally {
      setSearching(false)
    }
  }

  function startCreate() {
    const q = query.trim()
    setNewPatient({
      ...EMPTY_NEW_PATIENT,
      phoneNumber: q.includes('@') ? '' : q,
      email: q.includes('@') ? q : '',
    })
    setCreateError('')
    setCreating(true)
  }

  function choose(p: AdminPatientSearchResult) {
    setPatient({
      patientProfileId: p.patientProfileId,
      firstName: p.firstName,
      lastName: p.lastName,
      isNameMasked: p.isNameMasked,
      contact: p.phoneNumber ?? p.email,
      dependents: p.dependents,
    })
    setExistingNotice(false)
    setDependentId('')
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    const { firstName, lastName, phoneNumber, email, dateOfBirth } = newPatient
    if (!firstName.trim() || !lastName.trim() || !phoneNumber.trim()) {
      setCreateError(t('staffBooking.requiredFields'))
      return
    }
    setSavingPatient(true)
    setCreateError('')
    try {
      const created = await api.createAdminPatient({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phoneNumber: phoneNumber.trim(),
        email: email.trim() || undefined,
        dateOfBirth: dateOfBirth || undefined,
      })
      setPatient({
        patientProfileId: created.patientProfileId,
        firstName: created.firstName,
        lastName: created.lastName,
        isNameMasked: created.isNameMasked,
        contact: created.phoneNumber ?? created.email ?? phoneNumber.trim(),
        dependents: created.dependents ?? [],
      })
      setExistingNotice(created.isExistingPatient)
      setDependentId('')
      setCreating(false)
    } catch (err) {
      setCreateError(getErrorMessage(err))
    } finally {
      setSavingPatient(false)
    }
  }

  function resetPatient() {
    setPatient(null)
    setExistingNotice(false)
    setDependentId('')
  }

  // ---------- Step 3: clinic, doctor, service, branch ----------
  const [clinics, setClinics] = useState<AdminClinic[] | null>(null)
  const [clinicsError, setClinicsError] = useState('')
  const [clinicId, setClinicId] = useState('')
  const [doctors, setDoctors] = useState<AdminDoctorDetail[] | null>(null)
  const [branches, setBranches] = useState<ClinicBranch[]>([])
  const [doctorId, setDoctorId] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [branchId, setBranchId] = useState('')
  const [openSelect, setOpenSelect] = useState<'clinic' | 'doctor' | 'service' | 'branch' | null>(null)

  const loadClinics = () => {
    setClinicsError('')
    api
      .getAdminClinics()
      .then((list) => {
        const usable = list.filter((c) => c.isApproved && c.isActive)
        setClinics(usable)
        if (usable.length === 1) setClinicId(usable[0].id)
      })
      .catch((e) => setClinicsError(getErrorMessage(e)))
  }
  useEffect(loadClinics, [])

  useEffect(() => {
    if (!clinicId) return
    let active = true
    setDoctors(null)
    setDoctorId('')
    Promise.all([api.getAdminClinicDoctors(clinicId), api.getClinicBranches(clinicId)])
      .then(([ds, bs]) => {
        if (!active) return
        setDoctors(ds.filter((d) => d.isActive && d.services.length > 0 && d.branches.length > 0))
        setBranches(bs)
      })
      .catch((e) => active && setClinicsError(getErrorMessage(e)))
    return () => {
      active = false
    }
  }, [clinicId])

  const doctor = doctors?.find((d) => d.id === doctorId) ?? null
  const service: AdminDoctorService | null = doctor?.services.find((s) => s.medicalServiceId === serviceId) ?? null
  // Only active branches of this clinic where the doctor works.
  const doctorBranches = useMemo(
    () => (doctor ? branches.filter((b) => doctor.branches.some((db) => db.id === b.id)) : []),
    [doctor, branches],
  )

  function pickDoctor(id: string) {
    setDoctorId(id)
    setServiceId('')
    const d = doctors?.find((x) => x.id === id)
    const bs = d ? branches.filter((b) => d.branches.some((db) => db.id === b.id)) : []
    setBranchId(bs.length === 1 ? bs[0].id : '')
    resetSlot()
  }

  // ---------- Step 4: date and slot ----------
  const [date, setDate] = useState('')
  const [slots, setSlots] = useState<AvailableSlot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slot, setSlot] = useState('')

  function resetSlot() {
    setDate('')
    setSlot('')
    setSlots([])
  }

  function pickDate(d: string) {
    setDate(d)
    setSlot('')
    if (!doctorId || !branchId || !serviceId) return
    setSlotsLoading(true)
    api
      .getAvailableSlots(doctorId, branchId, serviceId, d)
      .then((s) => setSlots((s ?? []).filter((x) => x.isAvailable)))
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false))
  }

  // ---------- Step 5: confirm ----------
  const [internalNote, setInternalNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  async function handleConfirm() {
    if (!patient || !doctorId || !serviceId || !branchId || !slot) return
    setSubmitting(true)
    setSubmitError('')
    try {
      await api.createAppointmentForPatient({
        patientProfileId: patient.patientProfileId,
        doctorId,
        clinicBranchId: branchId,
        medicalServiceId: serviceId,
        dependentId: dependentId || undefined,
        startDateTime: slot,
        internalNote: internalNote.trim() || undefined,
      })
      notify(t('staffBooking.bookedToast'), 'ok')
      navigate('/admin-panel/terminet')
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setSubmitError(getSlotTakenMessage())
        if (date) pickDate(date)
      } else {
        setSubmitError(getErrorMessage(err))
      }
    } finally {
      setSubmitting(false)
    }
  }

  // Steps are numbered by what is actually shown: "Për kë" only appears when the patient has family members.
  const hasForWhom = !!patient && patient.dependents.length > 0
  const stepNo = (n: 1 | 2 | 3 | 4 | 5) => (n <= 2 || hasForWhom ? n : n - 1)
  const option = (value: string, label: string): CustomSelectOption => ({ value, label })
  const placeholder = (label: string): CustomSelectOption => ({ value: '', label, disabled: true })
  const forWhom = dependentId ? patient?.dependents.find((d) => d.id === dependentId) : null

  return (
    <div className="staff-booking">
      <Link to="/admin-panel/terminet" className="link-icon apptdetail-back">
        <ChevronLeft size={16} strokeWidth={1.5} /> {t('staffBooking.backToAppointments')}
      </Link>
      <div className="admin-header">
        <div>
          <h1>{t('staffBooking.title')}</h1>
          <p className="admin-header__sub">{t('staffBooking.subtitle')}</p>
        </div>
      </div>

      {/* ---------- 1. Patient ---------- */}
      <section className="card staff-booking__step">
        <h2 className="staff-booking__title">{stepNo(1)}. {t('staffBooking.step1')}</h2>

        {patient ? (
          <div className="staff-booking__chosen">
            <div>
              <strong>
                {patient.firstName} {patient.lastName}
              </strong>
              {patient.contact && <span className="staff-booking__muted">{patient.contact}</span>}
              {patient.isNameMasked && <span className="staff-booking__muted">{t('staffBooking.maskedHint')}</span>}
            </div>
            <button type="button" className="btn btn--ghost btn--sm" onClick={resetPatient}>
              {t('staffBooking.change')}
            </button>
          </div>
        ) : (
          <>
            <form className="staff-booking__search" onSubmit={handleSearch}>
              <div className="field">
                <label htmlFor="staff-patient-search">{t('staffBooking.searchLabel')}</label>
                <input
                  id="staff-patient-search"
                  type="search"
                  inputMode="email"
                  autoComplete="off"
                  placeholder={t('staffBooking.searchPlaceholder')}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn--primary" disabled={searching || query.trim().length < 3}>
                {searching ? <Pending /> : <Search size={16} strokeWidth={1.5} />} {t('staffBooking.searchCta')}
              </button>
            </form>
            <p className="staff-booking__muted">{t('staffBooking.searchHint')}</p>

            {searchError && <ErrorBox message={searchError} />}

            {results && results.length > 0 && !creating && (
              <div className="booking-cards">
                {results.map((r) => (
                  <button key={r.patientProfileId} type="button" className="booking-choice" onClick={() => choose(r)}>
                    <span className="booking-choice__main">
                      <span className="booking-choice__name">
                        {r.firstName} {r.lastName}{' '}
                        {!r.hasRelationshipWithClinic && <Badge tone="muted">{t('staffBooking.newToClinic')}</Badge>}
                      </span>
                      <span className="booking-choice__sub">{r.phoneNumber ?? r.email}</span>
                    </span>
                    <span className="booking-choice__price">{t('staffBooking.select')}</span>
                  </button>
                ))}
              </div>
            )}

            {results && results.length === 0 && !creating && (
              <div className="staff-booking__empty">
                <p>{t('staffBooking.notFound')}</p>
                <button type="button" className="btn btn--primary btn--sm" onClick={startCreate}>
                  <UserPlus size={15} strokeWidth={1.5} /> {t('staffBooking.createNew')}
                </button>
              </div>
            )}

            {creating && (
              <form className="staff-booking__create" onSubmit={handleCreate}>
                <h3>{t('staffBooking.createTitle')}</h3>
                <div className="form-row">
                  <div className="field">
                    <label htmlFor="np-first">{t('staffBooking.firstName')}</label>
                    <input id="np-first" value={newPatient.firstName} onChange={(e) => setNewPatient({ ...newPatient, firstName: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor="np-last">{t('staffBooking.lastName')}</label>
                    <input id="np-last" value={newPatient.lastName} onChange={(e) => setNewPatient({ ...newPatient, lastName: e.target.value })} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="field">
                    <label htmlFor="np-phone">{t('staffBooking.phone')}</label>
                    <input id="np-phone" type="tel" value={newPatient.phoneNumber} onChange={(e) => setNewPatient({ ...newPatient, phoneNumber: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor="np-dob">{t('staffBooking.dobOptional')}</label>
                    <input id="np-dob" type="date" max={clinicToday()} value={newPatient.dateOfBirth} onChange={(e) => setNewPatient({ ...newPatient, dateOfBirth: e.target.value })} />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="np-email">{t('staffBooking.emailOptional')}</label>
                  <input id="np-email" type="email" value={newPatient.email} onChange={(e) => setNewPatient({ ...newPatient, email: e.target.value })} />
                  <span className="field__hint">{t('staffBooking.emailHint')}</span>
                </div>
                {createError && <ErrorBox message={createError} />}
                <div className="staff-booking__actions">
                  <button type="submit" className="btn btn--primary btn--sm" disabled={savingPatient}>
                    {savingPatient ? <Pending /> : <Check size={15} strokeWidth={1.5} />} {t('staffBooking.createCta')}
                  </button>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setCreating(false)}>
                    {t('staffBooking.cancel')}
                  </button>
                </div>
              </form>
            )}
          </>
        )}

        {existingNotice && (
          <p className="staff-booking__notice">
            <Info size={15} strokeWidth={1.5} /> {t('staffBooking.existingNotice')}
          </p>
        )}
      </section>

      {/* ---------- 2. For whom (only when there are family members) ---------- */}
      {patient && patient.dependents.length > 0 && (
        <section className="card staff-booking__step">
          <h2 className="staff-booking__title">{stepNo(2)}. {t('staffBooking.step2')}</h2>
          <div className="booking-cards">
            <button type="button" className={`booking-choice ${dependentId === '' ? 'is-selected' : ''}`} onClick={() => setDependentId('')}>
              <span className="booking-choice__main">
                <span className="booking-choice__name">{t('staffBooking.forPatient')}</span>
                <span className="booking-choice__sub">
                  {patient.firstName} {patient.lastName}
                </span>
              </span>
            </button>
            {patient.dependents.map((d) => (
              <button
                key={d.id}
                type="button"
                className={`booking-choice ${dependentId === d.id ? 'is-selected' : ''}`}
                onClick={() => setDependentId(d.id)}
              >
                <span className="booking-choice__main">
                  <span className="booking-choice__name">
                    {d.firstName} {d.lastName}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ---------- 3. Doctor, service, branch ---------- */}
      {patient && (
        <section className="card staff-booking__step">
          <h2 className="staff-booking__title">{stepNo(3)}. {t('staffBooking.step3')}</h2>
          {clinicsError ? (
            <ErrorBox message={clinicsError} onRetry={loadClinics} />
          ) : clinics === null ? (
            <SkeletonRows count={2} />
          ) : clinics.length === 0 ? (
            <p className="staff-booking__muted">{t('staffBooking.noClinics')}</p>
          ) : (
            <div className="staff-booking__selects">
              {clinics.length > 1 && (
                <CustomSelect
                  label={t('staffBooking.clinicLabel')}
                  options={[placeholder(t('staffBooking.choose')), ...clinics.map((c) => option(c.id, c.name))]}
                  value={clinicId}
                  onChange={(v) => {
                    setClinicId(v)
                    resetSlot()
                  }}
                  open={openSelect === 'clinic'}
                  onOpenChange={(o) => setOpenSelect(o ? 'clinic' : null)}
                />
              )}
              {clinicId && doctors === null && <SkeletonRows count={1} />}
              {doctors && doctors.length === 0 && <p className="staff-booking__muted">{t('staffBooking.noDoctors')}</p>}
              {doctors && doctors.length > 0 && (
                <CustomSelect
                  label={t('staffBooking.doctorLabel')}
                  options={[placeholder(t('staffBooking.choose')), ...doctors.map((d) => option(d.id, `Dr. ${d.firstName} ${d.lastName}`))]}
                  value={doctorId}
                  onChange={pickDoctor}
                  open={openSelect === 'doctor'}
                  onOpenChange={(o) => setOpenSelect(o ? 'doctor' : null)}
                />
              )}
              {doctor && (
                <CustomSelect
                  label={t('staffBooking.serviceLabel')}
                  options={[
                    placeholder(t('staffBooking.choose')),
                    ...doctor.services.map((s) =>
                      option(s.medicalServiceId, `${s.name} · ${s.durationMinutes} min · ${formatMoney(s.price, s.currency)}`),
                    ),
                  ]}
                  value={serviceId}
                  onChange={(v) => {
                    setServiceId(v)
                    resetSlot()
                  }}
                  open={openSelect === 'service'}
                  onOpenChange={(o) => setOpenSelect(o ? 'service' : null)}
                />
              )}
              {doctor && doctorBranches.length > 1 && (
                <CustomSelect
                  label={t('staffBooking.branchLabel')}
                  options={[placeholder(t('staffBooking.choose')), ...doctorBranches.map((b) => option(b.id, `${b.name} — ${b.address}`))]}
                  value={branchId}
                  onChange={(v) => {
                    setBranchId(v)
                    resetSlot()
                  }}
                  open={openSelect === 'branch'}
                  onOpenChange={(o) => setOpenSelect(o ? 'branch' : null)}
                />
              )}
            </div>
          )}
        </section>
      )}

      {/* ---------- 4. Date and time ---------- */}
      {patient && doctorId && serviceId && branchId && (
        <section className="card staff-booking__step">
          <h2 className="staff-booking__title">{stepNo(4)}. {t('staffBooking.step4')}</h2>
          <div className="staff-booking__when">
            <MonthCalendar
              key={`${doctorId}-${branchId}-${serviceId}`}
              doctorId={doctorId}
              branchId={branchId}
              serviceId={serviceId}
              selectedDate={date}
              onPick={pickDate}
            />
            {date && (
              <div>
                <p className="booking-step__label">{formatDateLong(date)}</p>
                {slotsLoading ? (
                  <div className="booking-slotgrid">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="booking-slot-skeleton skeleton-shimmer" />
                    ))}
                  </div>
                ) : slots.length === 0 ? (
                  <div className="booking-slots-empty">
                    <CalendarX size={28} strokeWidth={1.5} color="var(--line)" style={{ margin: '0 auto 8px' }} />
                    <p>{t('staffBooking.noSlots')}</p>
                  </div>
                ) : (
                  <div className="booking-slotgrid">
                    {slots.map((s) => (
                      <button
                        key={s.startDateTime}
                        type="button"
                        className={`booking-slot ${slot === s.startDateTime ? 'is-selected' : ''}`}
                        onClick={() => setSlot(s.startDateTime)}
                      >
                        {formatTime(s.startDateTime)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ---------- 5. Confirm ---------- */}
      {patient && slot && service && (
        <section className="card staff-booking__step">
          <h2 className="staff-booking__title">{stepNo(5)}. {t('staffBooking.step5')}</h2>
          <dl className="staff-booking__summary">
            <div>
              <dt>{t('staffBooking.summaryPatient')}</dt>
              <dd>
                {forWhom ? `${forWhom.firstName} ${forWhom.lastName} (${patient.firstName} ${patient.lastName})` : `${patient.firstName} ${patient.lastName}`}
              </dd>
            </div>
            <div>
              <dt>{t('staffBooking.summaryWhen')}</dt>
              <dd>
                {formatDateLong(slot)}, {formatTime(slot)}
              </dd>
            </div>
            <div>
              <dt>{t('staffBooking.serviceLabel')}</dt>
              <dd>
                {service.name} · {service.durationMinutes} min
              </dd>
            </div>
            <div>
              <dt>{t('staffBooking.summaryPrice')}</dt>
              <dd>{formatMoney(service.price, service.currency)}</dd>
            </div>
          </dl>
          <div className="field">
            <label htmlFor="staff-internal-note">{t('staffBooking.internalNote')}</label>
            <textarea id="staff-internal-note" rows={2} maxLength={1000} value={internalNote} onChange={(e) => setInternalNote(e.target.value)} />
            <span className="field__hint">{t('staffBooking.internalNoteHint')}</span>
          </div>
          <p className="staff-booking__muted">{t('staffBooking.emailNotice')}</p>
          {submitError && (
            <div className="apptdetail-warning" role="alert">
              <CalendarX size={16} strokeWidth={1.5} color="var(--danger)" />
              <span>{submitError}</span>
            </div>
          )}
          <button type="button" className="btn btn--primary btn--block" disabled={submitting} onClick={handleConfirm}>
            {submitting ? (
              <>
                <Pending /> {t('staffBooking.submitting')}
              </>
            ) : (
              <>
                <Check size={16} strokeWidth={1.5} /> {t('staffBooking.confirmCta')}
              </>
            )}
          </button>
        </section>
      )}
    </div>
  )
}
