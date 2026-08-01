import { useCallback, useEffect, useMemo, useState } from 'react'
import { Building2, MoreVertical, Plus, Search } from 'lucide-react'
import { api, ApiError } from '../lib/api'
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
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Ndodhi një gabim.'))
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
      notify('Klinika u përditësua.', 'ok')
      load()
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Gabim. Provoni përsëri.', 'error')
    } finally {
      setActingId(null)
    }
  }

  return (
    <div className="sa-clinics-page">
      <div className="admin-header">
        <div>
          <h1>Menaxhimi i Klinikave</h1>
          <p className="admin-header__sub">Aprovo, çaktivizo dhe cakto administratorë për klinikat e platformës.</p>
        </div>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => setCreateOpen(true)}>
          <Plus size={15} strokeWidth={1.5} /> Krijo Klinikë
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
              {s === 'all' ? 'Të gjitha' : s === 'approved' ? 'Aprovuar' : s === 'pending' ? 'Në pritje' : 'Joaktive'}
            </button>
          ))}
        </div>
        <div className="filters__field filters__field--grow">
          <label>Kërko</label>
          <div className="appts-search">
            <Search size={14} strokeWidth={1.5} color="var(--muted)" />
            <input placeholder="Kërko klinikën..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      {error && <ErrorBox message={error} />}

      {loading ? (
        <SkeletonRows count={5} label="Duke ngarkuar klinikat" />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Building2} title="Nuk u gjet asnjë klinikë me këto filtra." />
      ) : (
        <div className="admin-card sa-table-card">
          <table className="sa-table">
            <thead>
              <tr>
                <th>Klinika</th>
                <th>Statusi</th>
                <th>Veprimet</th>
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
                        {status === 'approved' ? 'APROVUAR' : status === 'pending' ? 'NË PRITJE' : 'JOAKTIVE'}
                      </span>
                    </td>
                    <td>
                      <div className="sa-table__menu">
                        <button
                          type="button"
                          className="admin-icon-btn"
                          disabled={actingId === c.id}
                          onClick={() => setOpenMenuId((cur) => (cur === c.id ? null : c.id))}
                          aria-label="Veprimet"
                        >
                          <MoreVertical size={15} strokeWidth={1.5} />
                        </button>
                        {openMenuId === c.id && (
                          <div className="dropdown__panel sa-table__menu-panel">
                            {status === 'pending' && (
                              <button type="button" className="dropdown__option" onClick={() => runAction(c, 'approve')}>
                                Aprovo
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
                                  Cakto Admin
                                </button>
                                <button type="button" className="dropdown__option" onClick={() => runAction(c, 'deactivate')}>
                                  Çaktivizo
                                </button>
                              </>
                            )}
                            {status === 'inactive' && (
                              <button type="button" className="dropdown__option" onClick={() => runAction(c, 'activate')}>
                                Aktivizo
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
            notify('Administratori u caktua.', 'ok')
          }}
        />
      )}
    </div>
  )
}

function CreateClinicModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<CreateClinicRequest>(EMPTY_CLINIC_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  function update<K extends keyof CreateClinicRequest>(key: K, value: CreateClinicRequest[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit() {
    if (form.name.trim().length < 2) return setFormError('Emri i klinikës është i detyrueshëm.')
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
      setFormError(e instanceof ApiError ? e.message : 'Gabim. Provoni përsëri.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Krijo Klinikë të Re" onClose={onClose}>
      {formError && <ErrorBox message={formError} />}
      <div className="field">
        <label>Emri</label>
        <input type="text" value={form.name} onChange={(e) => update('name', e.target.value)} />
      </div>
      <div className="field">
        <label>Përshkrimi</label>
        <textarea rows={3} value={form.description ?? ''} onChange={(e) => update('description', e.target.value)} />
      </div>
      <div className="form-row">
        <div className="field">
          <label>Telefoni</label>
          <input type="tel" value={form.phoneNumber ?? ''} onChange={(e) => update('phoneNumber', e.target.value)} />
        </div>
        <div className="field">
          <label>Email</label>
          <input type="email" value={form.email ?? ''} onChange={(e) => update('email', e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>Website</label>
        <input type="url" value={form.website ?? ''} onChange={(e) => update('website', e.target.value)} />
      </div>
      <span className="field__note">Klinika e re fillon e paaprovuar dhe duhet aprovuar përpara se të bëhet publike.</span>
      <div className="clinic-settings__actions" style={{ marginTop: 16 }}>
        <button type="button" className="btn btn--primary btn--sm" disabled={saving} onClick={handleSubmit}>
          {saving ? 'Duke krijuar…' : 'Krijo Klinikën'}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>Anulo</button>
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
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  async function handleSubmit() {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setFormError('Shkruani një email adresë të vlefshme.')
    setFormError('')
    setSaving(true)
    try {
      const payload: AssignClinicAdminRequest = { email: email.trim() }
      await api.assignClinicAdmin(clinic.id, payload)
      onSaved()
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Gabim. Provoni përsëri.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={`Cakto Admin — ${clinic.name}`} onClose={onClose}>
      {formError && <ErrorBox message={formError} />}
      <div className="field">
        <label>Email i Përdoruesit</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@klinika.com" />
        <span className="field__note">Përdoruesi duhet të ketë tashmë një llogari ekzistuese në sistem.</span>
      </div>
      <div className="clinic-settings__actions" style={{ marginTop: 16 }}>
        <button type="button" className="btn btn--primary btn--sm" disabled={saving} onClick={handleSubmit}>
          {saving ? 'Duke caktuar…' : 'Cakto Admin'}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>Anulo</button>
      </div>
    </Modal>
  )
}
