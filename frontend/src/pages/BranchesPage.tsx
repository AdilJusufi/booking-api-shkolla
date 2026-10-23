import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Ban, Building2, Lock, MapPin, Navigation, Pencil, Phone, Plus, RotateCcw } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import { api, ApiError } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import type { ClinicBranch, CreateBranchRequest } from '../lib/types'
import { useToast } from '../context/ToastContext'
import { useClinicContext } from '../components/ClinicDetailLayout'
import { CustomSelect, EmptyState, ErrorBox, Modal, SkeletonRows, type CustomSelectOption } from '../components/ui'
import { KOSOVO_CITIES } from '../lib/kosovoCities'

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
  const { t: tCommon } = useTranslation('common')
  const { clinic } = useClinicContext()
  const { notify } = useToast()

  const [branches, setBranches] = useState<ClinicBranch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ClinicBranch | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<ClinicBranch | null>(null)
  const [deactivateBlocked, setDeactivateBlocked] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    // Managing branches is locked until the clinic is approved — the pending
    // branch below explains why.
    if (!clinic.isApproved) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    // Admin list: includes deactivated branches and bypasses the service-worker
    // cache, so a new or edited branch shows up immediately (WR-17).
    api
      .getAdminClinicBranches(clinic.id)
      .then(setBranches)
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false))
  }, [clinic.id, clinic.isApproved])

  useEffect(load, [load])

  function openAddModal() {
    setEditTarget(null)
    setModalOpen(true)
  }

  function openEditModal(branch: ClinicBranch) {
    setEditTarget(branch)
    setModalOpen(true)
  }

  async function confirmDeactivate() {
    if (!deactivateTarget) return
    setBusy(true)
    try {
      await api.setClinicBranchActive(clinic.id, deactivateTarget.id, false)
      notify(t('branches.deactivatedToast'), 'ok')
      setDeactivateTarget(null)
      load()
    } catch (e) {
      const count = e instanceof ApiError && e.status === 409
        ? (e.data as { futureAppointmentCount?: number } | null)?.futureAppointmentCount
        : undefined
      if (count != null) setDeactivateBlocked(count)
      else notify(getErrorMessage(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function reactivate(branch: ClinicBranch) {
    try {
      await api.setClinicBranchActive(clinic.id, branch.id, true)
      notify(t('branches.activatedToast'), 'ok')
      load()
    } catch (e) {
      notify(getErrorMessage(e), 'error')
    }
  }

  return (
    <div className="branches-page">
      <div className="admin-header">
        <div>
          <h1>{t('branches.pageTitle')}</h1>
          <p className="admin-header__sub">{t('branches.pageSubtitle')}</p>
        </div>
        {clinic.isApproved && (
          <button type="button" className="btn btn--primary btn--sm" onClick={openAddModal}>
            <Plus size={15} strokeWidth={1.5} /> {t('branches.addCta')}
          </button>
        )}
      </div>

      {!clinic.isApproved ? (
        <EmptyState icon={Lock} title={t('branches.pendingTitle')} hint={t('branches.pendingHint')} />
      ) : loading ? (
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
              onEdit={() => openEditModal(b)}
              onDeactivate={() => {
                setDeactivateBlocked(null)
                setDeactivateTarget(b)
              }}
              onReactivate={() => reactivate(b)}
            />
          ))}
        </div>
      )}

      {modalOpen && (
        <BranchFormModal
          clinicId={clinic.id}
          branch={editTarget}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false)
            load()
          }}
        />
      )}

      {deactivateTarget && (
        <Modal title={t('branches.deactivateModal.title')} onClose={() => setDeactivateTarget(null)}>
          {deactivateBlocked != null ? (
            <ErrorBox message={t('branches.deactivateModal.blocked', { count: deactivateBlocked })} />
          ) : (
            <p className="schedule-delete__text">
              <Trans
                i18nKey="branches.deactivateModal.confirmText"
                ns="admin"
                values={{ name: deactivateTarget.name }}
                components={[<strong key="0" />]}
              />
            </p>
          )}
          <div className="schedule-delete__actions">
            <button type="button" className="btn btn--ghost btn--sm" style={{ flex: 1 }} onClick={() => setDeactivateTarget(null)}>
              {tCommon('buttons.cancel')}
            </button>
            {deactivateBlocked == null && (
              <button type="button" className="btn btn--danger-outline btn--sm" style={{ flex: 1 }} disabled={busy} onClick={confirmDeactivate}>
                {t('branches.deactivateModal.cta')}
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}

function BranchCard({
  branch,
  clinicId,
  onEdit,
  onDeactivate,
  onReactivate,
}: {
  branch: ClinicBranch
  clinicId: string
  onEdit: () => void
  onDeactivate: () => void
  onReactivate: () => void
}) {
  const { t } = useTranslation('admin')
  const active = branch.isActive !== false
  return (
    <div className={`admin-card branch-card ${active ? '' : 'is-inactive'}`}>
      <div className="branch-card__top">
        <div className="branch-card__name-row">
          <h3 className="branch-card__name">{branch.name}</h3>
          <span className={`admin-card__status ${active ? 'admin-card__status--approved' : 'admin-card__status--pending'}`}>
            {active ? t('branches.card.statusActive') : t('branches.card.statusInactive')}
          </span>
        </div>
        <button type="button" className="admin-icon-btn" onClick={onEdit} aria-label={t('branches.card.editAria')} title={t('branches.card.editAria')}>
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

      <div className="branch-card__bottom">
        {active ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={onDeactivate}>
            <Ban size={14} strokeWidth={1.5} /> {t('branches.card.deactivateCta')}
          </button>
        ) : (
          <button type="button" className="btn btn--ghost btn--sm" onClick={onReactivate}>
            <RotateCcw size={14} strokeWidth={1.5} /> {t('branches.card.activateCta')}
          </button>
        )}
        <Link to={`/admin-panel/klinikat/${clinicId}/mjeket`} className="admin-card__manage">
          {t('branches.card.manageDoctorsCta')} <ArrowRight size={14} strokeWidth={1.5} />
        </Link>
      </div>
    </div>
  )
}

function BranchFormModal({
  clinicId,
  branch,
  onClose,
  onSaved,
}: {
  clinicId: string
  /** Null = add a new branch; otherwise edit this one. */
  branch: ClinicBranch | null
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
  const { notify } = useToast()
  const [form, setForm] = useState<CreateBranchRequest>(() =>
    branch
      ? {
          name: branch.name,
          address: branch.address,
          city: branch.city,
          municipality: branch.municipality ?? '',
          phoneNumber: branch.phoneNumber ?? '',
          latitude: branch.latitude,
          longitude: branch.longitude,
        }
      : EMPTY_FORM,
  )
  const [citySelectOpen, setCitySelectOpen] = useState(false)

  // WR-28: a fixed list, stored in the same Albanian spelling the search
  // filters use. An existing branch with an off-list city keeps it as an option.
  const cityOptions: CustomSelectOption[] = [
    { value: '', label: t('branches.formModal.cityLabel'), disabled: true },
    ...KOSOVO_CITIES.map(({ key, value }) => ({ value, label: tCommon(`cities.${key}`) })),
    ...(branch && !KOSOVO_CITIES.some((c) => c.value === branch.city) ? [{ value: branch.city, label: branch.city }] : []),
  ]
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
      const payload: CreateBranchRequest = {
        name: form.name.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        municipality: form.municipality?.trim() || undefined,
        phoneNumber: form.phoneNumber?.trim() || undefined,
        latitude: form.latitude,
        longitude: form.longitude,
      }
      if (branch) {
        await api.updateClinicBranch(clinicId, branch.id, payload)
        notify(t('branches.formModal.updatedToast'), 'ok')
      } else {
        await api.createClinicBranch(clinicId, payload)
        notify(t('branches.formModal.addedToast'), 'ok')
      }
      onSaved()
    } catch (e) {
      setFormError(getErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={branch ? t('branches.formModal.editTitle') : t('branches.formModal.addTitle')} onClose={onClose}>
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
          <CustomSelect
            label={t('branches.formModal.cityLabel')}
            options={cityOptions}
            value={form.city}
            onChange={(v) => updateField('city', v)}
            open={citySelectOpen}
            onOpenChange={setCitySelectOpen}
          />
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
