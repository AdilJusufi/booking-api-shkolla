import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Building2, MapPin, Navigation, Pencil, Phone, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import type { ClinicBranch, CreateBranchRequest } from '../lib/types'
import { useToast } from '../context/ToastContext'
import { useClinicContext } from '../components/ClinicDetailLayout'
import { EmptyState, ErrorBox, Modal, SkeletonRows } from '../components/ui'

const EMPTY_FORM: CreateBranchRequest = {
  name: '',
  address: '',
  city: '',
  municipality: '',
  phoneNumber: '',
  latitude: undefined,
  longitude: undefined,
}

export default function BranchesPage() {
  const { t } = useTranslation('admin')
  const { clinic } = useClinicContext()
  const { notify } = useToast()

  const [branches, setBranches] = useState<ClinicBranch[]>([])
  const [serviceCount, setServiceCount] = useState(0)
  const [doctorCount, setDoctorCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [modalOpen, setModalOpen] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    Promise.all([
      api.getClinicBranches(clinic.id),
      api.getClinic(clinic.id).catch(() => null),
      api.getClinicDoctors(clinic.id).catch(() => []),
    ])
      .then(([branchList, details, doctors]) => {
        setBranches(branchList)
        setServiceCount(details?.services.length ?? 0)
        setDoctorCount(doctors.length)
      })
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false))
  }, [clinic.id])

  useEffect(load, [load])

  function openAddModal() {
    setModalOpen(true)
  }

  // No PUT /branches endpoint exists yet — the icon stays visible so the UI is
  // ready for it, but for now it only surfaces that editing isn't wired up.
  function openEditModal() {
    notify(t('branches.featureInDevelopmentToast'), 'info')
  }

  return (
    <div className="branches-page">
      <div className="admin-header">
        <div>
          <h1>{t('branches.pageTitle')}</h1>
          <p className="admin-header__sub">{t('branches.pageSubtitle')}</p>
        </div>
        <button type="button" className="btn btn--primary btn--sm" onClick={openAddModal}>
          <Plus size={15} strokeWidth={1.5} /> {t('branches.addCta')}
        </button>
      </div>

      {loading ? (
        <SkeletonRows count={3} label={t('branches.loadingLabel')} />
      ) : error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : branches.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={t('branches.emptyTitle')}
          action={
            <button type="button" className="btn btn--primary btn--sm" onClick={openAddModal}>
              <Plus size={15} strokeWidth={1.5} /> {t('branches.addFirstCta')}
            </button>
          }
        />
      ) : (
        <div className="branch-grid">
          {branches.map((b) => (
            <BranchCard
              key={b.id}
              branch={b}
              clinicId={clinic.id}
              doctorCount={doctorCount}
              serviceCount={serviceCount}
              onEdit={openEditModal}
            />
          ))}
        </div>
      )}

      {modalOpen && (
        <BranchFormModal
          clinicId={clinic.id}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false)
            load()
          }}
        />
      )}
    </div>
  )
}

function BranchCard({
  branch,
  clinicId,
  doctorCount,
  serviceCount,
  onEdit,
}: {
  branch: ClinicBranch
  clinicId: string
  doctorCount: number
  serviceCount: number
  onEdit: () => void
}) {
  const { t } = useTranslation('admin')
  return (
    <div className="admin-card branch-card">
      <div className="branch-card__top">
        <div className="branch-card__name-row">
          <h3 className="branch-card__name">{branch.name}</h3>
          <span className="admin-card__status admin-card__status--approved">{t('branches.card.statusActive')}</span>
        </div>
        <button type="button" className="admin-icon-btn" onClick={onEdit} aria-label={t('branches.card.editAria')}>
          <Pencil size={15} strokeWidth={1.5} />
        </button>
      </div>

      <div className="branch-card__meta">
        <span><MapPin size={13} strokeWidth={1.5} /> {branch.address}, {branch.city}</span>
        {branch.phoneNumber && <span><Phone size={13} strokeWidth={1.5} /> {branch.phoneNumber}</span>}
        {branch.municipality && <span><Building2 size={13} strokeWidth={1.5} /> {branch.municipality}</span>}
        {branch.latitude != null && branch.longitude != null && (
          <span><Navigation size={13} strokeWidth={1.5} /> {t('branches.card.gpsPrefix')} {branch.latitude}, {branch.longitude}</span>
        )}
      </div>

      <div className="branch-card__stats">
        <div className="admin-card__stat">
          <span className="admin-card__stat-label">{t('branches.card.statDoctors')}</span>
          <span className="admin-card__stat-value num">{doctorCount}</span>
        </div>
        <div className="admin-card__stat">
          <span className="admin-card__stat-label">{t('branches.card.statServices')}</span>
          <span className="admin-card__stat-value num">{serviceCount}</span>
        </div>
        <div className="admin-card__stat">
          <span className="admin-card__stat-label">{t('branches.card.statStatus')}</span>
          <span className="admin-card__stat-value">{t('branches.card.statStatusValue')}</span>
        </div>
      </div>

      <div className="branch-card__bottom">
        <span className="branch-card__id">{t('branches.card.idLabel', { id: branch.id })}</span>
        <Link to={`/admin-panel/klinikat/${clinicId}/mjeket`} className="admin-card__manage">
          {t('branches.card.manageDoctorsCta')} <ArrowRight size={14} strokeWidth={1.5} />
        </Link>
      </div>
    </div>
  )
}

function BranchFormModal({
  clinicId,
  onClose,
  onSaved,
}: {
  clinicId: string
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
  const { notify } = useToast()
  const [form, setForm] = useState<CreateBranchRequest>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  function updateField<K extends keyof CreateBranchRequest>(key: K, value: CreateBranchRequest[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function parseCoord(raw: string): number | undefined {
    if (raw.trim() === '') return undefined
    const n = Number(raw)
    return Number.isNaN(n) ? undefined : n
  }

  async function handleSubmit() {
    if (form.name.trim().length < 2) {
      setFormError(t('branches.formModal.nameRequired'))
      return
    }
    if (form.address.trim().length < 2) {
      setFormError(t('branches.formModal.addressRequired'))
      return
    }
    if (form.city.trim().length < 2) {
      setFormError(t('branches.formModal.cityRequired'))
      return
    }

    setFormError('')
    setSaving(true)
    try {
      await api.createClinicBranch(clinicId, {
        name: form.name.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        municipality: form.municipality?.trim() || undefined,
        phoneNumber: form.phoneNumber?.trim() || undefined,
        latitude: form.latitude,
        longitude: form.longitude,
      })
      notify(t('branches.formModal.addedToast'), 'ok')
      onSaved()
    } catch (e) {
      setFormError(getErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={t('branches.formModal.addTitle')} onClose={onClose}>
      {formError && <ErrorBox message={formError} />}

      <div className="field">
        <label>{t('branches.formModal.nameLabel')}</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => updateField('name', e.target.value)}
          placeholder={t('branches.formModal.namePlaceholder')}
        />
      </div>

      <div className="form-row">
        <div className="field">
          <label>{t('branches.formModal.addressLabel')}</label>
          <input type="text" value={form.address} onChange={(e) => updateField('address', e.target.value)} />
        </div>
        <div className="field">
          <label>{t('branches.formModal.cityLabel')}</label>
          <input type="text" value={form.city} onChange={(e) => updateField('city', e.target.value)} />
        </div>
      </div>

      <div className="form-row">
        <div className="field">
          <label>{t('branches.formModal.municipalityLabel')}</label>
          <input
            type="text"
            value={form.municipality ?? ''}
            onChange={(e) => updateField('municipality', e.target.value)}
          />
        </div>
        <div className="field">
          <label>{t('branches.formModal.phoneLabel')}</label>
          <input
            type="tel"
            value={form.phoneNumber ?? ''}
            onChange={(e) => updateField('phoneNumber', e.target.value)}
          />
        </div>
      </div>

      <div className="form-row">
        <div className="field">
          <label>{t('branches.formModal.latitudeLabel')}</label>
          <input
            type="number"
            step="any"
            value={form.latitude ?? ''}
            onChange={(e) => updateField('latitude', parseCoord(e.target.value))}
          />
        </div>
        <div className="field">
          <label>{t('branches.formModal.longitudeLabel')}</label>
          <input
            type="number"
            step="any"
            value={form.longitude ?? ''}
            onChange={(e) => updateField('longitude', parseCoord(e.target.value))}
          />
        </div>
      </div>

      <div className="clinic-settings__actions">
        <button type="button" className="btn btn--primary btn--sm" disabled={saving} onClick={handleSubmit}>
          {saving ? t('branches.formModal.savingCta') : t('branches.formModal.saveCta')}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>{tCommon('buttons.cancel')}</button>
      </div>
    </Modal>
  )
}
