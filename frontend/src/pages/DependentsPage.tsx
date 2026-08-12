import { useCallback, useEffect, useState } from 'react'
import { Cake, Pencil, Plus, Trash2, User, Users } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import type { CreateDependentRequest, Dependent, DependentRelationship, Gender } from '../lib/types'
import { useToast } from '../context/ToastContext'
import { CustomSelect, EmptyState, ErrorBox, Modal, SkeletonRows, initials } from '../components/ui'
import type { CustomSelectOption } from '../components/ui'

const MONTHS_SQ = ['Janar', 'Shkurt', 'Mars', 'Prill', 'Maj', 'Qershor', 'Korrik', 'Gusht', 'Shtator', 'Tetor', 'Nëntor', 'Dhjetor']

const RELATIONSHIP_LABELS: Record<DependentRelationship, string> = {
  1: 'Fëmijë',
  2: 'Bashkëshort/e',
  3: 'Prind',
  4: 'Tjetër',
}

const GENDER_LABELS: Record<Gender, string> = {
  1: 'Mashkull',
  2: 'Femër',
  3: 'Tjetër',
}

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
  return `${Number(m[3])} ${MONTHS_SQ[Number(m[2]) - 1]} ${m[1]}`
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
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Ndodhi një gabim.'))
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
      notify('Anëtari u fshi me sukses.', 'ok')
    } catch (e) {
      setRemovingId(null)
      notify(e instanceof ApiError ? e.message : 'Gabim. Provoni përsëri.', 'error')
    }
  }

  return (
    <div className="deps-page">
      <div className="deps-header">
        <div>
          <h1>Anëtarët e Familjes</h1>
          <p className="deps-header__sub">Menaxhoni anëtarët e familjes për të cilët mund të rezervoni termine.</p>
        </div>
        <button type="button" className="btn btn--primary btn--sm" onClick={openAddModal}>
          <Plus size={15} strokeWidth={1.5} /> Shto Anëtar
        </button>
      </div>

      {error && <ErrorBox message={error} onRetry={load} />}

      {loading ? (
        <SkeletonRows count={3} label="Duke ngarkuar anëtarët" />
      ) : dependents.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nuk keni shtuar asnjë anëtar të familjes ende."
          hint="Shtoni anëtarë të familjes për të rezervuar termine në emrin e tyre."
          action={
            <button type="button" className="btn btn--primary btn--sm" onClick={openAddModal}>
              <Plus size={15} strokeWidth={1.5} /> Shto Anëtarin e Parë
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
        <Modal title="Fshij Anëtarin" onClose={() => setDeleteTarget(null)}>
          <p className="schedule-delete__text">
            A jeni të sigurt që dëshironi të fshini <strong>{deleteTarget.firstName} {deleteTarget.lastName}</strong>?
            Ky veprim nuk mund të kthehet.
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
            <button
              type="button"
              className="btn btn--sm"
              style={{ flex: 1, background: 'var(--danger)', color: '#fff' }}
              disabled={removingId === deleteTarget.id}
              onClick={confirmDelete}
            >
              Fshij
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
  const age = calculateAge(dependent.dateOfBirth)
  return (
    <div className={`card deps-card ${removing ? 'is-removing' : ''}`} data-reveal>
      <div className="deps-card__top">
        <div className="deps-card__avatar" aria-hidden>{initials(dependent.firstName, dependent.lastName)}</div>
        <div className="deps-card__identity">
          <h3 className="deps-card__name">{dependent.firstName} {dependent.lastName}</h3>
          <span className="chip chip--soft">{RELATIONSHIP_LABELS[dependent.relationship]}</span>
        </div>
        <div className="deps-card__actions">
          <button type="button" className="admin-icon-btn" onClick={onEdit} aria-label="Ndrysho anëtarin">
            <Pencil size={15} strokeWidth={1.5} />
          </button>
          <button type="button" className="admin-icon-btn" onClick={onDelete} aria-label="Fshij anëtarin">
            <Trash2 size={15} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <div className="deps-card__meta">
        <span><Cake size={13} strokeWidth={1.5} /> {formatDob(dependent.dateOfBirth)} ({age} vjeç)</span>
        <span><User size={13} strokeWidth={1.5} /> {GENDER_LABELS[dependent.gender]}</span>
      </div>

      <div className="deps-card__status">
        <span className={`admin-card__status ${dependent.isActive ? 'admin-card__status--approved' : 'admin-card__status--pending'}`}>
          {dependent.isActive ? 'AKTIV' : 'JOAKTIV'}
        </span>
      </div>

      <div className="deps-card__bottom">
        {dependent.isActive ? (
          <span className="muted">Mund të rezervoni termine për këtë anëtar.</span>
        ) : (
          <span className="deps-card__inactive-note">Joaktiv — kontaktoni mbështetjen për riaktivizim.</span>
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

  const genderOptions: CustomSelectOption[] = (Object.entries(GENDER_LABELS) as [string, string][]).map(
    ([value, label]) => ({ value, label }),
  )
  const relationshipOptions: CustomSelectOption[] = (Object.entries(RELATIONSHIP_LABELS) as [string, string][]).map(
    ([value, label]) => ({ value, label }),
  )

  function updateField<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit() {
    if (form.firstName.trim().length < 2) return setFormError('Emri është i detyrueshëm.')
    if (form.lastName.trim().length < 2) return setFormError('Mbiemri është i detyrueshëm.')
    if (!form.dateOfBirth) return setFormError('Data e lindjes është e detyrueshme.')
    if (new Date(form.dateOfBirth) >= new Date()) return setFormError('Data e lindjes duhet të jetë në të kaluarën.')

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
        notify('Anëtari u përditësua.', 'ok')
      } else {
        await api.createDependent(payload)
        notify('Anëtari u shtua.', 'ok')
      }
      onSaved()
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Gabim. Provoni përsëri.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={editing ? 'Ndrysho Anëtarin' : 'Shto Anëtar'} onClose={onClose}>
      {formError && <ErrorBox message={formError} />}

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

      <div className="field">
        <label>Data e Lindjes</label>
        <input
          type="date"
          max={new Date().toISOString().slice(0, 10)}
          value={form.dateOfBirth}
          onChange={(e) => updateField('dateOfBirth', e.target.value)}
        />
      </div>

      <div className="field">
        <CustomSelect
          label="Gjinia"
          options={genderOptions}
          value={form.gender}
          onChange={(v) => updateField('gender', v)}
          open={openSelect === 'gender'}
          onOpenChange={(isOpen) => setOpenSelect(isOpen ? 'gender' : null)}
        />
      </div>

      <div className="field">
        <CustomSelect
          label="Relacioni"
          options={relationshipOptions}
          value={form.relationship}
          onChange={(v) => updateField('relationship', v)}
          open={openSelect === 'relationship'}
          onOpenChange={(isOpen) => setOpenSelect(isOpen ? 'relationship' : null)}
        />
      </div>

      <div className="clinic-settings__actions">
        <button type="button" className="btn btn--primary btn--sm" disabled={saving} onClick={handleSubmit}>
          {saving ? 'Duke ruajtur…' : 'Ruaj'}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>Anulo</button>
      </div>
    </Modal>
  )
}
