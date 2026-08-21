import { useCallback, useEffect, useState } from 'react'
import { Pencil, Plus, Stethoscope, Trash2 } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import type { CreateSpecialtyRequest, Specialty, UpdateSpecialtyRequest } from '../lib/types'
import { useToast } from '../context/ToastContext'
import { EmptyState, ErrorBox, Modal, SkeletonRows } from '../components/ui'

const EMPTY_FORM = { name: '', description: '', isActive: true }

export default function SpecialtiesPage() {
  const { t } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
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
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.deleteSpecialty(deleteTarget.id)
      notify(t('specialties.deletedToast'), 'ok')
      setDeleteTarget(null)
      load()
    } catch (e) {
      notify(getErrorMessage(e), 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="sa-specialties-page">
      <div className="admin-header">
        <div>
          <h1>{t('specialties.title')}</h1>
          <p className="admin-header__sub">{t('specialties.subtitle')}</p>
        </div>
        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={() => {
            setEditing(null)
            setModalOpen(true)
          }}
        >
          <Plus size={15} strokeWidth={1.5} /> {t('specialties.addCta')}
        </button>
      </div>

      {loading ? (
        <SkeletonRows count={5} label={t('specialties.loadingLabel')} />
      ) : error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : specialties.length === 0 ? (
        <EmptyState icon={Stethoscope} title={t('specialties.emptyTitle')} />
      ) : (
        <div className="admin-card sa-table-card">
          <table className="sa-table">
            <thead>
              <tr>
                <th>{t('specialties.columnName')}</th>
                <th>{t('specialties.columnDescription')}</th>
                <th>{t('specialties.columnActions')}</th>
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
                        aria-label={t('specialties.editAria')}
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
                        aria-label={t('specialties.deleteAria')}
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
        <Modal title={t('specialties.deleteModalTitle')} onClose={() => setDeleteTarget(null)}>
          <p className="schedule-delete__text">
            <Trans
              i18nKey="specialties.deleteConfirmText"
              ns="admin"
              values={{ name: deleteTarget.name }}
              components={[<strong key="0" />]}
            />
          </p>
          <div className="schedule-delete__actions">
            <button type="button" className="btn btn--ghost btn--sm" style={{ flex: 1 }} onClick={() => setDeleteTarget(null)}>
              {tCommon('buttons.cancel')}
            </button>
            <button
              type="button"
              className="btn btn--sm"
              style={{ flex: 1, background: 'var(--danger)', color: '#fff' }}
              disabled={deleting}
              onClick={confirmDelete}
            >
              {t('specialties.deleteCta')}
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
  const { t } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
  const [form, setForm] = useState(() =>
    editing ? { name: editing.name, description: editing.description ?? '', isActive: true } : EMPTY_FORM,
  )
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const { notify } = useToast()

  async function handleSubmit() {
    if (form.name.trim().length < 2) return setFormError(t('specialties.nameRequired'))
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
        notify(t('specialties.updatedToast'), 'ok')
      } else {
        const payload: CreateSpecialtyRequest = { name: form.name.trim(), description: form.description.trim() || undefined }
        await api.createSpecialty(payload)
        notify(t('specialties.createdToast'), 'ok')
      }
      onSaved()
    } catch (e) {
      setFormError(getErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={editing ? t('specialties.editModalTitle') : t('specialties.addModalTitle')} onClose={onClose}>
      {formError && <ErrorBox message={formError} />}
      <div className="field">
        <label>{t('specialties.nameLabel')}</label>
        <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      </div>
      <div className="field">
        <label>{t('specialties.descriptionLabel')} <span className="muted">{t('specialties.optional')}</span></label>
        <textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
      </div>
      {editing && (
        <label className="field-check">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
          />
          {t('specialties.activeCheckbox')}
        </label>
      )}
      <div className="clinic-settings__actions">
        <button type="button" className="btn btn--primary btn--sm" disabled={saving} onClick={handleSubmit}>
          {saving ? t('specialties.saving') : t('specialties.saveCta')}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>{tCommon('buttons.cancel')}</button>
      </div>
    </Modal>
  )
}
