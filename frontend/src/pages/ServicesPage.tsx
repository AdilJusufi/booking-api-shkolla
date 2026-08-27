import { useCallback, useEffect, useMemo, useState } from 'react'
import { Clock, Coins, Lock, Pencil, Plus, Stethoscope, Trash2 } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import type { CreateMedicalServiceRequest, MedicalService, Specialty } from '../lib/types'
import { useToast } from '../context/ToastContext'
import { useClinicContext } from '../components/ClinicDetailLayout'
import { CustomSelect, EmptyState, ErrorBox, Modal, SkeletonRows } from '../components/ui'
import type { CustomSelectOption } from '../components/ui'

const EMPTY_FORM: CreateMedicalServiceRequest = {
  specialtyId: '',
  name: '',
  description: '',
  durationMinutes: 30,
  price: 0,
  currency: 'EUR',
}

type StatusFilter = 'all' | 'active' | 'inactive'

export default function ServicesPage() {
  const { t } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
  const { clinic } = useClinicContext()
  const { notify } = useToast()

  const [services, setServices] = useState<MedicalService[]>([])
  const [specialties, setSpecialties] = useState<Specialty[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [specialtyFilter, setSpecialtyFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [openFilter, setOpenFilter] = useState<'specialty' | 'status' | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<MedicalService | null>(null)

  const load = useCallback(() => {
    // GET /api/clinics/{id}/services is the public route (there's no admin
    // list endpoint) — it 404s for a clinic that isn't approved yet. Skip
    // the fetch and let the pending branch below explain why the page is
    // empty, rather than surfacing a confusing "not found" error.
    if (!clinic.isApproved) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    Promise.all([api.getClinicServices(clinic.id), api.getSpecialties()])
      .then(([serviceList, specialtyList]) => {
        setServices(serviceList)
        setSpecialties(specialtyList)
      })
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false))
  }, [clinic.id, clinic.isApproved])

  useEffect(load, [load])

  const specialtyOptions: CustomSelectOption[] = useMemo(
    () => [
      { value: 'all', label: t('services.filterAllSpecialties') },
      ...specialties.map((s) => ({ value: s.id, label: s.name })),
    ],
    [specialties, t],
  )

  const statusOptions: CustomSelectOption[] = [
    { value: 'all', label: t('services.filterAll') },
    { value: 'active', label: t('services.filterActive') },
    { value: 'inactive', label: t('services.filterInactive') },
  ]

  // The backend has no active/inactive state on services — every service
  // returned is implicitly active, so the status filter can only ever narrow
  // to "active" (everything) or "inactive" (nothing).
  const filtered = useMemo(
    () =>
      services.filter((s) => {
        if (specialtyFilter !== 'all' && s.specialtyId !== specialtyFilter) return false
        if (statusFilter === 'inactive') return false
        return true
      }),
    [services, specialtyFilter, statusFilter],
  )

  function openAddModal() {
    setModalOpen(true)
  }

  // No PUT /services endpoint exists yet — the icon stays visible so the UI
  // is ready for it, but for now it only surfaces that editing isn't wired up.
  function openEditModal() {
    notify(t('services.featureInDevelopmentToast'), 'info')
  }

  function confirmDelete() {
    notify(t('services.featureInDevelopmentToast'), 'info')
    setDeleteTarget(null)
  }

  return (
    <div className="services-page">
      <div className="admin-header">
        <div>
          <h1>{t('services.pageTitle')}</h1>
          <p className="admin-header__sub">{t('services.pageSubtitle')}</p>
        </div>
        {clinic.isApproved && (
          <button type="button" className="btn btn--primary btn--sm" onClick={openAddModal}>
            <Plus size={15} strokeWidth={1.5} /> {t('services.addCta')}
          </button>
        )}
      </div>

      {!clinic.isApproved ? (
        <EmptyState icon={Lock} title={t('services.pendingTitle')} hint={t('services.pendingHint')} />
      ) : (
      <>
      <div className="filters">
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
        <SkeletonRows count={4} label={t('services.loadingLabel')} />
      ) : error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : services.length === 0 ? (
        <EmptyState
          icon={Stethoscope}
          title={t('services.emptyTitle')}
          action={
            <button type="button" className="btn btn--primary btn--sm" onClick={openAddModal}>
              <Plus size={15} strokeWidth={1.5} /> {t('services.addFirstCta')}
            </button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Stethoscope} title={t('services.noMatchTitle')} />
      ) : (
        <div className="service-grid">
          {filtered.map((s) => (
            <ServiceCard
              key={s.id}
              service={s}
              onEdit={openEditModal}
              onDelete={() => setDeleteTarget(s)}
            />
          ))}
        </div>
      )}

      {modalOpen && (
        <ServiceFormModal
          clinicId={clinic.id}
          specialties={specialties}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false)
            load()
          }}
        />
      )}

      {deleteTarget && (
        <Modal title={t('services.deleteModal.title')} onClose={() => setDeleteTarget(null)}>
          <p className="schedule-delete__text">
            <Trans
              i18nKey="services.deleteModal.confirmText"
              ns="admin"
              values={{ name: deleteTarget.name }}
              components={[<strong key="0" />]}
            />
          </p>
          <div className="schedule-delete__actions">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              style={{ flex: 1 }}
              onClick={() => setDeleteTarget(null)}
            >
              {tCommon('buttons.cancel')}
            </button>
            <button type="button" className="btn btn--primary btn--sm" style={{ flex: 1 }} onClick={confirmDelete}>
              {t('services.deleteModal.deleteCta')}
            </button>
          </div>
        </Modal>
      )}
      </>
      )}
    </div>
  )
}

function ServiceCard({
  service,
  onEdit,
  onDelete,
}: {
  service: MedicalService
  onEdit: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation('admin')
  return (
    <div className="admin-card service-card">
      <div className="service-card__top">
        <h3 className="service-card__name">{service.name}</h3>
        <span className="admin-card__status admin-card__status--approved">{t('services.card.statusActive')}</span>
      </div>

      <span className="service-card__specialty">{service.specialtyName}</span>

      <div className="service-card__details">
        <span><Clock size={13} strokeWidth={1.5} /> <span className="num">{service.durationMinutes}</span> {t('services.card.durationSuffix')}</span>
        <span><Coins size={13} strokeWidth={1.5} /> <span className="num">{service.price.toFixed(2)} {service.currency}</span></span>
      </div>

      {service.description && <p className="service-card__desc">{service.description}</p>}

      <div className="service-card__bottom">
        <span className="branch-card__id">{t('services.card.idLabel', { id: service.id })}</span>
        <div className="service-card__actions">
          <button type="button" className="admin-icon-btn" onClick={onEdit} aria-label={t('services.card.editAria')}>
            <Pencil size={15} strokeWidth={1.5} />
          </button>
          <button type="button" className="admin-icon-btn" onClick={onDelete} aria-label={t('services.card.deleteAria')}>
            <Trash2 size={15} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  )
}

function ServiceFormModal({
  clinicId,
  specialties,
  onClose,
  onSaved,
}: {
  clinicId: string
  specialties: Specialty[]
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
  const { notify } = useToast()
  const [form, setForm] = useState<CreateMedicalServiceRequest>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [specialtySelectOpen, setSpecialtySelectOpen] = useState(false)

  const specialtyOptions: CustomSelectOption[] = [
    { value: '', label: t('services.formModal.selectSpecialtyPlaceholder'), disabled: true },
    ...specialties.map((s) => ({ value: s.id, label: s.name })),
  ]

  function updateField<K extends keyof CreateMedicalServiceRequest>(key: K, value: CreateMedicalServiceRequest[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit() {
    if (form.name.trim().length < 2) {
      setFormError(t('services.formModal.nameRequired'))
      return
    }
    if (!form.specialtyId) {
      setFormError(t('services.formModal.specialtyRequired'))
      return
    }
    if (!form.durationMinutes || form.durationMinutes <= 0) {
      setFormError(t('services.formModal.durationInvalid'))
      return
    }
    if (form.price == null || form.price < 0) {
      setFormError(t('services.formModal.priceRequired'))
      return
    }

    setFormError('')
    setSaving(true)
    try {
      await api.createClinicService(clinicId, {
        specialtyId: form.specialtyId,
        name: form.name.trim(),
        description: form.description?.trim() || undefined,
        durationMinutes: form.durationMinutes,
        price: form.price,
        currency: form.currency.trim() || 'EUR',
      })
      notify(t('services.formModal.addedToast'), 'ok')
      onSaved()
    } catch (e) {
      setFormError(getErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={t('services.formModal.addTitle')} onClose={onClose}>
      {formError && <ErrorBox message={formError} />}

      <div className="field">
        <label>{t('services.formModal.nameLabel')}</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => updateField('name', e.target.value)}
          placeholder={t('services.formModal.namePlaceholder')}
        />
      </div>

      <div className="field">
        <CustomSelect
          label={t('services.formModal.specialtyLabel')}
          options={specialtyOptions}
          value={form.specialtyId}
          onChange={(v) => updateField('specialtyId', v)}
          open={specialtySelectOpen}
          onOpenChange={setSpecialtySelectOpen}
        />
      </div>

      <div className="field">
        <label>{t('services.formModal.descriptionLabel')} <span className="muted">{t('specialties.optional')}</span></label>
        <textarea
          rows={3}
          value={form.description ?? ''}
          onChange={(e) => updateField('description', e.target.value)}
        />
      </div>

      <div className="form-row">
        <div className="field">
          <label>{t('services.formModal.durationLabel')}</label>
          <input
            type="number"
            min={5}
            value={form.durationMinutes}
            onChange={(e) => updateField('durationMinutes', Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label>{t('services.formModal.priceLabel')}</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={form.price}
            onChange={(e) => updateField('price', Number(e.target.value))}
          />
        </div>
      </div>

      <div className="field">
        <label>{t('services.formModal.currencyLabel')}</label>
        <input type="text" value={form.currency} onChange={(e) => updateField('currency', e.target.value)} />
      </div>

      <div className="clinic-settings__actions">
        <button type="button" className="btn btn--primary btn--sm" disabled={saving} onClick={handleSubmit}>
          {saving ? t('services.formModal.savingCta') : t('services.formModal.saveCta')}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>{tCommon('buttons.cancel')}</button>
      </div>
    </Modal>
  )
}
