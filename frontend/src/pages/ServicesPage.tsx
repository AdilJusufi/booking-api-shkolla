import { useCallback, useEffect, useMemo, useState } from 'react'
import { Ban, Clock, Coins, Lock, Pencil, Plus, RotateCcw, Stethoscope } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import { api, ApiError } from '../lib/api'
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
  const [editTarget, setEditTarget] = useState<MedicalService | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<MedicalService | null>(null)
  const [deactivateBlocked, setDeactivateBlocked] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    // Managing services is locked until the clinic is approved — the pending
    // branch below explains why the page is empty.
    if (!clinic.isApproved) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    // The admin list includes deactivated services and is never served from
    // the service-worker cache, so an add/edit shows up immediately (WR-17).
    Promise.all([api.getAdminClinicServices(clinic.id), api.getSpecialties()])
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

  const filtered = useMemo(
    () =>
      services.filter((s) => {
        const active = s.isActive !== false
        if (specialtyFilter !== 'all' && s.specialtyId !== specialtyFilter) return false
        if (statusFilter === 'active' && !active) return false
        if (statusFilter === 'inactive' && active) return false
        return true
      }),
    [services, specialtyFilter, statusFilter],
  )

  function openAddModal() {
    setEditTarget(null)
    setModalOpen(true)
  }

  function openEditModal(service: MedicalService) {
    setEditTarget(service)
    setModalOpen(true)
  }

  function askDeactivate(service: MedicalService) {
    setDeactivateBlocked(null)
    setDeactivateTarget(service)
  }

  // Services are never deleted — deactivated, so past appointments keep them.
  async function confirmDeactivate() {
    if (!deactivateTarget) return
    setBusy(true)
    try {
      await api.setClinicServiceActive(clinic.id, deactivateTarget.id, false)
      notify(t('services.deactivatedToast'), 'ok')
      setDeactivateTarget(null)
      load()
    } catch (e) {
      const count = (e instanceof ApiError && e.status === 409
        ? (e.data as { futureAppointmentCount?: number } | null)?.futureAppointmentCount
        : undefined)
      if (count != null) setDeactivateBlocked(count)
      else notify(getErrorMessage(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function reactivate(service: MedicalService) {
    try {
      await api.setClinicServiceActive(clinic.id, service.id, true)
      notify(t('services.activatedToast'), 'ok')
      load()
    } catch (e) {
      notify(getErrorMessage(e), 'error')
    }
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
              onEdit={() => openEditModal(s)}
              onDeactivate={() => askDeactivate(s)}
              onReactivate={() => reactivate(s)}
            />
          ))}
        </div>
      )}

      {modalOpen && (
        <ServiceFormModal
          clinicId={clinic.id}
          specialties={specialties}
          service={editTarget}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false)
            load()
          }}
        />
      )}

      {deactivateTarget && (
        <Modal title={t('services.deactivateModal.title')} onClose={() => setDeactivateTarget(null)}>
          {deactivateBlocked != null ? (
            <ErrorBox message={t('services.deactivateModal.blocked', { count: deactivateBlocked })} />
          ) : (
            <p className="schedule-delete__text">
              <Trans
                i18nKey="services.deactivateModal.confirmText"
                ns="admin"
                values={{ name: deactivateTarget.name }}
                components={[<strong key="0" />]}
              />
            </p>
          )}
          <div className="schedule-delete__actions">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              style={{ flex: 1 }}
              onClick={() => setDeactivateTarget(null)}
            >
              {tCommon('buttons.cancel')}
            </button>
            {deactivateBlocked == null && (
              <button type="button" className="btn btn--danger-outline btn--sm" style={{ flex: 1 }} disabled={busy} onClick={confirmDeactivate}>
                {t('services.deactivateModal.cta')}
              </button>
            )}
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
  onDeactivate,
  onReactivate,
}: {
  service: MedicalService
  onEdit: () => void
  onDeactivate: () => void
  onReactivate: () => void
}) {
  const { t } = useTranslation('admin')
  const active = service.isActive !== false
  return (
    <div className={`admin-card service-card ${active ? '' : 'is-inactive'}`}>
      <div className="service-card__top">
        <h3 className="service-card__name">{service.name}</h3>
        <span className={`admin-card__status admin-card__status--inline ${active ? 'admin-card__status--approved' : 'admin-card__status--pending'}`}>
          {active ? t('services.card.statusActive') : t('services.card.statusInactive')}
        </span>
      </div>

      <span className="service-card__specialty">{service.specialtyName}</span>

      <div className="service-card__details">
        <span><Clock size={13} strokeWidth={1.5} /> <span className="num">{service.durationMinutes}</span> {t('services.card.durationSuffix')}</span>
        <span><Coins size={13} strokeWidth={1.5} /> <span className="num">{service.price.toFixed(2)} {service.currency}</span></span>
      </div>

      {service.description && <p className="service-card__desc">{service.description}</p>}

      <div className="service-card__bottom">
        <div className="service-card__actions">
          <button type="button" className="admin-icon-btn" onClick={onEdit} aria-label={t('services.card.editAria')} title={t('services.card.editAria')}>
            <Pencil size={15} strokeWidth={1.5} />
          </button>
          {active ? (
            <button type="button" className="admin-icon-btn" onClick={onDeactivate} aria-label={t('services.card.deactivateAria')} title={t('services.card.deactivateAria')}>
              <Ban size={15} strokeWidth={1.5} />
            </button>
          ) : (
            <button type="button" className="btn btn--ghost btn--sm" onClick={onReactivate}>
              <RotateCcw size={14} strokeWidth={1.5} /> {t('services.card.activateCta')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ServiceFormModal({
  clinicId,
  specialties,
  service,
  onClose,
  onSaved,
}: {
  clinicId: string
  specialties: Specialty[]
  /** Null = add a new service; otherwise edit this one. */
  service: MedicalService | null
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
  const { notify } = useToast()
  const [form, setForm] = useState<CreateMedicalServiceRequest>(() =>
    service
      ? {
          specialtyId: service.specialtyId,
          name: service.name,
          description: service.description ?? '',
          durationMinutes: service.durationMinutes,
          price: service.price,
          currency: service.currency,
        }
      : EMPTY_FORM,
  )
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
      const payload: CreateMedicalServiceRequest = {
        specialtyId: form.specialtyId,
        name: form.name.trim(),
        description: form.description?.trim() || undefined,
        durationMinutes: form.durationMinutes,
        price: form.price,
        currency: form.currency.trim() || 'EUR',
      }
      if (service) {
        await api.updateClinicService(clinicId, service.id, payload)
        notify(t('services.formModal.updatedToast'), 'ok')
      } else {
        await api.createClinicService(clinicId, payload)
        notify(t('services.formModal.addedToast'), 'ok')
      }
      onSaved()
    } catch (e) {
      setFormError(getErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={service ? t('services.formModal.editTitle') : t('services.formModal.addTitle')} onClose={onClose}>
      {formError && <ErrorBox message={formError} />}
      {service && <p className="admin-header__sub">{t('services.formModal.editNotice')}</p>}

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
