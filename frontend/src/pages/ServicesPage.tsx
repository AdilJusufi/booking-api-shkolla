import { useCallback, useEffect, useMemo, useState } from 'react'
import { Clock, Coins, Pencil, Plus, Stethoscope, Trash2 } from 'lucide-react'
import { api, ApiError } from '../lib/api'
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
    setLoading(true)
    setError('')
    Promise.all([api.getClinicServices(clinic.id), api.getSpecialties()])
      .then(([serviceList, specialtyList]) => {
        setServices(serviceList)
        setSpecialties(specialtyList)
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Ndodhi një gabim.'))
      .finally(() => setLoading(false))
  }, [clinic.id])

  useEffect(load, [load])

  const specialtyOptions: CustomSelectOption[] = useMemo(
    () => [
      { value: 'all', label: 'Të gjitha specializimet' },
      ...specialties.map((s) => ({ value: s.id, label: s.name })),
    ],
    [specialties],
  )

  const statusOptions: CustomSelectOption[] = [
    { value: 'all', label: 'Të gjitha' },
    { value: 'active', label: 'Aktive' },
    { value: 'inactive', label: 'Joaktive' },
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
    notify('Funksion në zhvillim.', 'info')
  }

  function confirmDelete() {
    notify('Funksion në zhvillim.', 'info')
    setDeleteTarget(null)
  }

  return (
    <div className="services-page">
      <div className="admin-header">
        <div>
          <h1>Shërbimet e Klinikës</h1>
          <p className="admin-header__sub">Menaxhoni shërbimet mjekësore dhe çmimet.</p>
        </div>
        <button type="button" className="btn btn--primary btn--sm" onClick={openAddModal}>
          <Plus size={15} strokeWidth={1.5} /> Shto Shërbim
        </button>
      </div>

      <div className="filters">
        <div className="filters__field">
          <CustomSelect
            label="Specializimi"
            options={specialtyOptions}
            value={specialtyFilter}
            onChange={setSpecialtyFilter}
            open={openFilter === 'specialty'}
            onOpenChange={(isOpen) => setOpenFilter(isOpen ? 'specialty' : null)}
          />
        </div>
        <div className="filters__field">
          <CustomSelect
            label="Statusi"
            options={statusOptions}
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as StatusFilter)}
            open={openFilter === 'status'}
            onOpenChange={(isOpen) => setOpenFilter(isOpen ? 'status' : null)}
          />
        </div>
      </div>

      {error && <ErrorBox message={error} />}

      {loading ? (
        <SkeletonRows count={4} label="Duke ngarkuar shërbimet" />
      ) : services.length === 0 ? (
        <EmptyState
          icon={Stethoscope}
          title="Kjo klinikë nuk ka asnjë shërbim të shtuar ende."
          action={
            <button type="button" className="btn btn--primary btn--sm" onClick={openAddModal}>
              <Plus size={15} strokeWidth={1.5} /> Shto Shërbimin e Parë
            </button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Stethoscope} title="Asnjë shërbim nuk përputhet me filtrat e zgjedhur." />
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
        <Modal title="Fshi shërbimin" onClose={() => setDeleteTarget(null)}>
          <p className="schedule-delete__text">
            Jeni i sigurt që dëshironi të fshini shërbimin <strong>{deleteTarget.name}</strong>?
          </p>
          <div className="schedule-delete__actions">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              style={{ flex: 1 }}
              onClick={() => setDeleteTarget(null)}
            >
              Anulo
            </button>
            <button type="button" className="btn btn--primary btn--sm" style={{ flex: 1 }} onClick={confirmDelete}>
              Fshi
            </button>
          </div>
        </Modal>
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
  return (
    <div className="admin-card service-card">
      <div className="service-card__top">
        <h3 className="service-card__name">{service.name}</h3>
        <span className="admin-card__status admin-card__status--approved">AKTIVE</span>
      </div>

      <span className="service-card__specialty">{service.specialtyName}</span>

      <div className="service-card__details">
        <span><Clock size={13} strokeWidth={1.5} /> <span className="num">{service.durationMinutes}</span> min / termin</span>
        <span><Coins size={13} strokeWidth={1.5} /> <span className="num">{service.price.toFixed(2)} {service.currency}</span></span>
      </div>

      {service.description && <p className="service-card__desc">{service.description}</p>}

      <div className="service-card__bottom">
        <span className="branch-card__id">ID: {service.id}</span>
        <div className="service-card__actions">
          <button type="button" className="admin-icon-btn" onClick={onEdit} aria-label="Ndrysho shërbimin">
            <Pencil size={15} strokeWidth={1.5} />
          </button>
          <button type="button" className="admin-icon-btn" onClick={onDelete} aria-label="Fshi shërbimin">
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
  const { notify } = useToast()
  const [form, setForm] = useState<CreateMedicalServiceRequest>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [specialtySelectOpen, setSpecialtySelectOpen] = useState(false)

  const specialtyOptions: CustomSelectOption[] = [
    { value: '', label: 'Zgjidhni specializimin', disabled: true },
    ...specialties.map((s) => ({ value: s.id, label: s.name })),
  ]

  function updateField<K extends keyof CreateMedicalServiceRequest>(key: K, value: CreateMedicalServiceRequest[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit() {
    if (form.name.trim().length < 2) {
      setFormError('Emri i shërbimit është i detyrueshëm.')
      return
    }
    if (!form.specialtyId) {
      setFormError('Specializimi është i detyrueshëm.')
      return
    }
    if (!form.durationMinutes || form.durationMinutes <= 0) {
      setFormError('Kohëzgjatja duhet të jetë më e madhe se 0.')
      return
    }
    if (form.price == null || form.price < 0) {
      setFormError('Çmimi është i detyrueshëm.')
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
      notify('Shërbimi u shtua.', 'ok')
      onSaved()
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Gabim. Provoni përsëri.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Shto Shërbim" onClose={onClose}>
      {formError && <ErrorBox message={formError} />}

      <div className="field">
        <label>Emri i Shërbimit</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => updateField('name', e.target.value)}
          placeholder="p.sh. Kontroll kardiologjik"
        />
      </div>

      <div className="field">
        <CustomSelect
          label="Specializimi"
          options={specialtyOptions}
          value={form.specialtyId}
          onChange={(v) => updateField('specialtyId', v)}
          open={specialtySelectOpen}
          onOpenChange={setSpecialtySelectOpen}
        />
      </div>

      <div className="field">
        <label>Përshkrimi <span className="muted">(opsional)</span></label>
        <textarea
          rows={3}
          value={form.description ?? ''}
          onChange={(e) => updateField('description', e.target.value)}
        />
      </div>

      <div className="form-row">
        <div className="field">
          <label>Kohëzgjatja (minuta)</label>
          <input
            type="number"
            min={5}
            value={form.durationMinutes}
            onChange={(e) => updateField('durationMinutes', Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label>Çmimi</label>
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
        <label>Valuta</label>
        <input type="text" value={form.currency} onChange={(e) => updateField('currency', e.target.value)} />
      </div>

      <div className="clinic-settings__actions">
        <button type="button" className="btn btn--primary btn--sm" disabled={saving} onClick={handleSubmit}>
          {saving ? 'Duke ruajtur…' : 'Ruaj Shërbimin'}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>Anulo</button>
      </div>
    </Modal>
  )
}
