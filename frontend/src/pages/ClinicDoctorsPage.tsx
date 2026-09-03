import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
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
  AdminDoctorDetail,
  ClinicBranch,
  CreateDoctorRequest,
  CreateWorkingScheduleRequest,
  DoctorServiceAssignment,
  DoctorWorkingSchedule,
  MedicalService,
  Specialty,
  UpdateDoctorRequest,
} from '../lib/types'
import { useToast } from '../context/ToastContext'
import { useClinicContext } from '../components/ClinicDetailLayout'
import { CustomSelect, EmptyState, ErrorBox, Modal, SkeletonRows, TimeField, WeekdayMultiSelect, initials } from '../components/ui'
import type { CustomSelectOption } from '../components/ui'
import { DAY_ORDER, monthName, weekdayName } from '../lib/format'

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

  const [doctors, setDoctors] = useState<AdminDoctorDetail[]>([])
  const [branches, setBranches] = useState<ClinicBranch[]>([])
  const [specialties, setSpecialties] = useState<Specialty[]>([])
  const [services, setServices] = useState<MedicalService[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [branchFilter, setBranchFilter] = useState('all')
  const [specialtyFilter, setSpecialtyFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [openFilter, setOpenFilter] = useState<'branch' | 'specialty' | 'status' | null>(null)

  const [addModalOpen, setAddModalOpen] = useState(false)
  const [createdDoctor, setCreatedDoctor] = useState<CreatedDoctorCredentials | null>(null)
  const [scheduleTarget, setScheduleTarget] = useState<AdminDoctorDetail | null>(null)
  const [editTarget, setEditTarget] = useState<AdminDoctorDetail | null>(null)
  const [servicesTarget, setServicesTarget] = useState<AdminDoctorDetail | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<AdminDoctorDetail | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  const load = useCallback(() => {
    // The admin doctor list (and branches/services, fetched here too for the
    // add-doctor modal) 403 for a clinic that isn't approved yet. Skip the
    // fetch and let the pending branch below explain why the page is empty,
    // rather than a confusing permission error.
    if (!clinic.isApproved) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    Promise.all([
      api.getAdminClinicDoctors(clinic.id),
      api.getClinicBranches(clinic.id),
      api.getSpecialties(),
      api.getClinicServices(clinic.id),
    ])
      .then(([doctorList, branchList, specialtyList, serviceList]) => {
        setDoctors(doctorList)
        setBranches(branchList)
        setSpecialties(specialtyList)
        setServices(serviceList)
      })
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false))
  }, [clinic.id, clinic.isApproved])

  useEffect(load, [load])

  const filtered = useMemo(
    () =>
      doctors.filter((d) => {
        if (statusFilter === 'active' && !d.isActive) return false
        if (statusFilter === 'inactive' && d.isActive) return false
        if (specialtyFilter !== 'all' && !d.specialties.some((s) => s.id === specialtyFilter)) return false
        if (branchFilter !== 'all' && !d.branches.some((b) => b.id === branchFilter)) return false
        return true
      }),
    [doctors, branchFilter, specialtyFilter, statusFilter],
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

  function handleAction(action: string, doctor: AdminDoctorDetail) {
    setOpenMenuId(null)
    if (action === 'schedule') {
      setScheduleTarget(doctor)
    } else if (action === 'edit') {
      setEditTarget(doctor)
    } else if (action === 'services') {
      setServicesTarget(doctor)
    } else if (action === 'deactivate') {
      setDeactivateTarget(doctor)
    } else if (action === 'activate') {
      api
        .activateDoctor(doctor.id)
        .then(() => {
          notify(t('doctors.card.reactivatedToast', { firstName: doctor.firstName, lastName: doctor.lastName }), 'ok')
          load()
        })
        .catch((e) => notify(getErrorMessage(e), 'error'))
    }
  }

  function replaceDoctor(updated: AdminDoctorDetail) {
    setDoctors((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
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
          onClose={() => setScheduleTarget(null)}
        />
      )}

      {editTarget && (
        <EditDoctorModal
          doctor={editTarget}
          branches={branches}
          specialties={specialties}
          onClose={() => setEditTarget(null)}
          onSaved={(updated) => {
            replaceDoctor(updated)
            setEditTarget(null)
            notify(t('doctors.editModal.savedToast'), 'ok')
          }}
        />
      )}

      {servicesTarget && (
        <DoctorServicesModal
          doctor={servicesTarget}
          clinicServices={services}
          onClose={() => setServicesTarget(null)}
          onSaved={(updated) => {
            replaceDoctor(updated)
            setServicesTarget(null)
            notify(t('doctors.servicesModal.savedToast'), 'ok')
          }}
        />
      )}

      {deactivateTarget && (
        <DeactivateDoctorModal
          doctor={deactivateTarget}
          onClose={() => setDeactivateTarget(null)}
          onDeactivated={(updated) => {
            replaceDoctor(updated)
            setDeactivateTarget(null)
            notify(t('doctors.card.deactivatedToast', { firstName: updated.firstName, lastName: updated.lastName }), 'ok')
          }}
        />
      )}
      </>
      )}
    </div>
  )
}

function ClinicDoctorCard({
  doctor,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  onAction,
}: {
  doctor: AdminDoctorDetail
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

  const visibleServices = doctor.services.slice(0, 3)
  const extraServiceCount = doctor.services.length - visibleServices.length

  return (
    <div className={`admin-card doctor-admin-card ${doctor.isActive ? '' : 'doctor-admin-card--inactive'}`}>
      <div className="doctor-admin-card__top">
        <div className="doctor-admin-card__avatar" aria-hidden>
          {initials(doctor.firstName, doctor.lastName)}
        </div>
        <div className="doctor-admin-card__identity">
          <div className="doctor-admin-card__name-row">
            <h3 className="doctor-admin-card__name">Dr. {doctor.firstName} {doctor.lastName}</h3>
            {doctor.isActive ? (
              <span className="admin-card__status admin-card__status--approved admin-card__status--inline">{t('doctors.card.statusActive')}</span>
            ) : (
              <span className="admin-card__status admin-card__status--pending admin-card__status--inline">{t('doctors.card.statusInactive')}</span>
            )}
          </div>
          <div className="doctor-admin-card__specialties">
            {doctor.specialties.map((s) => (
              <span key={s.id} className="service-card__specialty">{s.name}</span>
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
                <button type="button" className="dropdown__option" onClick={() => onAction('services')}>
                  {t('doctors.card.manageServicesMenuItem')}
                </button>
                <button type="button" className="dropdown__option" onClick={() => onAction('schedule')}>
                  {t('doctors.card.manageScheduleMenuItem')}
                </button>
                <Link to={`/mjeku/${doctor.id}`} className="dropdown__option" onClick={onCloseMenu}>
                  {t('doctors.card.viewPublicProfile')}
                </Link>
                {doctor.isActive ? (
                  <button type="button" className="dropdown__option dropdown__option--danger" onClick={() => onAction('deactivate')}>
                    {t('doctors.card.deactivateMenuItem')}
                  </button>
                ) : (
                  <button type="button" className="dropdown__option" onClick={() => onAction('activate')}>
                    {t('doctors.card.activateMenuItem')}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="doctor-admin-card__meta">
        <span><Clock size={13} strokeWidth={1.5} /> {t('doctors.card.yearsExperience', { count: doctor.yearsOfExperience })}</span>
      </div>

      <div className="doctor-admin-card__row">
        <span className="doctor-admin-card__row-label">{t('doctors.card.branchesLabel')}</span>
        {doctor.branches.length > 0 ? (
          doctor.branches.map((b) => (
            <span key={b.id} className="chip chip--soft">{b.name}</span>
          ))
        ) : (
          <span className="muted" style={{ fontSize: 12 }}>{t('doctors.card.noBranchAssigned')}</span>
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
          <button type="button" className="chip chip--actionable" onClick={() => onAction('services')}>
            <AlertTriangle size={12} strokeWidth={1.5} /> {t('doctors.card.noServiceAssignedCta')}
          </button>
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
  selectedDays: [] as number[],
  startTime: '09:00',
  endTime: '17:00',
  slotDurationMinutes: 30,
  validFrom: '',
  validUntil: '',
}

/** Per-day outcome of a range submission — see WorkingSchedulePage for why this stays in the modal rather than a toast. */
interface RangeSubmitResult {
  succeededDays: number[]
  failedDays: { day: number; message: string }[]
}

/** Same date-pill/validity formatting as the doctor's own WorkingSchedulePage — see there for rationale. */
function formatDatePill(iso?: string): string {
  if (!iso) return ''
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return iso
  return `${Number(m[3])} ${monthName(Number(m[2]) - 1, 'short')}`
}

function validityLabel(s: DoctorWorkingSchedule, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (!s.validUntil) return t('doctors.scheduleModal.noExpiry')
  if (s.validFrom) return t('doctors.scheduleModal.validRange', { from: formatDatePill(s.validFrom), to: formatDatePill(s.validUntil) })
  return t('doctors.scheduleModal.validUntilOnly', { date: formatDatePill(s.validUntil) })
}

function DoctorScheduleModal({
  doctor,
  onClose,
}: {
  doctor: AdminDoctorDetail
  onClose: () => void
}) {
  const { t } = useTranslation('admin')
  const { notify } = useToast()
  const [form, setForm] = useState(EMPTY_SCHEDULE_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [openSelect, setOpenSelect] = useState<'branch' | null>(null)
  const [rangeResult, setRangeResult] = useState<RangeSubmitResult | null>(null)

  const [schedules, setSchedules] = useState<DoctorWorkingSchedule[]>([])
  const [schedulesLoading, setSchedulesLoading] = useState(true)
  const [schedulesError, setSchedulesError] = useState('')

  const doctorBranches = doctor.branches
  const branchOptions: CustomSelectOption[] = [
    { value: '', label: t('doctors.scheduleModal.selectBranchPlaceholder'), disabled: true },
    ...doctorBranches.map((b) => ({ value: b.id, label: b.name })),
  ]

  const loadSchedules = useCallback(() => {
    setSchedulesLoading(true)
    setSchedulesError('')
    api
      .getDoctorSchedulesAsAdmin(doctor.id)
      .then(setSchedules)
      .catch((e) => setSchedulesError(getErrorMessage(e)))
      .finally(() => setSchedulesLoading(false))
  }, [doctor.id])

  useEffect(loadSchedules, [loadSchedules])

  const grouped = useMemo(() => {
    const map = new Map<number, DoctorWorkingSchedule[]>()
    for (const s of schedules) {
      const arr = map.get(s.dayOfWeek) ?? []
      arr.push(s)
      map.set(s.dayOfWeek, arr)
    }
    for (const arr of map.values()) arr.sort((a, b) => a.startTime.localeCompare(b.startTime))
    return DAY_ORDER.filter((d) => map.has(d)).map((d) => ({ day: d, items: map.get(d)! }))
  }, [schedules])

  useEffect(() => {
    if (doctorBranches.length > 0 && !form.clinicBranchId) {
      setForm((prev) => ({ ...prev, clinicBranchId: doctorBranches[0].id }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctorBranches])

  function updateField<K extends keyof typeof EMPTY_SCHEDULE_FORM>(key: K, value: typeof EMPTY_SCHEDULE_FORM[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function buildSchedulePayload(dayOfWeek: number): CreateWorkingScheduleRequest {
    return {
      clinicBranchId: form.clinicBranchId,
      dayOfWeek,
      // TimeOnly's System.Text.Json converter requires "HH:mm:ss" — TimeField's
      // value is bare "HH:mm" (see WorkingSchedulePage's identical fix).
      startTime: `${form.startTime}:00`,
      endTime: `${form.endTime}:00`,
      slotDurationMinutes: form.slotDurationMinutes,
      validFrom: form.validFrom || undefined,
      validUntil: form.validUntil || undefined,
    }
  }

  async function handleSubmit() {
    setRangeResult(null)
    if (!form.clinicBranchId) return setFormError(t('doctors.scheduleModal.branchRequired'))
    if (!form.startTime || !form.endTime) return setFormError(t('doctors.scheduleModal.timeRequired'))
    if (!form.slotDurationMinutes || form.slotDurationMinutes <= 0) return setFormError(t('doctors.scheduleModal.slotDurationInvalid'))
    if (form.selectedDays.length === 0) return setFormError(t('doctors.scheduleModal.daysRequired'))
    setFormError('')

    // N independent requests to the same existing endpoint, not a new bulk
    // endpoint — see WorkingSchedulePage's identical comment. Days can't
    // conflict with each other (the backend's overlap check is scoped per
    // dayOfWeek), so there's nothing atomicity would buy here, and partial
    // success is the explicitly desired UX.

    setSaving(true)
    const results = await Promise.allSettled(
      form.selectedDays.map((day) => api.createDoctorScheduleAsAdmin(doctor.id, buildSchedulePayload(day))),
    )
    setSaving(false)

    const succeededDays: number[] = []
    const failedDays: { day: number; message: string }[] = []
    results.forEach((r, i) => {
      const day = form.selectedDays[i]
      if (r.status === 'fulfilled') succeededDays.push(day)
      else failedDays.push({ day, message: getErrorMessage(r.reason) })
    })

    loadSchedules()

    if (failedDays.length === 0) {
      notify(t('doctors.scheduleModal.rangeAddedToast', { count: succeededDays.length }), 'ok')
      setForm({ ...EMPTY_SCHEDULE_FORM, clinicBranchId: form.clinicBranchId })
    } else {
      setRangeResult({ succeededDays, failedDays })
    }
  }

  return (
    <Modal title={t('doctors.scheduleModal.title', { firstName: doctor.firstName, lastName: doctor.lastName })} onClose={onClose} size="lg">
      <p className="doctor-form__section-title">{t('doctors.scheduleModal.existingSectionTitle')}</p>

      {schedulesLoading ? (
        <SkeletonRows count={3} label={t('doctors.scheduleModal.loadingLabel')} />
      ) : schedulesError ? (
        <ErrorBox message={schedulesError} onRetry={loadSchedules} />
      ) : grouped.length === 0 ? (
        <EmptyState icon={Calendar} title={t('doctors.scheduleModal.emptyTitle')} />
      ) : (
        grouped.map(({ day, items }) => (
          <div key={day} className="schedule-day-group">
            <div className="schedule-day-group__head">
              <h2>{weekdayName(day)}</h2>
              <span className="schedule-day-group__badge">
                {t('doctors.scheduleModal.sessionCount', { count: items.length })}
              </span>
            </div>

            {items.map((s) => (
              <div className="schedule-card" key={s.id}>
                <div className="schedule-card__time">
                  <span className="schedule-card__time-label">{t('doctors.scheduleModal.timeLabel')}</span>
                  <span className="schedule-card__time-start">{s.startTime.slice(0, 5)}</span>
                  <span className="schedule-card__time-end">{t('doctors.scheduleModal.until', { time: s.endTime.slice(0, 5) })}</span>
                </div>

                <div className="schedule-card__main">
                  <div className="schedule-card__branch">{s.branchName}</div>
                  <div className="schedule-card__meta">
                    <span><Clock size={13} strokeWidth={1.5} /> {t('doctors.scheduleModal.perAppointment', { count: s.slotDurationMinutes })}</span>
                    <span><Calendar size={13} strokeWidth={1.5} /> {validityLabel(s, t)}</span>
                  </div>
                </div>

                <span className={`schedule-card__status ${s.isActive ? 'is-active' : ''}`}>
                  {s.isActive ? t('doctors.scheduleModal.statusActive') : t('doctors.scheduleModal.statusInactive')}
                </span>
              </div>
            ))}
          </div>
        ))
      )}

      {formError && <ErrorBox message={formError} />}

      {rangeResult && (
        <div className="range-result">
          {rangeResult.succeededDays.length > 0 && (
            <p className="range-result__success">
              <Trans
                i18nKey="doctors.scheduleModal.rangePartialSuccess"
                ns="admin"
                values={{
                  count: rangeResult.succeededDays.length,
                  total: rangeResult.succeededDays.length + rangeResult.failedDays.length,
                }}
                components={[<strong key="0" />]}
              />
            </p>
          )}
          <ul className="range-result__failures">
            {rangeResult.failedDays.map(({ day, message }) => (
              <li key={day}>
                <strong>{weekdayName(day)}</strong>: {message}
              </li>
            ))}
          </ul>
        </div>
      )}

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
        <label>{t('doctors.scheduleModal.daysLabel')}</label>
        <WeekdayMultiSelect
          selectedDays={form.selectedDays}
          onChange={(days) => updateField('selectedDays', days)}
          fromLabel={t('doctors.scheduleModal.rangeFromLabel')}
          toLabel={t('doctors.scheduleModal.rangeToLabel')}
          applyRangeCta={t('doctors.scheduleModal.rangeApplyCta')}
        />
      </div>

      <div className="form-row">
        <TimeField label={t('doctors.scheduleModal.startTimeLabel')} value={form.startTime} onChange={(v) => updateField('startTime', v)} />
        <TimeField label={t('doctors.scheduleModal.endTimeLabel')} value={form.endTime} onChange={(v) => updateField('endTime', v)} />
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
        {saving ? (
          t('doctors.scheduleModal.savingCta')
        ) : (
          <>
            <Plus size={16} strokeWidth={1.5} />
            {t('doctors.scheduleModal.addRangeCta')}
          </>
        )}
      </button>
    </Modal>
  )
}

/** Emri, mbiemri, telefoni (ApplicationUser) + licenca/biografia/vitet/specializimet (Doctor) + degët (DoctorClinicBranch). */
function EditDoctorModal({
  doctor,
  branches,
  specialties,
  onClose,
  onSaved,
}: {
  doctor: AdminDoctorDetail
  branches: ClinicBranch[]
  specialties: Specialty[]
  onClose: () => void
  onSaved: (updated: AdminDoctorDetail) => void
}) {
  const { t } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
  const [form, setForm] = useState(() => ({
    firstName: doctor.firstName,
    lastName: doctor.lastName,
    phoneNumber: doctor.phoneNumber ?? '',
    licenseNumber: doctor.licenseNumber,
    biography: doctor.biography ?? '',
    yearsOfExperience: doctor.yearsOfExperience,
    specialtyIds: doctor.specialties.map((s) => s.id),
    branchIds: doctor.branches.map((b) => b.id),
  }))
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [licenseError, setLicenseError] = useState('')

  function updateField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function toggleId(key: 'specialtyIds' | 'branchIds', id: string) {
    setForm((prev) => {
      const current = prev[key]
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
      return { ...prev, [key]: next }
    })
  }

  async function handleSubmit() {
    setLicenseError('')
    setFormError('')

    if (form.firstName.trim().length < 2) return setFormError(t('doctors.addModal.firstNameRequired'))
    if (form.lastName.trim().length < 2) return setFormError(t('doctors.addModal.lastNameRequired'))
    if (form.phoneNumber.trim().length === 0) return setFormError(t('doctors.addModal.phoneRequired'))
    if (form.licenseNumber.trim().length < 2) return setFormError(t('doctors.addModal.licenseRequired'))
    if (!form.yearsOfExperience || form.yearsOfExperience < 0) return setFormError(t('doctors.addModal.experienceRequired'))
    if (form.specialtyIds.length === 0) return setFormError(t('doctors.addModal.specialtyRequired'))
    if (form.branchIds.length === 0) return setFormError(t('doctors.addModal.branchRequired'))

    setSaving(true)
    try {
      const updateRequest: UpdateDoctorRequest = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phoneNumber: form.phoneNumber.trim(),
        licenseNumber: form.licenseNumber.trim(),
        biography: form.biography.trim() || undefined,
        yearsOfExperience: form.yearsOfExperience,
        specialtyIds: form.specialtyIds,
      }
      await api.updateDoctor(doctor.id, updateRequest)
      // Degët janë endpoint i veçantë në backend (DoctorClinicBranch, jo Doctor) —
      // përgjigja e fundit mbetet gjendja e plotë e konsistente për t'u shfaqur.
      const updated = await api.updateDoctorBranches(doctor.id, { branchIds: form.branchIds })
      onSaved(updated)
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setLicenseError(t('doctors.addModal.licenseConflict'))
      } else {
        setFormError(getErrorMessage(e))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={t('doctors.editModal.title', { firstName: doctor.firstName, lastName: doctor.lastName })} onClose={onClose} size="lg">
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
          <input type="email" value={doctor.email} disabled />
          <span className="field__note">{t('doctors.editModal.emailReadOnlyNote')}</span>
        </div>
        <div className="field">
          <label>{t('doctors.addModal.phoneLabel')}</label>
          <input type="tel" value={form.phoneNumber} onChange={(e) => updateField('phoneNumber', e.target.value)} />
        </div>
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
        <textarea rows={3} value={form.biography} onChange={(e) => updateField('biography', e.target.value)} />
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

      <div className="clinic-settings__actions">
        <button type="button" className="btn btn--primary btn--sm" disabled={saving} onClick={handleSubmit}>
          {saving ? t('doctors.editModal.savingCta') : t('doctors.editModal.saveCta')}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>{tCommon('buttons.cancel')}</button>
      </div>
    </Modal>
  )
}

interface DoctorServiceRow {
  serviceId: string
  name: string
  baseDuration: number
  basePrice: number
  currency: string
  enabled: boolean
  customDurationMinutes: string
  customPrice: string
}

/**
 * Modal i veçantë, jo brenda EditDoctorModal — një doktor mund të ketë shumë
 * shërbime dhe secili mund të mbajë override çmimi/kohëzgjatjeje, kështu që
 * një multi-select me pilula (si te specializimet/degët) do të ishte i
 * ngushtë për ta mbajtur këtë të dhënë.
 */
function DoctorServicesModal({
  doctor,
  clinicServices,
  onClose,
  onSaved,
}: {
  doctor: AdminDoctorDetail
  clinicServices: MedicalService[]
  onClose: () => void
  onSaved: (updated: AdminDoctorDetail) => void
}) {
  const { t } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
  const [rows, setRows] = useState<DoctorServiceRow[]>(() => {
    const assigned = new Map(doctor.services.map((s) => [s.medicalServiceId, s]))
    return clinicServices.map((service) => {
      const existing = assigned.get(service.id)
      return {
        serviceId: service.id,
        name: service.name,
        baseDuration: service.durationMinutes,
        basePrice: service.price,
        currency: service.currency,
        enabled: existing !== undefined,
        customDurationMinutes: existing?.customDurationMinutes !== undefined ? String(existing.customDurationMinutes) : '',
        customPrice: existing?.customPrice !== undefined ? String(existing.customPrice) : '',
      }
    })
  })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  function toggle(serviceId: string) {
    setRows((prev) => prev.map((r) => (r.serviceId === serviceId ? { ...r, enabled: !r.enabled } : r)))
  }

  function updateOverride(serviceId: string, field: 'customDurationMinutes' | 'customPrice', value: string) {
    setRows((prev) => prev.map((r) => (r.serviceId === serviceId ? { ...r, [field]: value } : r)))
  }

  async function handleSubmit() {
    setFormError('')
    setSaving(true)
    try {
      const services: DoctorServiceAssignment[] = rows
        .filter((r) => r.enabled)
        .map((r) => ({
          medicalServiceId: r.serviceId,
          customDurationMinutes: r.customDurationMinutes.trim() ? Number(r.customDurationMinutes) : undefined,
          customPrice: r.customPrice.trim() ? Number(r.customPrice) : undefined,
        }))
      const updated = await api.updateDoctorServices(doctor.id, { services })
      onSaved(updated)
    } catch (e) {
      setFormError(getErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const enabledCount = rows.filter((r) => r.enabled).length

  return (
    <Modal title={t('doctors.servicesModal.title', { firstName: doctor.firstName, lastName: doctor.lastName })} onClose={onClose} size="lg">
      {formError && <ErrorBox message={formError} />}

      {enabledCount === 0 && (
        <div className="schedule-info-banner schedule-info-banner--warn">
          <AlertTriangle size={16} strokeWidth={1.5} color="var(--warn)" />
          <span>{t('doctors.servicesModal.noneWarning')}</span>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="muted" style={{ fontSize: 13 }}>{t('doctors.servicesModal.noClinicServices')}</p>
      ) : (
        <div className="doctor-services-list">
          {rows.map((row) => (
            <div key={row.serviceId} className={`doctor-services-row ${row.enabled ? 'is-enabled' : ''}`}>
              <label className="doctor-services-row__toggle">
                <input type="checkbox" checked={row.enabled} onChange={() => toggle(row.serviceId)} />
                <span>{row.name}</span>
              </label>
              {row.enabled && (
                <div className="doctor-services-row__overrides">
                  <div className="field">
                    <label>{t('doctors.servicesModal.durationLabel')}</label>
                    <input
                      type="number"
                      min={5}
                      max={480}
                      placeholder={String(row.baseDuration)}
                      value={row.customDurationMinutes}
                      onChange={(e) => updateOverride(row.serviceId, 'customDurationMinutes', e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>{t('doctors.servicesModal.priceLabel', { currency: row.currency })}</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder={String(row.basePrice)}
                      value={row.customPrice}
                      onChange={(e) => updateOverride(row.serviceId, 'customPrice', e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="clinic-settings__actions" style={{ marginTop: 16 }}>
        <button type="button" className="btn btn--primary btn--sm" disabled={saving} onClick={handleSubmit}>
          {saving ? t('doctors.servicesModal.savingCta') : t('doctors.servicesModal.saveCta')}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>{tCommon('buttons.cancel')}</button>
      </div>
    </Modal>
  )
}

/**
 * Kërkesa e parë dërgohet gjithmonë pa anulim (cancelFutureAppointments: false).
 * Nëse backend-i përgjigjet 409 (termine të ardhshme aktive), mesazhi i tij
 * (numri i termineve) shfaqet dhe admini duhet ta kërkojë shprehimisht rrugën
 * "anulo dhe çaktivizo" — çaktivizimi nuk anulon kurrë në heshtje.
 */
function DeactivateDoctorModal({
  doctor,
  onClose,
  onDeactivated,
}: {
  doctor: AdminDoctorDetail
  onClose: () => void
  onDeactivated: (updated: AdminDoctorDetail) => void
}) {
  const { t } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
  const [saving, setSaving] = useState(false)
  const [conflictMessage, setConflictMessage] = useState('')
  const [formError, setFormError] = useState('')

  async function attempt(cancelFutureAppointments: boolean) {
    setFormError('')
    setSaving(true)
    try {
      const updated = await api.deactivateDoctor(doctor.id, { cancelFutureAppointments })
      onDeactivated(updated)
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setConflictMessage(e.message)
      } else {
        setFormError(getErrorMessage(e))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={t('doctors.deactivateModal.title', { firstName: doctor.firstName, lastName: doctor.lastName })} onClose={onClose}>
      {formError && <ErrorBox message={formError} />}

      {conflictMessage ? (
        <>
          <div className="credentials-warning">
            <AlertTriangle size={15} strokeWidth={1.5} />
            <span>{conflictMessage}</span>
          </div>
          <p className="schedule-delete__text">{t('doctors.deactivateModal.cancelAppointmentsPrompt')}</p>
          <div className="schedule-delete__actions">
            <button type="button" className="btn btn--ghost btn--sm" style={{ flex: 1 }} onClick={onClose} disabled={saving}>
              {tCommon('buttons.cancel')}
            </button>
            <button
              type="button"
              className="btn btn--sm"
              style={{ flex: 1, background: 'var(--danger)', color: '#fff' }}
              disabled={saving}
              onClick={() => attempt(true)}
            >
              {saving ? t('doctors.deactivateModal.deactivatingCta') : t('doctors.deactivateModal.cancelAndDeactivateCta')}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="schedule-delete__text">
            {t('doctors.deactivateModal.confirmText', { firstName: doctor.firstName, lastName: doctor.lastName })}
          </p>
          <div className="schedule-delete__actions">
            <button type="button" className="btn btn--ghost btn--sm" style={{ flex: 1 }} onClick={onClose} disabled={saving}>
              {tCommon('buttons.cancel')}
            </button>
            <button
              type="button"
              className="btn btn--sm"
              style={{ flex: 1, background: 'var(--danger)', color: '#fff' }}
              disabled={saving}
              onClick={() => attempt(false)}
            >
              {saving ? t('doctors.deactivateModal.deactivatingCta') : t('doctors.deactivateModal.deactivateCta')}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
