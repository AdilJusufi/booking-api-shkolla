import { useCallback, useEffect, useState } from 'react'
import { Cake, Pencil, Plus, Trash2, User, Users } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import type { CreateDependentRequest, Dependent, DependentRelationship, Gender } from '../lib/types'
import { useToast } from '../context/ToastContext'
import { CustomSelect, EmptyState, ErrorBox, Modal, SkeletonRows, initials } from '../components/ui'
import type { CustomSelectOption } from '../components/ui'
import { monthName } from '../lib/format'

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  gender: '1' as string,
  relationship: '1' as string,
}

function formatDob(iso: string): string {
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return iso
  return `${Number(m[3])} ${monthName(Number(m[2]) - 1)} ${m[1]}`
}

function calculateAge(dateOfBirth: string): number {
  const today = new Date()
  const dob = new Date(dateOfBirth)
  let age = today.getFullYear() - dob.getFullYear()
  const m = today.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--
  return age
}

export default function DependentsPage() {
  const { t } = useTranslation('patient')
  const { t: tCommon } = useTranslation('common')
  const { notify } = useToast()

  const [dependents, setDependents] = useState<Dependent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editingTarget, setEditingTarget] = useState<Dependent | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Dependent | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    api
      .getDependents()
      .then(setDependents)
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  function openAddModal() {
    setEditingTarget(null)
    setModalOpen(true)
  }

  function openEditModal(dependent: Dependent) {
    setEditingTarget(dependent)
    setModalOpen(true)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const target = deleteTarget
    setRemovingId(target.id)
    try {
      await api.deleteDependent(target.id)
      // Fade out via the same CSS the row already animates in with, then drop
      // it from state once the transition has had time to play.
      setTimeout(() => {
        setDependents((prev) => prev.filter((d) => d.id !== target.id))
        setRemovingId(null)
      }, 220)
      setDeleteTarget(null)
      notify(t('dependents.deletedToast'), 'ok')
    } catch (e) {
      setRemovingId(null)
      notify(getErrorMessage(e), 'error')
    }
  }

  return (
    <div className="deps-page">
      <div className="deps-header">
        <div>
          <h1>{t('dependents.title')}</h1>
          <p className="deps-header__sub">{t('dependents.subtitle')}</p>
        </div>
        <button type="button" className="btn btn--primary btn--sm" onClick={openAddModal}>
          <Plus size={15} strokeWidth={1.5} /> {t('dependents.addMember')}
        </button>
      </div>

      {loading ? (
        <SkeletonRows count={3} label={t('dependents.loadingLabel')} />
      ) : error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : dependents.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t('dependents.emptyTitle')}
          hint={t('dependents.emptyHint')}
          action={
            <button type="button" className="btn btn--primary btn--sm" onClick={openAddModal}>
              <Plus size={15} strokeWidth={1.5} /> {t('dependents.addFirstMember')}
            </button>
          }
        />
      ) : (
        <div className="deps-grid">
          {dependents.map((d) => (
            <DependentCard
              key={d.id}
              dependent={d}
              removing={removingId === d.id}
              onEdit={() => openEditModal(d)}
              onDelete={() => setDeleteTarget(d)}
            />
          ))}
        </div>
      )}

      {modalOpen && (
        <DependentFormModal
          editing={editingTarget}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false)
            load()
          }}
        />
      )}

      {deleteTarget && (
        <Modal title={t('dependents.deleteModalTitle')} onClose={() => setDeleteTarget(null)}>
          <p className="schedule-delete__text">
            <Trans
              i18nKey="dependents.deleteConfirmText"
              ns="patient"
              values={{ name: `${deleteTarget.firstName} ${deleteTarget.lastName}` }}
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
            <button
              type="button"
              className="btn btn--sm"
              style={{ flex: 1, background: 'var(--danger)', color: '#fff' }}
              disabled={removingId === deleteTarget.id}
              onClick={confirmDelete}
            >
              {t('dependents.deleteCta')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function DependentCard({
  dependent,
  removing,
  onEdit,
  onDelete,
}: {
  dependent: Dependent
  removing: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation('patient')
  const age = calculateAge(dependent.dateOfBirth)
  return (
    <div className={`card deps-card ${removing ? 'is-removing' : ''}`} data-reveal>
      <div className="deps-card__top">
        <div className="deps-card__avatar" aria-hidden>{initials(dependent.firstName, dependent.lastName)}</div>
        <div className="deps-card__identity">
          <h3 className="deps-card__name">{dependent.firstName} {dependent.lastName}</h3>
          <span className="chip chip--soft">{t(`dependents.relationships.${dependent.relationship}`)}</span>
        </div>
        <div className="deps-card__actions">
          <button type="button" className="admin-icon-btn" onClick={onEdit} aria-label={t('dependents.editAria')}>
            <Pencil size={15} strokeWidth={1.5} />
          </button>
          <button type="button" className="admin-icon-btn" onClick={onDelete} aria-label={t('dependents.deleteAria')}>
            <Trash2 size={15} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <div className="deps-card__meta">
        <span><Cake size={13} strokeWidth={1.5} /> {formatDob(dependent.dateOfBirth)} ({t('dependents.ageYears', { age })})</span>
        <span><User size={13} strokeWidth={1.5} /> {t(`dependents.genders.${dependent.gender}`)}</span>
      </div>

      <div className="deps-card__status">
        <span className={`admin-card__status ${dependent.isActive ? 'admin-card__status--approved' : 'admin-card__status--pending'}`}>
          {dependent.isActive ? t('dependents.statusActive') : t('dependents.statusInactive')}
        </span>
      </div>

      <div className="deps-card__bottom">
        {dependent.isActive ? (
          <span className="muted">{t('dependents.canBookNote')}</span>
        ) : (
          <span className="deps-card__inactive-note">{t('dependents.inactiveNote')}</span>
        )}
      </div>
    </div>
  )
}

function DependentFormModal({
  editing,
  onClose,
  onSaved,
}: {
  editing: Dependent | null
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation('patient')
  const { t: tCommon } = useTranslation('common')
  const { notify } = useToast()
  const [form, setForm] = useState(() =>
    editing
      ? {
          firstName: editing.firstName,
          lastName: editing.lastName,
          dateOfBirth: editing.dateOfBirth.slice(0, 10),
          gender: String(editing.gender),
          relationship: String(editing.relationship),
        }
      : EMPTY_FORM,
  )
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [openSelect, setOpenSelect] = useState<'gender' | 'relationship' | null>(null)

  const genderMap = t('dependents.genders', { returnObjects: true }) as Record<string, string>
  const relationshipMap = t('dependents.relationships', { returnObjects: true }) as Record<string, string>
  const genderOptions: CustomSelectOption[] = Object.entries(genderMap).map(([value, label]) => ({ value, label }))
  const relationshipOptions: CustomSelectOption[] = Object.entries(relationshipMap).map(([value, label]) => ({ value, label }))

  function updateField<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit() {
    if (form.firstName.trim().length < 2) return setFormError(t('dependents.validation.firstNameRequired'))
    if (form.lastName.trim().length < 2) return setFormError(t('dependents.validation.lastNameRequired'))
    if (!form.dateOfBirth) return setFormError(t('dependents.validation.dobRequired'))
    if (new Date(form.dateOfBirth) >= new Date()) return setFormError(t('dependents.validation.dobMustBePast'))

    setFormError('')
    setSaving(true)
    const payload: CreateDependentRequest = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      dateOfBirth: form.dateOfBirth,
      gender: Number(form.gender) as Gender,
      relationship: Number(form.relationship) as DependentRelationship,
    }
    try {
      if (editing) {
        await api.updateDependent(editing.id, payload)
        notify(t('dependents.updatedToast'), 'ok')
      } else {
        await api.createDependent(payload)
        notify(t('dependents.createdToast'), 'ok')
      }
      onSaved()
    } catch (e) {
      setFormError(getErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={editing ? t('dependents.editModalTitle') : t('dependents.addModalTitle')} onClose={onClose}>
      {formError && <ErrorBox message={formError} />}

      <div className="form-row">
        <div className="field">
          <label>{t('dependents.firstNameLabel')}</label>
          <input type="text" value={form.firstName} onChange={(e) => updateField('firstName', e.target.value)} />
        </div>
        <div className="field">
          <label>{t('dependents.lastNameLabel')}</label>
          <input type="text" value={form.lastName} onChange={(e) => updateField('lastName', e.target.value)} />
        </div>
      </div>

      <div className="field">
        <label>{t('dependents.dobLabel')}</label>
        <input
          type="date"
          max={new Date().toISOString().slice(0, 10)}
          value={form.dateOfBirth}
          onChange={(e) => updateField('dateOfBirth', e.target.value)}
        />
      </div>

      <div className="field">
        <CustomSelect
          label={t('dependents.genderLabel')}
          options={genderOptions}
          value={form.gender}
          onChange={(v) => updateField('gender', v)}
          open={openSelect === 'gender'}
          onOpenChange={(isOpen) => setOpenSelect(isOpen ? 'gender' : null)}
        />
      </div>

      <div className="field">
        <CustomSelect
          label={t('dependents.relationshipLabel')}
          options={relationshipOptions}
          value={form.relationship}
          onChange={(v) => updateField('relationship', v)}
          open={openSelect === 'relationship'}
          onOpenChange={(isOpen) => setOpenSelect(isOpen ? 'relationship' : null)}
        />
      </div>

      <div className="clinic-settings__actions">
        <button type="button" className="btn btn--primary btn--sm" disabled={saving} onClick={handleSubmit}>
          {saving ? t('dependents.saving') : t('dependents.saveCta')}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>{tCommon('buttons.cancel')}</button>
      </div>
    </Modal>
  )
}
