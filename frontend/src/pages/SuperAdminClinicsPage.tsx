import { useCallback, useEffect, useMemo, useState } from 'react'
import { Building2, MoreVertical, Plus, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import type { AdminClinic, AssignClinicAdminRequest, CreateClinicRequest } from '../lib/types'
import { useToast } from '../context/ToastContext'
import { EmptyState, ErrorBox, Modal, SkeletonRows } from '../components/ui'

type StatusFilter = 'all' | 'approved' | 'pending' | 'inactive'

const EMPTY_CLINIC_FORM: CreateClinicRequest = { name: '', description: '', phoneNumber: '', email: '', website: '' }

function clinicStatus(c: AdminClinic): StatusFilter {
  if (!c.isActive) return 'inactive'
  return c.isApproved ? 'approved' : 'pending'
}

export default function SuperAdminClinicsPage() {
  const { t } = useTranslation('admin')
  const { notify } = useToast()

  const [clinics, setClinics] = useState<AdminClinic[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')

  const [createOpen, setCreateOpen] = useState(false)
  const [assignTarget, setAssignTarget] = useState<AdminClinic | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    api
      .getAdminClinics()
      .then(setClinics)
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return clinics.filter((c) => {
      if (statusFilter !== 'all' && clinicStatus(c) !== statusFilter) return false
      if (term && !c.name.toLowerCase().includes(term)) return false
      return true
    })
  }, [clinics, statusFilter, search])

  async function runAction(clinic: AdminClinic, action: 'approve' | 'activate' | 'deactivate') {
    setOpenMenuId(null)
    setActingId(clinic.id)
    try {
      if (action === 'approve') await api.approveClinic(clinic.id)
      else if (action === 'activate') await api.activateClinic(clinic.id)
      else await api.deactivateClinic(clinic.id)
      notify(t('saClinics.updatedToast'), 'ok')
      load()
    } catch (e) {
      notify(getErrorMessage(e), 'error')
    } finally {
      setActingId(null)
    }
  }

  const tabLabels: Record<StatusFilter, string> = {
    all: t('saClinics.tabAll'),
    approved: t('saClinics.tabApproved'),
    pending: t('saClinics.tabPending'),
    inactive: t('saClinics.tabInactive'),
  }

  return (
    <div className="sa-clinics-page">
      <div className="admin-header">
        <div>
          <h1>{t('saClinics.pageTitle')}</h1>
          <p className="admin-header__sub">{t('saClinics.pageSubtitle')}</p>
        </div>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => setCreateOpen(true)}>
          <Plus size={15} strokeWidth={1.5} /> {t('saClinics.createCta')}
        </button>
      </div>

      <div className="filters">
        <div className="status-tabs">
          {(['all', 'approved', 'pending', 'inactive'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              className={`status-tab ${statusFilter === s ? 'is-active' : ''}`}
              onClick={() => setStatusFilter(s)}
            >
              {tabLabels[s]}
            </button>
          ))}
        </div>
        <div className="filters__field filters__field--grow">
          <label>{t('saClinics.searchLabel')}</label>
          <div className="appts-search">
            <Search size={14} strokeWidth={1.5} color="var(--muted)" />
            <input placeholder={t('saClinics.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      {loading ? (
        <SkeletonRows count={5} label={t('saClinics.loadingLabel')} />
      ) : error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Building2} title={t('saClinics.emptyTitle')} />
      ) : (
        <div className="admin-card sa-table-card">
          <table className="sa-table">
            <thead>
              <tr>
                <th>{t('saClinics.columnClinic')}</th>
                <th>{t('saClinics.columnStatus')}</th>
                <th>{t('saClinics.columnActions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const status = clinicStatus(c)
                return (
                  <tr key={c.id}>
                    <td>
                      <div className="sa-table__primary">{c.name}</div>
                      {c.description && <div className="sa-table__secondary">{c.description}</div>}
                    </td>
                    <td>
                      <span
                        className={`admin-card__status ${
                          status === 'approved'
                            ? 'admin-card__status--approved'
                            : status === 'pending'
                              ? 'admin-card__status--pending'
                              : ''
                        }`}
                        style={status === 'inactive' ? { background: 'var(--line)', color: 'var(--muted)' } : undefined}
                      >
                        {status === 'approved' ? t('saClinics.statusApproved') : status === 'pending' ? t('saClinics.statusPending') : t('saClinics.statusInactive')}
                      </span>
                    </td>
                    <td>
                      <div className="sa-table__menu">
                        <button
                          type="button"
                          className="admin-icon-btn"
                          disabled={actingId === c.id}
                          onClick={() => setOpenMenuId((cur) => (cur === c.id ? null : c.id))}
                          aria-label={t('saClinics.actionsAria')}
                        >
                          <MoreVertical size={15} strokeWidth={1.5} />
                        </button>
                        {openMenuId === c.id && (
                          <div className="dropdown__panel sa-table__menu-panel">
                            {status === 'pending' && (
                              <button type="button" className="dropdown__option" onClick={() => runAction(c, 'approve')}>
                                {t('saClinics.approveMenuItem')}
                              </button>
                            )}
                            {status === 'approved' && (
                              <>
                                <button
                                  type="button"
                                  className="dropdown__option"
                                  onClick={() => {
                                    setOpenMenuId(null)
                                    setAssignTarget(c)
                                  }}
                                >
                                  {t('saClinics.assignAdminMenuItem')}
                                </button>
                                <button type="button" className="dropdown__option" onClick={() => runAction(c, 'deactivate')}>
                                  {t('saClinics.deactivateMenuItem')}
                                </button>
                              </>
                            )}
                            {status === 'inactive' && (
                              <button type="button" className="dropdown__option" onClick={() => runAction(c, 'activate')}>
                                {t('saClinics.activateMenuItem')}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && (
        <CreateClinicModal
          onClose={() => setCreateOpen(false)}
          onSaved={() => {
            setCreateOpen(false)
            load()
          }}
        />
      )}

      {assignTarget && (
        <AssignAdminModal
          clinic={assignTarget}
          onClose={() => setAssignTarget(null)}
          onSaved={() => {
            setAssignTarget(null)
            notify(t('saClinics.adminAssignedToast'), 'ok')
          }}
        />
      )}
    </div>
  )
}

function CreateClinicModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
  const [form, setForm] = useState<CreateClinicRequest>(EMPTY_CLINIC_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  function update<K extends keyof CreateClinicRequest>(key: K, value: CreateClinicRequest[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit() {
    if (form.name.trim().length < 2) return setFormError(t('saClinics.createModal.nameRequired'))
    setFormError('')
    setSaving(true)
    try {
      await api.createClinic({
        name: form.name.trim(),
        description: form.description?.trim() || undefined,
        phoneNumber: form.phoneNumber?.trim() || undefined,
        email: form.email?.trim() || undefined,
        website: form.website?.trim() || undefined,
      })
      onSaved()
    } catch (e) {
      setFormError(getErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={t('saClinics.createModal.title')} onClose={onClose}>
      {formError && <ErrorBox message={formError} />}
      <div className="field">
        <label>{t('saClinics.createModal.nameLabel')}</label>
        <input type="text" value={form.name} onChange={(e) => update('name', e.target.value)} />
      </div>
      <div className="field">
        <label>{t('saClinics.createModal.descriptionLabel')}</label>
        <textarea rows={3} value={form.description ?? ''} onChange={(e) => update('description', e.target.value)} />
      </div>
      <div className="form-row">
        <div className="field">
          <label>{t('saClinics.createModal.phoneLabel')}</label>
          <input type="tel" value={form.phoneNumber ?? ''} onChange={(e) => update('phoneNumber', e.target.value)} />
        </div>
        <div className="field">
          <label>{t('saClinics.createModal.emailLabel')}</label>
          <input type="email" value={form.email ?? ''} onChange={(e) => update('email', e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>{t('saClinics.createModal.websiteLabel')}</label>
        <input type="url" value={form.website ?? ''} onChange={(e) => update('website', e.target.value)} />
      </div>
      <span className="field__note">{t('saClinics.createModal.note')}</span>
      <div className="clinic-settings__actions" style={{ marginTop: 16 }}>
        <button type="button" className="btn btn--primary btn--sm" disabled={saving} onClick={handleSubmit}>
          {saving ? t('saClinics.createModal.creatingCta') : t('saClinics.createModal.createCta')}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>{tCommon('buttons.cancel')}</button>
      </div>
    </Modal>
  )
}

function AssignAdminModal({
  clinic,
  onClose,
  onSaved,
}: {
  clinic: AdminClinic
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  async function handleSubmit() {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setFormError(t('saClinics.assignAdminModal.emailInvalid'))
    setFormError('')
    setSaving(true)
    try {
      const payload: AssignClinicAdminRequest = { email: email.trim() }
      await api.assignClinicAdmin(clinic.id, payload)
      onSaved()
    } catch (e) {
      setFormError(getErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={t('saClinics.assignAdminModal.title', { clinicName: clinic.name })} onClose={onClose}>
      {formError && <ErrorBox message={formError} />}
      <div className="field">
        <label>{t('saClinics.assignAdminModal.emailLabel')}</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('saClinics.assignAdminModal.emailPlaceholder')} />
        <span className="field__note">{t('saClinics.assignAdminModal.note')}</span>
      </div>
      <div className="clinic-settings__actions" style={{ marginTop: 16 }}>
        <button type="button" className="btn btn--primary btn--sm" disabled={saving} onClick={handleSubmit}>
          {saving ? t('saClinics.assignAdminModal.assigningCta') : t('saClinics.assignAdminModal.assignCta')}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>{tCommon('buttons.cancel')}</button>
      </div>
    </Modal>
  )
}
