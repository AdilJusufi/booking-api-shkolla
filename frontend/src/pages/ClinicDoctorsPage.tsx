import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  Clock,
  Copy,
  Eye,
  EyeOff,
  Lock,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCw,
  Stethoscope,
} from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import type {
  ClinicBranch,
  CreateDoctorRequest,
  CreateWorkingScheduleRequest,
  Doctor,
  DoctorDetails,
  MedicalService,
  Specialty,
} from '../lib/types'
import { useToast } from '../context/ToastContext'
import { useClinicContext } from '../components/ClinicDetailLayout'
import { CustomSelect, EmptyState, ErrorBox, Modal, SkeletonRows, initials } from '../components/ui'
import type { CustomSelectOption } from '../components/ui'
import { weekdayName } from '../lib/format'

// Display order Monday-first while JS Date.getDay() stays Sunday(0)..Saturday(6).
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

const EMPTY_DOCTOR_FORM: CreateDoctorRequest = {
  firstName: '',
  lastName: '',
  email: '',
  phoneNumber: '',
  initialPassword: '',
  licenseNumber: '',
  biography: '',
  yearsOfExperience: 0,
  specialtyIds: [],
  branchIds: [],
  serviceIds: [],
}

type StatusFilter = 'all' | 'active' | 'inactive'

/**
 * Pasqyron saktësisht policy-n e backend-it (PasswordRuleExtensions.ValidPassword
 * dhe Identity: gjatësi 8, shkronjë e madhe, e vogël, shifër — karakteri special
 * NUK kërkohet). Pa këtë kontroll, "abcdefgh" kalon te klienti dhe refuzohet nga serveri.
 */
function passwordPolicyError(password: string, t: (key: string) => string): string | null {
  if (password.length < 8) return t('doctors.addModal.passwordTooShort')
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return t('doctors.addModal.passwordPolicy')
  }
  return null
}

/**
 * Gjeneron një fjalëkalim që e plotëson policy-n. Karakteret e ngatërrueshme
 * (O/0, l/1/I) janë hequr qëllimisht — ky fjalëkalim i komunikohet mjekut me
 * zë ose me kopjim, prandaj leximi i gabuar është problem real.
 */
function generatePassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghijkmnpqrstuvwxyz'
  const digits = '23456789'
  const all = upper + lower + digits

  const pick = (set: string) => set[Math.floor(Math.random() * set.length)]

  // Një nga secili grup garanton përputhjen me policy-n; pjesa tjetër është e rastit.
  const required = [pick(upper), pick(lower), pick(digits)]
  const rest = Array.from({ length: 9 }, () => pick(all))

  return [...required, ...rest]
    .map((char) => ({ char, order: Math.random() }))
    .sort((a, b) => a.order - b.order)
    .map((x) => x.char)
    .join('')
}

/** Kredencialet e shfaqura një herë të vetme pas krijimit të llogarisë. */
interface CreatedDoctorCredentials {
  firstName: string
  lastName: string
  email: string
  password: string
}

export default function ClinicDoctorsPage() {
  const { t } = useTranslation('admin')
  const { clinic } = useClinicContext()
  const { notify } = useToast()

  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [details, setDetails] = useState<Record<string, DoctorDetails>>({})
  const [branches, setBranches] = useState<ClinicBranch[]>([])
  const [specialties, setSpecialties] = useState<Specialty[]>([])
  const [services, setServices] = useState<MedicalService[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [branchFilter, setBranchFilter] = useState('all')
  const [specialtyFilter, setSpecialtyFilter] = useState('all')
  // The public doctor list carries no active/inactive flag (see load()) — the
  // filter is real UI, but "Joaktiv" can only ever match zero doctors today.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [openFilter, setOpenFilter] = useState<'branch' | 'specialty' | 'status' | null>(null)

  const [addModalOpen, setAddModalOpen] = useState(false)
  const [createdDoctor, setCreatedDoctor] = useState<CreatedDoctorCredentials | null>(null)
  const [scheduleTarget, setScheduleTarget] = useState<Doctor | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  const load = useCallback(() => {
    // GET /api/clinics/{id}/doctors (and branches/services, fetched here too
    // for the add-doctor modal) are public routes — they 404 for a clinic
    // that isn't approved yet. Skip the fetch and let the pending branch
    // below explain why the page is empty, rather than a confusing "not
    // found" error.
    if (!clinic.isApproved) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    Promise.all([
      api.getClinicDoctors(clinic.id),
      api.getClinicBranches(clinic.id),
      api.getSpecialties(),
      api.getClinicServices(clinic.id),
    ])
      .then(async ([doctorList, branchList, specialtyList, serviceList]) => {
        setDoctors(doctorList)
        setBranches(branchList)
        setSpecialties(specialtyList)
        setServices(serviceList)

        // The list endpoint (GET /clinics/{id}/doctors) is deliberately thin —
        // it has no branches/services. /api/doctors/{id} (DoctorDetailsDto) is
        // the only place those live, so we hydrate each card individually.
        const pairs = await Promise.all(
          doctorList.map((d) => api.getDoctor(d.id).then((detail) => [d.id, detail] as const).catch(() => null)),
        )
        const map: Record<string, DoctorDetails> = {}
        for (const pair of pairs) {
          if (pair) map[pair[0]] = pair[1]
        }
        setDetails(map)
      })
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false))
  }, [clinic.id, clinic.isApproved])

  useEffect(load, [load])

  const filtered = useMemo(
    () =>
      doctors.filter((d) => {
        if (statusFilter === 'inactive') return false
        if (specialtyFilter !== 'all') {
          const specialty = specialties.find((s) => s.id === specialtyFilter)
          if (!specialty || !d.specialties.includes(specialty.name)) return false
        }
        if (branchFilter !== 'all') {
          const detail = details[d.id]
          if (!detail || !detail.branches.some((b) => b.branchId === branchFilter)) return false
        }
        return true
      }),
    [doctors, details, branchFilter, specialtyFilter, statusFilter, specialties],
  )

  const branchOptions: CustomSelectOption[] = useMemo(
    () => [{ value: 'all', label: t('doctors.filterAllBranches') }, ...branches.map((b) => ({ value: b.id, label: b.name }))],
    [branches, t],
  )
  const specialtyOptions: CustomSelectOption[] = useMemo(
    () => [
      { value: 'all', label: t('doctors.filterAllSpecialties') },
      ...specialties.map((s) => ({ value: s.id, label: s.name })),
    ],
    [specialties, t],
  )
  const statusOptions: CustomSelectOption[] = [
    { value: 'all', label: t('doctors.filterAll') },
    { value: 'active', label: t('doctors.filterActive') },
    { value: 'inactive', label: t('doctors.filterInactive') },
  ]

  function handleAction(action: string, doctor: Doctor) {
    setOpenMenuId(null)
    if (action === 'schedule') {
      setScheduleTarget(doctor)
      return
    }
    if (action === 'toggle') {
      notify(t('doctors.featureInDevelopmentToast'), 'info')
      return
    }
    if (action === 'edit') {
      notify(t('doctors.featureInDevelopmentToast'), 'info')
    }
  }

  return (
    <div className="doctors-page">
      <div className="admin-header">
        <div>
          <h1>{t('doctors.pageTitle')}</h1>
          <p className="admin-header__sub">{t('doctors.pageSubtitle')}</p>
        </div>
        {clinic.isApproved && (
          <button type="button" className="btn btn--primary btn--sm" onClick={() => setAddModalOpen(true)}>
            <Plus size={15} strokeWidth={1.5} /> {t('doctors.addCta')}
          </button>
        )}
      </div>

      {!clinic.isApproved ? (
        <EmptyState icon={Lock} title={t('doctors.pendingTitle')} hint={t('doctors.pendingHint')} />
      ) : (
      <>
      <div className="filters">
        <div className="filters__field">
          <CustomSelect
            label={t('doctors.filterBranchLabel')}
            options={branchOptions}
            value={branchFilter}
            onChange={setBranchFilter}
            open={openFilter === 'branch'}
            onOpenChange={(isOpen) => setOpenFilter(isOpen ? 'branch' : null)}
          />
        </div>
        <div className="filters__field">
          <CustomSelect
            label={t('doctors.filterSpecialtyLabel')}
            options={specialtyOptions}
            value={specialtyFilter}
            onChange={setSpecialtyFilter}
            open={openFilter === 'specialty'}
            onOpenChange={(isOpen) => setOpenFilter(isOpen ? 'specialty' : null)}
          />
        </div>
        <div className="filters__field">
          <CustomSelect
            label={t('doctors.filterStatusLabel')}
            options={statusOptions}
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as StatusFilter)}
            open={openFilter === 'status'}
            onOpenChange={(isOpen) => setOpenFilter(isOpen ? 'status' : null)}
          />
        </div>
      </div>

      {loading ? (
        <SkeletonRows count={4} label={t('doctors.loadingLabel')} />
      ) : error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : doctors.length === 0 ? (
        <EmptyState
          icon={Stethoscope}
          title={t('doctors.emptyTitle')}
          action={
            <button type="button" className="btn btn--primary btn--sm" onClick={() => setAddModalOpen(true)}>
              <Plus size={15} strokeWidth={1.5} /> {t('doctors.addFirstCta')}
            </button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Stethoscope} title={t('doctors.noMatchTitle')} />
      ) : (
        <div className="doctor-grid">
          {filtered.map((d) => (
            <ClinicDoctorCard
              key={d.id}
              doctor={d}
              detail={details[d.id]}
              menuOpen={openMenuId === d.id}
              onToggleMenu={() => setOpenMenuId((cur) => (cur === d.id ? null : d.id))}
              onCloseMenu={() => setOpenMenuId(null)}
              onAction={(action) => handleAction(action, d)}
            />
          ))}
        </div>
      )}

      {addModalOpen && (
        <AddDoctorModal
          clinicId={clinic.id}
          branches={branches}
          specialties={specialties}
          services={services}
          onClose={() => setAddModalOpen(false)}
          onCreated={(credentials) => {
            setAddModalOpen(false)
            setCreatedDoctor(credentials)
          }}
        />
      )}

      {createdDoctor && (
        <DoctorCredentialsModal
          credentials={createdDoctor}
          onClose={() => {
            setCreatedDoctor(null)
            load()
          }}
        />
      )}

      {scheduleTarget && (
        <DoctorScheduleModal
          doctor={scheduleTarget}
          detail={details[scheduleTarget.id]}
          onClose={() => setScheduleTarget(null)}
        />
      )}
      </>
      )}
    </div>
  )
}

function ClinicDoctorCard({
  doctor,
  detail,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  onAction,
}: {
  doctor: Doctor
  detail?: DoctorDetails
  menuOpen: boolean
  onToggleMenu: () => void
  onCloseMenu: () => void
  onAction: (action: string) => void
}) {
  const { t } = useTranslation('admin')
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onCloseMenu()
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [menuOpen, onCloseMenu])

  const visibleServices = detail?.services.slice(0, 3) ?? []
  const extraServiceCount = (detail?.services.length ?? 0) - visibleServices.length

  return (
    <div className="admin-card doctor-admin-card">
      <div className="doctor-admin-card__top">
        <div className="doctor-admin-card__avatar" aria-hidden>
          {initials(doctor.firstName, doctor.lastName)}
        </div>
        <div className="doctor-admin-card__identity">
          <div className="doctor-admin-card__name-row">
            <h3 className="doctor-admin-card__name">Dr. {doctor.firstName} {doctor.lastName}</h3>
            <span className="admin-card__status admin-card__status--approved admin-card__status--inline">{t('doctors.card.statusActive')}</span>
          </div>
          <div className="doctor-admin-card__specialties">
            {doctor.specialties.map((s) => (
              <span key={s} className="service-card__specialty">{s}</span>
            ))}
          </div>
        </div>
        <div className="doctor-admin-card__actions">
          <button type="button" className="admin-icon-btn" onClick={() => onAction('edit')} aria-label={t('doctors.card.editAria')}>
            <Pencil size={15} strokeWidth={1.5} />
          </button>
          <div className="doctor-admin-card__menu" ref={menuRef}>
            <button type="button" className="admin-icon-btn" onClick={onToggleMenu} aria-label={t('doctors.card.moreActionsAria')}>
              <MoreVertical size={15} strokeWidth={1.5} />
            </button>
            {menuOpen && (
              <div className="dropdown__panel doctor-admin-card__menu-panel">
                <button type="button" className="dropdown__option" onClick={() => onAction('edit')}>
                  {t('doctors.card.editMenuItem')}
                </button>
                <button type="button" className="dropdown__option" onClick={() => onAction('schedule')}>
                  {t('doctors.card.manageScheduleMenuItem')}
                </button>
                <Link to={`/mjeku/${doctor.id}`} className="dropdown__option" onClick={onCloseMenu}>
                  {t('doctors.card.viewPublicProfile')}
                </Link>
                <button type="button" className="dropdown__option" onClick={() => onAction('toggle')}>
                  {t('doctors.card.deactivateMenuItem')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/*
        No card here for license number / verification status: the list
        endpoint (Doctor: id, firstName, lastName, yearsOfExperience,
        specialties) never returns them, and no admin endpoint exposes them
        for an existing doctor either — only the one-time creation response
        (AdminDoctorDto) has licenseNumber/isVerified, and it's discarded
        after that call. Showing a fake dash for missing data would be worse
        than omitting the row.
      */}
      <div className="doctor-admin-card__meta">
        <span><Clock size={13} strokeWidth={1.5} /> {t('doctors.card.yearsExperience', { count: doctor.yearsOfExperience })}</span>
      </div>

      <div className="doctor-admin-card__row">
        <span className="doctor-admin-card__row-label">{t('doctors.card.branchesLabel')}</span>
        {detail ? (
          detail.branches.length > 0 ? (
            detail.branches.map((b) => (
              <span key={b.branchId} className="chip chip--soft">{b.branchName}</span>
            ))
          ) : (
            <span className="muted" style={{ fontSize: 12 }}>{t('doctors.card.noBranchAssigned')}</span>
          )
        ) : (
          <span className="muted" style={{ fontSize: 12 }}>—</span>
        )}
      </div>

      <div className="doctor-admin-card__row">
        <span className="doctor-admin-card__row-label">{t('doctors.card.servicesLabel')}</span>
        {visibleServices.length > 0 ? (
          <>
            {visibleServices.map((s) => (
              <span key={s.medicalServiceId} className="chip chip--soft">{s.name}</span>
            ))}
            {extraServiceCount > 0 && <span className="chip chip--soft">{t('doctors.card.moreServicesCount', { count: extraServiceCount })}</span>}
          </>
        ) : (
          <span className="muted" style={{ fontSize: 12 }}>{t('doctors.card.noServiceAssigned')}</span>
        )}
      </div>

      <div className="doctor-admin-card__bottom">
        <span className="branch-card__id">{t('doctors.card.idLabel', { id: doctor.id })}</span>
        <button type="button" className="admin-card__manage" onClick={() => onAction('schedule')}>
          {t('doctors.card.manageScheduleCta')} <ArrowRight size={14} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  )
}

function MultiSelectPills<T extends { id: string; name: string }>({
  options,
  selected,
  onToggle,
}: {
  options: T[]
  selected: string[]
  onToggle: (id: string) => void
}) {
  const { t } = useTranslation('admin')
  if (options.length === 0) {
    return <p className="muted" style={{ fontSize: 13 }}>{t('doctors.multiSelect.noOptions')}</p>
  }
  return (
    <div className="multiselect-pills">
      {options.map((o) => {
        const isOn = selected.includes(o.id)
        return (
          <button
            key={o.id}
            type="button"
            className={`multiselect-pill ${isOn ? 'is-selected' : ''}`}
            onClick={() => onToggle(o.id)}
          >
            {o.name}
          </button>
        )
      })}
    </div>
  )
}

function AddDoctorModal({
  clinicId,
  branches,
  specialties,
  services,
  onClose,
  onCreated,
}: {
  clinicId: string
  branches: ClinicBranch[]
  specialties: Specialty[]
  services: MedicalService[]
  onClose: () => void
  onCreated: (credentials: CreatedDoctorCredentials) => void
}) {
  const { t } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
  const [form, setForm] = useState<CreateDoctorRequest>(EMPTY_DOCTOR_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [emailError, setEmailError] = useState('')
  const [licenseError, setLicenseError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  function updateField<K extends keyof CreateDoctorRequest>(key: K, value: CreateDoctorRequest[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function toggleId(key: 'specialtyIds' | 'branchIds' | 'serviceIds', id: string) {
    setForm((prev) => {
      const current = prev[key] ?? []
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
      return { ...prev, [key]: next }
    })
  }

  const availableServices = useMemo(
    () => (form.specialtyIds.length === 0 ? services : services.filter((s) => form.specialtyIds.includes(s.specialtyId))),
    [services, form.specialtyIds],
  )

  async function handleSubmit() {
    setEmailError('')
    setLicenseError('')
    setFormError('')

    if (form.firstName.trim().length < 2) return setFormError(t('doctors.addModal.firstNameRequired'))
    if (form.lastName.trim().length < 2) return setFormError(t('doctors.addModal.lastNameRequired'))
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return setFormError(t('doctors.addModal.emailInvalid'))
    // Backend-i e kërkon PhoneNumber si NotEmpty — nuk është opsional.
    if (form.phoneNumber.trim().length === 0) return setFormError(t('doctors.addModal.phoneRequired'))
    if (form.licenseNumber.trim().length < 2) return setFormError(t('doctors.addModal.licenseRequired'))
    if (!form.yearsOfExperience || form.yearsOfExperience < 0) return setFormError(t('doctors.addModal.experienceRequired'))

    const passwordError = passwordPolicyError(form.initialPassword, t)
    if (passwordError) return setFormError(passwordError)

    if (form.specialtyIds.length === 0) return setFormError(t('doctors.addModal.specialtyRequired'))
    if (form.branchIds.length === 0) return setFormError(t('doctors.addModal.branchRequired'))

    setSaving(true)
    try {
      await api.createClinicDoctor(clinicId, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phoneNumber: form.phoneNumber.trim(),
        initialPassword: form.initialPassword,
        licenseNumber: form.licenseNumber.trim(),
        biography: form.biography?.trim() || undefined,
        yearsOfExperience: form.yearsOfExperience,
        specialtyIds: form.specialtyIds,
        branchIds: form.branchIds,
        serviceIds: form.serviceIds,
      })
      // Asnjë njoftim nuk i dërgohet mjekut — kredencialet i dorëzohen nga
      // admini përmes modalit që hapet tani.
      onCreated({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        password: form.initialPassword,
      })
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        // The backend has no structured conflict discriminator — it's a free-text
        // `detail` string. We sniff it only to route to the right field, and
        // always display our own canonical Albanian copy, never the raw text.
        if (/licenc/i.test(e.message)) setLicenseError(t('doctors.addModal.licenseConflict'))
        else setEmailError(t('doctors.addModal.emailConflict'))
      } else {
        setFormError(getErrorMessage(e))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={t('doctors.addModal.title')} onClose={onClose} size="lg">
      {formError && <ErrorBox message={formError} />}

      <p className="doctor-form__section-title">{t('doctors.addModal.personalSectionTitle')}</p>
      <div className="form-row">
        <div className="field">
          <label>{t('doctors.addModal.firstNameLabel')}</label>
          <input type="text" value={form.firstName} onChange={(e) => updateField('firstName', e.target.value)} />
        </div>
        <div className="field">
          <label>{t('doctors.addModal.lastNameLabel')}</label>
          <input type="text" value={form.lastName} onChange={(e) => updateField('lastName', e.target.value)} />
        </div>
      </div>
      <div className="form-row">
        <div className="field">
          <label>{t('doctors.addModal.emailLabel')}</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => { updateField('email', e.target.value); setEmailError('') }}
          />
          {emailError && <span className="field__error">{emailError}</span>}
        </div>
        <div className="field">
          <label>{t('doctors.addModal.phoneLabel')}</label>
          <input type="tel" value={form.phoneNumber} onChange={(e) => updateField('phoneNumber', e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>{t('doctors.addModal.initialPasswordLabel')}</label>
        <div className="password-generate">
          <input
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={form.initialPassword}
            onChange={(e) => updateField('initialPassword', e.target.value)}
            placeholder={t('doctors.addModal.passwordPlaceholder')}
          />
          <button
            type="button"
            className="field__toggle password-generate__toggle"
            aria-label={showPassword ? t('doctors.addModal.hidePasswordAria') : t('doctors.addModal.showPasswordAria')}
            onClick={() => setShowPassword((v) => !v)}
          >
            {showPassword ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => {
              updateField('initialPassword', generatePassword())
              // I gjeneruari shfaqet menjëherë — admini duhet ta kopjojë.
              setShowPassword(true)
            }}
          >
            <RefreshCw size={14} strokeWidth={1.5} /> {t('doctors.addModal.generateCta')}
          </button>
        </div>
        <span className="field__note">
          {t('doctors.addModal.passwordNote')}
        </span>
      </div>

      <p className="doctor-form__section-title">{t('doctors.addModal.professionalSectionTitle')}</p>
      <div className="form-row">
        <div className="field">
          <label>{t('doctors.addModal.licenseLabel')}</label>
          <input
            type="text"
            value={form.licenseNumber}
            onChange={(e) => { updateField('licenseNumber', e.target.value); setLicenseError('') }}
          />
          {licenseError && <span className="field__error">{licenseError}</span>}
        </div>
        <div className="field">
          <label>{t('doctors.addModal.experienceLabel')}</label>
          <input
            type="number"
            min={0}
            value={form.yearsOfExperience}
            onChange={(e) => updateField('yearsOfExperience', Number(e.target.value))}
          />
        </div>
      </div>
      <div className="field">
        <label>{t('doctors.addModal.biographyLabel')} <span className="muted">{t('specialties.optional')}</span></label>
        <textarea rows={3} value={form.biography ?? ''} onChange={(e) => updateField('biography', e.target.value)} />
      </div>

      <p className="doctor-form__section-title">{t('doctors.addModal.assignmentSectionTitle')}</p>
      <div className="field">
        <label>{t('doctors.addModal.specialtiesLabel')}</label>
        <MultiSelectPills options={specialties} selected={form.specialtyIds} onToggle={(id) => toggleId('specialtyIds', id)} />
      </div>
      <div className="field">
        <label>{t('doctors.addModal.branchesFieldLabel')}</label>
        <MultiSelectPills options={branches} selected={form.branchIds} onToggle={(id) => toggleId('branchIds', id)} />
      </div>
      <div className="field">
        <label>{t('doctors.addModal.servicesFieldLabel')} <span className="muted">{t('specialties.optional')}</span></label>
        <MultiSelectPills
          options={availableServices}
          selected={form.serviceIds ?? []}
          onToggle={(id) => toggleId('serviceIds', id)}
        />
      </div>

      <div className="clinic-settings__actions">
        <button type="button" className="btn btn--primary btn--sm" disabled={saving} onClick={handleSubmit}>
          {saving ? t('doctors.addModal.creatingCta') : t('doctors.addModal.createCta')}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>{tCommon('buttons.cancel')}</button>
      </div>
    </Modal>
  )
}

/** Kopjon një vlerë dhe e konfirmon vizualisht për pak sekonda. */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard bllokohet pa HTTPS/leje — vlera mbetet e dukshme për kopjim manual.
      setCopied(false)
    }
  }

  return (
    <button type="button" className="admin-icon-btn" onClick={copy} aria-label={label}>
      {copied ? <Check size={15} strokeWidth={1.75} /> : <Copy size={15} strokeWidth={1.5} />}
    </button>
  )
}

/**
 * MODEL I PËRKOHSHËM. Backend-i nuk dërgon asnjë email kur krijohet një llogari
 * mjeku — CreateDoctorRequest kërkon InitialPassword dhe kaq. Prandaj kredencialet
 * i dorëzon admini me dorë, dhe ky modal ekziston që ai t'i kopjojë para se të
 * zhduken.
 *
 * Kur të ndërtohet rrjedha e ftesës (invitation token → set-password → email),
 * kjo hiqet: fusha e fjalëkalimit del nga forma, ky modal bëhet një toast i
 * thjeshtë, dhe premtimi për email bëhet i vërtetë.
 */
function DoctorCredentialsModal({
  credentials,
  onClose,
}: {
  credentials: CreatedDoctorCredentials
  onClose: () => void
}) {
  const { t } = useTranslation('admin')
  return (
    <Modal title={t('doctors.credentialsModal.title')} onClose={onClose}>
      <p className="profile-security__text">
        <Trans
          i18nKey="doctors.credentialsModal.bodyText"
          ns="admin"
          values={{ firstName: credentials.firstName, lastName: credentials.lastName }}
          components={[<strong key="0" />]}
        />
      </p>

      <div className="credentials-block">
        <div className="credentials-block__row">
          <span className="credentials-block__label">{t('doctors.credentialsModal.emailFieldLabel')}</span>
          <span className="credentials-block__value">{credentials.email}</span>
          <CopyButton value={credentials.email} label={t('doctors.credentialsModal.copyEmailAria')} />
        </div>
        <div className="credentials-block__row">
          <span className="credentials-block__label">{t('doctors.credentialsModal.passwordFieldLabel')}</span>
          <span className="credentials-block__value">{credentials.password}</span>
          <CopyButton value={credentials.password} label={t('doctors.credentialsModal.copyPasswordAria')} />
        </div>
      </div>

      <div className="credentials-warning">
        <AlertTriangle size={15} strokeWidth={1.5} />
        <span>{t('doctors.credentialsModal.warning')}</span>
      </div>

      <div className="clinic-settings__actions" style={{ marginTop: 16 }}>
        <button type="button" className="btn btn--primary btn--sm" onClick={onClose}>
          {t('doctors.credentialsModal.gotItCta')}
        </button>
      </div>
    </Modal>
  )
}

const EMPTY_SCHEDULE_FORM = {
  clinicBranchId: '',
  dayOfWeek: '1',
  startTime: '09:00',
  endTime: '17:00',
  slotDurationMinutes: 30,
  validFrom: '',
  validUntil: '',
}

function DoctorScheduleModal({
  doctor,
  detail,
  onClose,
}: {
  doctor: Doctor
  detail?: DoctorDetails
  onClose: () => void
}) {
  const { t } = useTranslation('admin')
  const { notify } = useToast()
  const [form, setForm] = useState(EMPTY_SCHEDULE_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [openSelect, setOpenSelect] = useState<'branch' | 'day' | null>(null)

  const doctorBranches = detail?.branches ?? []
  const branchOptions: CustomSelectOption[] = [
    { value: '', label: t('doctors.scheduleModal.selectBranchPlaceholder'), disabled: true },
    ...doctorBranches.map((b) => ({ value: b.branchId, label: b.branchName })),
  ]
  const dayOptions: CustomSelectOption[] = DAY_ORDER.map((d) => ({ value: String(d), label: weekdayName(d) }))

  useEffect(() => {
    if (doctorBranches.length > 0 && !form.clinicBranchId) {
      setForm((prev) => ({ ...prev, clinicBranchId: doctorBranches[0].branchId }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctorBranches])

  function updateField<K extends keyof typeof EMPTY_SCHEDULE_FORM>(key: K, value: typeof EMPTY_SCHEDULE_FORM[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit() {
    if (!form.clinicBranchId) return setFormError(t('doctors.scheduleModal.branchRequired'))
    if (!form.startTime || !form.endTime) return setFormError(t('doctors.scheduleModal.timeRequired'))
    if (!form.slotDurationMinutes || form.slotDurationMinutes <= 0) return setFormError(t('doctors.scheduleModal.slotDurationInvalid'))

    setFormError('')
    setSaving(true)
    try {
      const payload: CreateWorkingScheduleRequest = {
        clinicBranchId: form.clinicBranchId,
        dayOfWeek: Number(form.dayOfWeek),
        startTime: form.startTime,
        endTime: form.endTime,
        slotDurationMinutes: form.slotDurationMinutes,
        validFrom: form.validFrom || undefined,
        validUntil: form.validUntil || undefined,
      }
      await api.createDoctorScheduleAsAdmin(doctor.id, payload)
      notify(t('doctors.scheduleModal.addedToast'), 'ok')
      setForm({ ...EMPTY_SCHEDULE_FORM, clinicBranchId: form.clinicBranchId })
    } catch (e) {
      setFormError(getErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={t('doctors.scheduleModal.title', { firstName: doctor.firstName, lastName: doctor.lastName })} onClose={onClose} size="lg">
      <div className="schedule-info-banner schedule-info-banner--warn">
        <AlertCircle size={16} strokeWidth={1.5} color="var(--warn)" />
        <span>
          <Trans
            i18nKey="doctors.scheduleModal.backendGapBanner"
            ns="admin"
            components={[<code key="0" />, <code key="1" />]}
          />
        </span>
      </div>

      {formError && <ErrorBox message={formError} />}

      <p className="doctor-form__section-title">{t('doctors.scheduleModal.addScheduleSectionTitle')}</p>

      <div className="field">
        <CustomSelect
          label={t('doctors.scheduleModal.branchFieldLabel')}
          options={branchOptions}
          value={form.clinicBranchId}
          onChange={(v) => updateField('clinicBranchId', v)}
          open={openSelect === 'branch'}
          onOpenChange={(isOpen) => setOpenSelect(isOpen ? 'branch' : null)}
        />
        {doctorBranches.length === 0 && (
          <span className="field__note">{t('doctors.scheduleModal.noBranchNote')}</span>
        )}
      </div>

      <div className="field">
        <CustomSelect
          label={t('doctors.scheduleModal.dayFieldLabel')}
          options={dayOptions}
          value={form.dayOfWeek}
          onChange={(v) => updateField('dayOfWeek', v)}
          open={openSelect === 'day'}
          onOpenChange={(isOpen) => setOpenSelect(isOpen ? 'day' : null)}
        />
      </div>

      <div className="form-row">
        <div className="field">
          <label>{t('doctors.scheduleModal.startTimeLabel')}</label>
          <input type="time" value={form.startTime} onChange={(e) => updateField('startTime', e.target.value)} />
        </div>
        <div className="field">
          <label>{t('doctors.scheduleModal.endTimeLabel')}</label>
          <input type="time" value={form.endTime} onChange={(e) => updateField('endTime', e.target.value)} />
        </div>
      </div>

      <div className="field">
        <label>{t('doctors.scheduleModal.slotDurationLabel')}</label>
        <input
          type="number"
          min={5}
          max={240}
          value={form.slotDurationMinutes}
          onChange={(e) => updateField('slotDurationMinutes', Number(e.target.value))}
        />
      </div>

      <div className="form-row">
        <div className="field">
          <label>{t('doctors.scheduleModal.validFromLabel')} <span className="muted">{t('specialties.optional')}</span></label>
          <input type="date" value={form.validFrom} onChange={(e) => updateField('validFrom', e.target.value)} />
        </div>
        <div className="field">
          <label>{t('doctors.scheduleModal.validUntilLabel')} <span className="muted">{t('specialties.optional')}</span></label>
          <input type="date" value={form.validUntil} onChange={(e) => updateField('validUntil', e.target.value)} />
        </div>
      </div>

      <button
        type="button"
        className="btn btn--primary btn--block"
        disabled={saving || doctorBranches.length === 0}
        onClick={handleSubmit}
      >
        {saving ? t('doctors.scheduleModal.savingCta') : (<><Plus size={16} strokeWidth={1.5} /> {t('doctors.scheduleModal.addScheduleCta')}</>)}
      </button>
    </Modal>
  )
}
