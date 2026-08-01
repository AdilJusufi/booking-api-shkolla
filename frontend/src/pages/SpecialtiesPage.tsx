import { useCallback, useEffect, useState } from 'react'
import { Pencil, Plus, Stethoscope, Trash2 } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import type { CreateSpecialtyRequest, Specialty, UpdateSpecialtyRequest } from '../lib/types'
import { useToast } from '../context/ToastContext'
import { EmptyState, ErrorBox, Modal, SkeletonRows } from '../components/ui'

const EMPTY_FORM = { name: '', description: '', isActive: true }

export default function SpecialtiesPage() {
  const { notify } = useToast()

  const [specialties, setSpecialties] = useState<Specialty[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Specialty | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Specialty | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    api
      .getSpecialties()
      .then(setSpecialties)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Ndodhi një gabim.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.deleteSpecialty(deleteTarget.id)
      notify('Specializimi u fshi.', 'ok')
      setDeleteTarget(null)
      load()
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Gabim. Provoni përsëri.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="sa-specialties-page">
      <div className="admin-header">
        <div>
          <h1>Specializimet</h1>
          <p className="admin-header__sub">Menaxhoni listën e specializimeve mjekësore të platformës.</p>
        </div>
        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={() => {
            setEditing(null)
            setModalOpen(true)
          }}
        >
          <Plus size={15} strokeWidth={1.5} /> Shto Specializim
        </button>
      </div>

      {error && <ErrorBox message={error} />}

      {loading ? (
        <SkeletonRows count={5} label="Duke ngarkuar specializimet" />
      ) : specialties.length === 0 ? (
        <EmptyState icon={Stethoscope} title="Nuk ka asnjë specializim të regjistruar ende." />
      ) : (
        <div className="admin-card sa-table-card">
          <table className="sa-table">
            <thead>
              <tr>
                <th>Emri</th>
                <th>Përshkrimi</th>
                <th>Veprimet</th>
              </tr>
            </thead>
            <tbody>
              {specialties.map((s) => (
                <tr key={s.id}>
                  <td className="sa-table__primary">{s.name}</td>
                  <td>{s.description || <span className="muted">—</span>}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        className="admin-icon-btn"
                        aria-label="Ndrysho"
                        onClick={() => {
                          setEditing(s)
                          setModalOpen(true)
                        }}
                      >
                        <Pencil size={15} strokeWidth={1.5} />
                      </button>
                      <button
                        type="button"
                        className="admin-icon-btn"
                        aria-label="Fshi"
                        onClick={() => setDeleteTarget(s)}
                      >
                        <Trash2 size={15} strokeWidth={1.5} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <SpecialtyFormModal
          editing={editing}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false)
            load()
          }}
        />
      )}

      {deleteTarget && (
        <Modal title="Fshi Specializimin" onClose={() => setDeleteTarget(null)}>
          <p className="schedule-delete__text">
            A jeni të sigurt? Fshirja e specializimit <strong>{deleteTarget.name}</strong> mund të ndikojë tek mjekët
            dhe shërbimet ekzistuese.
          </p>
          <div className="schedule-delete__actions">
            <button type="button" className="btn btn--ghost btn--sm" style={{ flex: 1 }} onClick={() => setDeleteTarget(null)}>
              Anulo
            </button>
            <button
              type="button"
              className="btn btn--sm"
              style={{ flex: 1, background: 'var(--danger)', color: '#fff' }}
              disabled={deleting}
              onClick={confirmDelete}
            >
              Fshi
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function SpecialtyFormModal({
  editing,
  onClose,
  onSaved,
}: {
  editing: Specialty | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState(() =>
    editing ? { name: editing.name, description: editing.description ?? '', isActive: true } : EMPTY_FORM,
  )
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const { notify } = useToast()

  async function handleSubmit() {
    if (form.name.trim().length < 2) return setFormError('Emri është i detyrueshëm.')
    setFormError('')
    setSaving(true)
    try {
      if (editing) {
        const payload: UpdateSpecialtyRequest = {
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          isActive: form.isActive,
        }
        await api.updateSpecialty(editing.id, payload)
        notify('Specializimi u përditësua.', 'ok')
      } else {
        const payload: CreateSpecialtyRequest = { name: form.name.trim(), description: form.description.trim() || undefined }
        await api.createSpecialty(payload)
        notify('Specializimi u shtua.', 'ok')
      }
      onSaved()
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Gabim. Provoni përsëri.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={editing ? 'Ndrysho Specializimin' : 'Shto Specializim'} onClose={onClose}>
      {formError && <ErrorBox message={formError} />}
      <div className="field">
        <label>Emri</label>
        <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      </div>
      <div className="field">
        <label>Përshkrimi <span className="muted">(opsional)</span></label>
        <textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
      </div>
      {editing && (
        <label className="field-check">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
          />
          Aktiv
        </label>
      )}
      <div className="clinic-settings__actions">
        <button type="button" className="btn btn--primary btn--sm" disabled={saving} onClick={handleSubmit}>
          {saving ? 'Duke ruajtur…' : 'Ruaj'}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>Anulo</button>
      </div>
    </Modal>
  )
}
