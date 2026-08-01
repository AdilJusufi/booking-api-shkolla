import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, ArrowRight, Clock, MoreVertical, Pencil, Plus, Stethoscope } from 'lucide-react'
import { api, ApiError } from '../lib/api'
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
import { EmptyState, ErrorBox, Modal, SkeletonRows, initials } from '../components/ui'

const DAYS_SQ = ['E Diel', 'E Hënë', 'E Martë', 'E Mërkurë', 'E Enjte', 'E Premte', 'E Shtunë']
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

export default function ClinicDoctorsPage() {
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

  const [addModalOpen, setAddModalOpen] = useState(false)
  const [scheduleTarget, setScheduleTarget] = useState<Doctor | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  const load = useCallback(() => {
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
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Ndodhi një gabim.'))
      .finally(() => setLoading(false))
  }, [clinic.id])

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

  function handleAction(action: string, doctor: Doctor) {
    setOpenMenuId(null)
    if (action === 'schedule') {
      setScheduleTarget(doctor)
      return
    }
    if (action === 'toggle') {
      notify('Funksion në zhvillim.', 'info')
      return
    }
    if (action === 'edit') {
      notify('Funksion në zhvillim.', 'info')
    }
  }

  return (
    <div className="doctors-page">
      <div className="admin-header">
        <div>
          <h1>Mjekët e Klinikës</h1>
          <p className="admin-header__sub">Menaxhoni mjekët, oraret dhe shërbimet e tyre.</p>
        </div>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => setAddModalOpen(true)}>
          <Plus size={15} strokeWidth={1.5} /> Shto Mjek
        </button>
      </div>

      <div className="filters">
        <div className="filters__field">
          <label>Dega</label>
          <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
            <option value="all">Të gjitha degët</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div className="filters__field">
          <label>Specializimi</label>
          <select value={specialtyFilter} onChange={(e) => setSpecialtyFilter(e.target.value)}>
            <option value="all">Të gjitha specializimet</option>
            {specialties.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div className="filters__field">
          <label>Statusi</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
            <option value="all">Të gjitha</option>
            <option value="active">Aktiv</option>
            <option value="inactive">Joaktiv</option>
          </select>
        </div>
      </div>

      {error && <ErrorBox message={error} />}

      {loading ? (
        <SkeletonRows count={4} label="Duke ngarkuar mjekët" />
      ) : doctors.length === 0 ? (
        <EmptyState
          icon={Stethoscope}
          title="Kjo klinikë nuk ka asnjë mjek të shtuar ende."
          action={
            <button type="button" className="btn btn--primary btn--sm" onClick={() => setAddModalOpen(true)}>
              <Plus size={15} strokeWidth={1.5} /> Shto Mjekun e Parë
            </button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Stethoscope} title="Asnjë mjek nuk përputhet me filtrat e zgjedhur." />
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
          onSaved={() => {
            setAddModalOpen(false)
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
            <span className="admin-card__status admin-card__status--approved">AKTIV</span>
          </div>
          <div className="doctor-admin-card__specialties">
            {doctor.specialties.map((s) => (
              <span key={s} className="service-card__specialty">{s}</span>
            ))}
          </div>
        </div>
        <div className="doctor-admin-card__actions">
          <button type="button" className="admin-icon-btn" onClick={() => onAction('edit')} aria-label="Ndrysho të dhënat">
            <Pencil size={15} strokeWidth={1.5} />
          </button>
          <div className="doctor-admin-card__menu" ref={menuRef}>
            <button type="button" className="admin-icon-btn" onClick={onToggleMenu} aria-label="Më shumë veprime">
              <MoreVertical size={15} strokeWidth={1.5} />
            </button>
            {menuOpen && (
              <div className="dropdown__panel doctor-admin-card__menu-panel">
                <button type="button" className="dropdown__option" onClick={() => onAction('edit')}>
                  Ndrysho të dhënat
                </button>
                <button type="button" className="dropdown__option" onClick={() => onAction('schedule')}>
                  Menaxho orarin
                </button>
                <Link to={`/mjeku/${doctor.id}`} className="dropdown__option" onClick={onCloseMenu}>
                  Shiko profilin publik
                </Link>
                <button type="button" className="dropdown__option" onClick={() => onAction('toggle')}>
                  Çaktivizo
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
        <span><Clock size={13} strokeWidth={1.5} /> <span className="num">{doctor.yearsOfExperience}</span> vjet përvojë</span>
      </div>

      <div className="doctor-admin-card__row">
        <span className="doctor-admin-card__row-label">DEGËT:</span>
        {detail ? (
          detail.branches.length > 0 ? (
            detail.branches.map((b) => (
              <span key={b.branchId} className="chip chip--soft">{b.branchName}</span>
            ))
          ) : (
            <span className="muted" style={{ fontSize: 12 }}>Asnjë degë e caktuar</span>
          )
        ) : (
          <span className="muted" style={{ fontSize: 12 }}>—</span>
        )}
      </div>

      <div className="doctor-admin-card__row">
        <span className="doctor-admin-card__row-label">SHËRBIMET:</span>
        {visibleServices.length > 0 ? (
          <>
            {visibleServices.map((s) => (
              <span key={s.medicalServiceId} className="chip chip--soft">{s.name}</span>
            ))}
            {extraServiceCount > 0 && <span className="chip chip--soft">+{extraServiceCount} më shumë</span>}
          </>
        ) : (
          <span className="muted" style={{ fontSize: 12 }}>Asnjë shërbim i caktuar</span>
        )}
      </div>

      <div className="doctor-admin-card__bottom">
        <span className="branch-card__id">ID: {doctor.id}</span>
        <button type="button" className="admin-card__manage" onClick={() => onAction('schedule')}>
          Menaxho Orarin <ArrowRight size={14} strokeWidth={1.5} />
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
  if (options.length === 0) {
    return <p className="muted" style={{ fontSize: 13 }}>Nuk ka opsione në dispozicion.</p>
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
  onSaved,
}: {
  clinicId: string
  branches: ClinicBranch[]
  specialties: Specialty[]
  services: MedicalService[]
  onClose: () => void
  onSaved: () => void
}) {
  const { notify } = useToast()
  const [form, setForm] = useState<CreateDoctorRequest>(EMPTY_DOCTOR_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [emailError, setEmailError] = useState('')
  const [licenseError, setLicenseError] = useState('')

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

    if (form.firstName.trim().length < 2) return setFormError('Emri është i detyrueshëm.')
    if (form.lastName.trim().length < 2) return setFormError('Mbiemri është i detyrueshëm.')
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return setFormError('Email-i nuk është i vlefshëm.')
    if (form.licenseNumber.trim().length < 2) return setFormError('Numri i licencës është i detyrueshëm.')
    if (!form.yearsOfExperience || form.yearsOfExperience < 0) return setFormError('Vitet e përvojës janë të detyrueshme.')
    if (form.initialPassword.trim().length < 8) return setFormError('Fjalëkalimi fillestar duhet të ketë të paktën 8 karaktere.')
    if (form.specialtyIds.length === 0) return setFormError('Zgjidhni të paktën një specializim.')
    if (form.branchIds.length === 0) return setFormError('Zgjidhni të paktën një degë.')

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
      notify('Mjeku u krijua me sukses.', 'ok')
      onSaved()
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        if (/licenc/i.test(e.message)) setLicenseError(e.message)
        else setEmailError(e.message || 'Ky email është i regjistruar tashmë në sistem.')
      } else {
        setFormError(e instanceof ApiError ? e.message : 'Gabim. Provoni përsëri.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Shto Mjek të Ri" onClose={onClose} size="lg">
      {formError && <ErrorBox message={formError} />}

      <p className="doctor-form__section-title">Të Dhënat Personale</p>
      <div className="form-row">
        <div className="field">
          <label>Emri</label>
          <input type="text" value={form.firstName} onChange={(e) => updateField('firstName', e.target.value)} />
        </div>
        <div className="field">
          <label>Mbiemri</label>
          <input type="text" value={form.lastName} onChange={(e) => updateField('lastName', e.target.value)} />
        </div>
      </div>
      <div className="form-row">
        <div className="field">
          <label>Email</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => { updateField('email', e.target.value); setEmailError('') }}
          />
          {emailError && <span className="field__error">{emailError}</span>}
        </div>
        <div className="field">
          <label>Telefoni <span className="muted">(opsional)</span></label>
          <input type="tel" value={form.phoneNumber} onChange={(e) => updateField('phoneNumber', e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>Fjalëkalimi Fillestar</label>
        <input
          type="text"
          value={form.initialPassword}
          onChange={(e) => updateField('initialPassword', e.target.value)}
          placeholder="Të paktën 8 karaktere"
        />
        <span className="field__note">Mjeku do ta ndryshojë këtë fjalëkalim pas kyçjes së parë.</span>
      </div>

      <p className="doctor-form__section-title">Të Dhënat Profesionale</p>
      <div className="form-row">
        <div className="field">
          <label>Numri i Licencës</label>
          <input
            type="text"
            value={form.licenseNumber}
            onChange={(e) => { updateField('licenseNumber', e.target.value); setLicenseError('') }}
          />
          {licenseError && <span className="field__error">{licenseError}</span>}
        </div>
        <div className="field">
          <label>Vitet e Përvojës</label>
          <input
            type="number"
            min={0}
            value={form.yearsOfExperience}
            onChange={(e) => updateField('yearsOfExperience', Number(e.target.value))}
          />
        </div>
      </div>
      <div className="field">
        <label>Biografia <span className="muted">(opsional)</span></label>
        <textarea rows={3} value={form.biography ?? ''} onChange={(e) => updateField('biography', e.target.value)} />
      </div>

      <p className="doctor-form__section-title">Caktimi në Klinikë</p>
      <div className="field">
        <label>Specializimet</label>
        <MultiSelectPills options={specialties} selected={form.specialtyIds} onToggle={(id) => toggleId('specialtyIds', id)} />
      </div>
      <div className="field">
        <label>Degët</label>
        <MultiSelectPills options={branches} selected={form.branchIds} onToggle={(id) => toggleId('branchIds', id)} />
      </div>
      <div className="field">
        <label>Shërbimet <span className="muted">(opsional)</span></label>
        <MultiSelectPills
          options={availableServices}
          selected={form.serviceIds ?? []}
          onToggle={(id) => toggleId('serviceIds', id)}
        />
      </div>

      <div className="clinic-settings__actions">
        <button type="button" className="btn btn--primary btn--sm" disabled={saving} onClick={handleSubmit}>
          {saving ? 'Duke krijuar…' : 'Krijo Mjekun'}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>Anulo</button>
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
  const { notify } = useToast()
  const [form, setForm] = useState(EMPTY_SCHEDULE_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const doctorBranches = detail?.branches ?? []

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
    if (!form.clinicBranchId) return setFormError('Zgjidhni degën.')
    if (!form.startTime || !form.endTime) return setFormError('Ora e fillimit dhe mbarimit janë të detyrueshme.')
    if (!form.slotDurationMinutes || form.slotDurationMinutes <= 0) return setFormError('Kohëzgjatja e sllotit duhet të jetë më e madhe se 0.')

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
      notify('Orari u shtua.', 'ok')
      setForm({ ...EMPTY_SCHEDULE_FORM, clinicBranchId: form.clinicBranchId })
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Gabim. Provoni përsëri.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={`Orari i Punës — Dr. ${doctor.firstName} ${doctor.lastName}`} onClose={onClose} size="lg">
      <div className="schedule-info-banner schedule-info-banner--warn">
        <AlertCircle size={16} strokeWidth={1.5} color="var(--warn)" />
        <span>
          Oraret ekzistuese të mjekut nuk mund të shfaqen këtu: endpoint-i i vetëm që i kthen
          (<code>GET /api/doctor/working-schedules</code>) është i kufizuar vetëm për vetë mjekun e
          kyçur dhe nuk pranon një ID mjeku si parametër. Nuk ekziston ende një endpoint administrativ
          për të listuar oraret e një mjeku tjetër — ky është një gap në backend, jo në këtë faqe.
          Formulari më poshtë funksionon (<code>POST /api/admin/doctors/&#123;id&#125;/working-schedules</code>)
          dhe mund të shtoni orare të reja pa problem.
        </span>
      </div>

      {formError && <ErrorBox message={formError} />}

      <p className="doctor-form__section-title">Shto Orar të Ri</p>

      <div className="field">
        <label>Dega</label>
        <select value={form.clinicBranchId} onChange={(e) => updateField('clinicBranchId', e.target.value)}>
          <option value="" disabled>Zgjidhni degën</option>
          {doctorBranches.map((b) => (
            <option key={b.branchId} value={b.branchId}>{b.branchName}</option>
          ))}
        </select>
        {doctorBranches.length === 0 && (
          <span className="field__note">Ky mjek nuk ka ende asnjë degë të caktuar.</span>
        )}
      </div>

      <div className="field">
        <label>Dita</label>
        <select value={form.dayOfWeek} onChange={(e) => updateField('dayOfWeek', e.target.value)}>
          {DAY_ORDER.map((d) => (
            <option key={d} value={String(d)}>{DAYS_SQ[d]}</option>
          ))}
        </select>
      </div>

      <div className="form-row">
        <div className="field">
          <label>Ora e Fillimit</label>
          <input type="time" value={form.startTime} onChange={(e) => updateField('startTime', e.target.value)} />
        </div>
        <div className="field">
          <label>Ora e Mbarimit</label>
          <input type="time" value={form.endTime} onChange={(e) => updateField('endTime', e.target.value)} />
        </div>
      </div>

      <div className="field">
        <label>Kohëzgjatja e Sllotit (minuta)</label>
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
          <label>Vlefshmëria Nga <span className="muted">(opsional)</span></label>
          <input type="date" value={form.validFrom} onChange={(e) => updateField('validFrom', e.target.value)} />
        </div>
        <div className="field">
          <label>Vlefshmëria Deri <span className="muted">(opsional)</span></label>
          <input type="date" value={form.validUntil} onChange={(e) => updateField('validUntil', e.target.value)} />
        </div>
      </div>

      <button
        type="button"
        className="btn btn--primary btn--block"
        disabled={saving || doctorBranches.length === 0}
        onClick={handleSubmit}
      >
        {saving ? 'Duke ruajtur…' : (<><Plus size={16} strokeWidth={1.5} /> Shto Orar</>)}
      </button>
    </Modal>
  )
}
