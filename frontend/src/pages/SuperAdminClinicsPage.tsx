import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Building2, Calendar, Check, Mail, MapPin, MoreVertical, Phone, Plus, Search, User, X } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import { formatDateTime } from '../lib/format'
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

  // Pending clinics are why a SuperAdmin comes to this page — default to the
  // filter that answers "is there anything waiting for me?" immediately.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [search, setSearch] = useState('')

  const [createOpen, setCreateOpen] = useState(false)
  const [assignTarget, setAssignTarget] = useState<AdminClinic | null>(null)
  const [approveTarget, setApproveTarget] = useState<AdminClinic | null>(null)
  const [rejectTarget, setRejectTarget] = useState<AdminClinic | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
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

  const pendingCount = useMemo(() => clinics.filter((c) => clinicStatus(c) === 'pending').length, [clinics])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return clinics.filter((c) => {
      if (statusFilter !== 'all' && clinicStatus(c) !== statusFilter) return false
      if (term && !c.name.toLowerCase().includes(term)) return false
      return true
    })
  }, [clinics, statusFilter, search])

  async function runAction(clinic: AdminClinic, action: 'activate' | 'deactivate') {
    setActingId(clinic.id)
    try {
      if (action === 'activate') await api.activateClinic(clinic.id)
      else await api.deactivateClinic(clinic.id)
      notify(t('saClinics.updatedToast'), 'ok')
      load()
    } catch (e) {
      notify(getErrorMessage(e), 'error')
    } finally {
      setActingId(null)
    }
  }

  async function doApprove(clinic: AdminClinic) {
    setActingId(clinic.id)
    try {
      await api.approveClinic(clinic.id)
      notify(t('saClinics.approveModal.toast', { name: clinic.name }), 'ok')
      setApproveTarget(null)
      load()
    } catch (e) {
      notify(getErrorMessage(e), 'error')
    } finally {
      setActingId(null)
    }
  }

  // There is no dedicated "reject" endpoint in the backend — only approve /
  // activate / deactivate. Deactivating a still-pending clinic achieves the
  // real goal (it never goes live, drops out of "Në pritje") using an action
  // that genuinely exists, rather than faking one. The confirmation copy
  // below is honest about this being a deactivation.
  async function doReject(clinic: AdminClinic) {
    setActingId(clinic.id)
    try {
      await api.deactivateClinic(clinic.id)
      notify(t('saClinics.rejectModal.toast', { name: clinic.name }), 'ok')
      setRejectTarget(null)
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

  const emptyHint =
    statusFilter === 'pending' ? t('saClinics.emptyPendingHint') : search.trim() ? t('saClinics.emptyFilterHint') : undefined

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
              {s === 'pending' && pendingCount > 0 && <span className="status-tab__count">{pendingCount}</span>}
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
        <EmptyState icon={Building2} title={t('saClinics.emptyTitle')} hint={emptyHint} />
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

                if (status === 'pending') {
                  return (
                    <PendingClinicRow
                      key={c.id}
                      clinic={c}
                      acting={actingId === c.id}
                      onApprove={() => setApproveTarget(c)}
                      onReject={() => setRejectTarget(c)}
                    />
                  )
                }

                const expanded = detailId === c.id
                return (
                  <Fragment key={c.id}>
                    <tr>
                      <td>
                        <div className="sa-table__primary">{c.name}</div>
                        {c.description && <div className="sa-table__secondary">{c.description}</div>}
                      </td>
                      <td>
                        <span
                          className={`admin-card__status admin-card__status--inline ${
                            status === 'approved' ? 'admin-card__status--approved' : ''
                          }`}
                          style={status === 'inactive' ? { background: 'var(--line)', color: 'var(--muted)' } : undefined}
                        >
                          {status === 'approved' ? t('saClinics.statusApproved') : t('saClinics.statusInactive')}
                        </span>
                      </td>
                      <td>
                        <RowActionsMenu label={t('saClinics.actionsAria')} disabled={actingId === c.id}>
                          {(close) => (
                            <>
                              {status === 'approved' && (
                                <>
                                  <button
                                    type="button"
                                    className="dropdown__option"
                                    onClick={() => {
                                      close()
                                      setAssignTarget(c)
                                    }}
                                  >
                                    {t('saClinics.assignAdminMenuItem')}
                                  </button>
                                  <button
                                    type="button"
                                    className="dropdown__option"
                                    onClick={() => {
                                      close()
                                      runAction(c, 'deactivate')
                                    }}
                                  >
                                    {t('saClinics.deactivateMenuItem')}
                                  </button>
                                </>
                              )}
                              {status === 'inactive' && (
                                <button
                                  type="button"
                                  className="dropdown__option"
                                  onClick={() => {
                                    close()
                                    runAction(c, 'activate')
                                  }}
                                >
                                  {t('saClinics.activateMenuItem')}
                                </button>
                              )}
                              <button
                                type="button"
                                className="dropdown__option"
                                onClick={() => {
                                  close()
                                  setDetailId((cur) => (cur === c.id ? null : c.id))
                                }}
                              >
                                {t('saClinics.viewDetailsMenuItem')}
                              </button>
                            </>
                          )}
                        </RowActionsMenu>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="sa-table__expand-row">
                        <td colSpan={3}>
                          <ClinicDecisionInfo clinic={c} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
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

      {approveTarget && (
        <ApproveClinicModal
          clinic={approveTarget}
          acting={actingId === approveTarget.id}
          onClose={() => setApproveTarget(null)}
          onConfirm={() => doApprove(approveTarget)}
        />
      )}

      {rejectTarget && (
        <RejectClinicModal
          clinic={rejectTarget}
          acting={actingId === rejectTarget.id}
          onClose={() => setRejectTarget(null)}
          onConfirm={() => doReject(rejectTarget)}
        />
      )}
    </div>
  )
}

/**
 * Icon + text row of decision-relevant facts about a clinic — city, contact,
 * when it registered, who registered it.
 *
 * `cities`/`administrators`/`createdAt` are marked required on `AdminClinic`
 * because the current backend always sends them — but that's a compile-time
 * guarantee, not a runtime one. A stale backend build (an older deploy, a
 * Docker image that predates a DTO change) can still send a response missing
 * a field TypeScript assumes is there, and a crash here must not blank the
 * whole page — so every access is defensive rather than trusting the type.
 */
function ClinicDecisionInfo({ clinic }: { clinic: AdminClinic }) {
  const { t } = useTranslation('admin')
  const cities = clinic.cities ?? []
  const registrant = clinic.administrators?.[0]
  const registeredAt = clinic.createdAt ? formatDateTime(clinic.createdAt) : null
  return (
    <div className="clinic-header__meta">
      <span>
        <MapPin size={12} strokeWidth={1.5} />
        {cities.length > 0 ? cities.join(', ') : t('saClinics.decision.noCity')}
      </span>
      {clinic.phoneNumber && (
        <span>
          <Phone size={12} strokeWidth={1.5} /> {clinic.phoneNumber}
        </span>
      )}
      {clinic.email && (
        <span>
          <Mail size={12} strokeWidth={1.5} /> {clinic.email}
        </span>
      )}
      {registeredAt && (
        <span>
          <Calendar size={12} strokeWidth={1.5} /> {registeredAt}
        </span>
      )}
      <span>
        <User size={12} strokeWidth={1.5} />
        {registrant ? `${registrant.fullName} · ${registrant.email}` : t('saClinics.decision.noAdmin')}
      </span>
    </div>
  )
}

/**
 * Pending clinics are the primary reason a SuperAdmin visits this page, so
 * they get a distinct treatment (gold accent, matching the pending styling
 * already used on the ClinicAdmin's own pending-clinic card) and enough
 * inline detail to actually decide, plus direct Aprovo/Refuzo buttons
 * instead of hiding the primary action behind a kebab menu.
 */
function PendingClinicRow({
  clinic,
  acting,
  onApprove,
  onReject,
}: {
  clinic: AdminClinic
  acting: boolean
  onApprove: () => void
  onReject: () => void
}) {
  const { t } = useTranslation('admin')
  return (
    <tr className="sa-table__row--pending">
      <td colSpan={3}>
        <div className="sa-pending-row">
          <div className="sa-pending-row__top">
            <div>
              <div className="sa-table__primary">{clinic.name}</div>
              {clinic.description && <div className="sa-table__secondary">{clinic.description}</div>}
            </div>
            <span className="admin-card__status admin-card__status--inline admin-card__status--pending">
              {t('saClinics.statusPending')}
            </span>
          </div>
          <ClinicDecisionInfo clinic={clinic} />
          <div className="sa-pending-row__actions">
            <button type="button" className="btn btn--primary btn--sm" disabled={acting} onClick={onApprove}>
              <Check size={14} strokeWidth={1.5} /> {t('saClinics.approveCta')}
            </button>
            <button type="button" className="btn btn--danger-outline btn--sm" disabled={acting} onClick={onReject}>
              <X size={14} strokeWidth={1.5} /> {t('saClinics.rejectCta')}
            </button>
          </div>
        </div>
      </td>
    </tr>
  )
}

/**
 * Kebab trigger whose panel portals to `document.body` and is positioned
 * (via `position: fixed`) from the trigger's own bounding box, rather than
 * `position: absolute` inside the row. `.sa-table-card` clips overflow to
 * get its rounded corners, and an absolutely-positioned panel doesn't
 * contribute to that card's auto height — so a panel near the bottom (or on
 * any row, once the card is short enough) rendered past the card's edge and
 * got silently clipped, which is what made the trigger look unresponsive.
 * Closing on scroll/resize is the tradeoff for a portal: the panel can't
 * track the trigger's position as the page scrolls, so it just closes.
 */
function RowActionsMenu({
  label,
  disabled,
  children,
}: {
  label: string
  disabled?: boolean
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) setCoords({ top: rect.bottom + 6, right: window.innerWidth - rect.right })

    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return
      close()
    }
    document.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open, close])

  return (
    <div className="sa-table__menu">
      <button
        ref={triggerRef}
        type="button"
        className="admin-icon-btn"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
      >
        <MoreVertical size={15} strokeWidth={1.5} />
      </button>
      {open &&
        coords &&
        createPortal(
          <div
            ref={panelRef}
            className="dropdown__panel sa-table__menu-panel"
            style={{ position: 'fixed', top: coords.top, right: coords.right, left: 'auto' }}
          >
            {children(close)}
          </div>,
          document.body,
        )}
    </div>
  )
}

function ApproveClinicModal({
  clinic,
  acting,
  onClose,
  onConfirm,
}: {
  clinic: AdminClinic
  acting: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const { t } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
  return (
    <Modal title={t('saClinics.approveModal.title')} onClose={onClose}>
      <p className="schedule-delete__text">
        <Trans i18nKey="saClinics.approveModal.body" ns="admin" values={{ name: clinic.name }} components={[<strong key="0" />]} />
      </p>
      <div className="schedule-delete__actions">
        <button type="button" className="btn btn--ghost btn--sm" style={{ flex: 1 }} onClick={onClose} disabled={acting}>
          {tCommon('buttons.cancel')}
        </button>
        <button type="button" className="btn btn--primary btn--sm" style={{ flex: 1 }} onClick={onConfirm} disabled={acting}>
          {acting ? t('saClinics.approveModal.approvingCta') : t('saClinics.approveModal.confirmCta')}
        </button>
      </div>
    </Modal>
  )
}

function RejectClinicModal({
  clinic,
  acting,
  onClose,
  onConfirm,
}: {
  clinic: AdminClinic
  acting: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const { t } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
  return (
    <Modal title={t('saClinics.rejectModal.title')} onClose={onClose}>
      <p className="schedule-delete__text">
        <Trans i18nKey="saClinics.rejectModal.body" ns="admin" values={{ name: clinic.name }} components={[<strong key="0" />]} />
      </p>
      <div className="schedule-delete__actions">
        <button type="button" className="btn btn--ghost btn--sm" style={{ flex: 1 }} onClick={onClose} disabled={acting}>
          {tCommon('buttons.cancel')}
        </button>
        <button type="button" className="btn btn--danger-outline btn--sm" style={{ flex: 1 }} onClick={onConfirm} disabled={acting}>
          {acting ? t('saClinics.rejectModal.rejectingCta') : t('saClinics.rejectModal.confirmCta')}
        </button>
      </div>
    </Modal>
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
