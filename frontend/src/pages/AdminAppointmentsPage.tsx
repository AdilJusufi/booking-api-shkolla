import { useEffect, useMemo, useRef, useState } from 'react'
import { Calendar, CalendarCheck, CalendarX, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import { useAdminBreadcrumb } from '../context/AdminBreadcrumbContext'
import { useToast } from '../context/ToastContext'
import { api, ApiError } from '../lib/api'
import { getErrorMessage, getSlotTakenMessage } from '../lib/errors'
import { AppointmentStatus, type AdminAppointmentListItem, type AvailableSlot } from '../lib/types'
import { formatDateLong, formatDateTime, formatTime } from '../lib/format'
import { Badge, EmptyState, ErrorBox, Modal, Pending, SkeletonRows, initials } from '../components/ui'
import MonthCalendar from '../components/MonthCalendar'
import { clinicToday, isClinicPast } from '../lib/clinicTime'

const PAGE_SIZE = 20

type StatusTab = 'all' | 'confirmed' | 'completed' | 'cancelled' | 'noShow'

const TAB_STATUS: Partial<Record<StatusTab, AppointmentStatus>> = {
  confirmed: AppointmentStatus.Confirmed,
  completed: AppointmentStatus.Completed,
  noShow: AppointmentStatus.NoShow,
}

function statusBadge(status: AppointmentStatus, t: (key: string) => string) {
  switch (status) {
    case AppointmentStatus.Pending:
      return <Badge tone="warn">{t('appointments.badges.pending')}</Badge>
    case AppointmentStatus.Confirmed:
      return <Badge tone="primary">{t('appointments.badges.confirmed')}</Badge>
    case AppointmentStatus.CheckedIn:
      return <Badge tone="ok">{t('appointments.badges.checkedIn')}</Badge>
    case AppointmentStatus.InProgress:
      return <Badge tone="primary">{t('appointments.badges.inProgress')}</Badge>
    case AppointmentStatus.Completed:
      return <Badge tone="ok">{t('appointments.badges.completed')}</Badge>
    case AppointmentStatus.CancelledByPatient:
      return <Badge tone="danger">{t('appointments.badges.cancelledByPatient')}</Badge>
    case AppointmentStatus.CancelledByClinic:
      return <Badge tone="danger">{t('appointments.badges.cancelledByClinic')}</Badge>
    case AppointmentStatus.NoShow:
      return <Badge tone="muted">{t('appointments.badges.noShow')}</Badge>
    case AppointmentStatus.Rescheduled:
      return <Badge tone="warn">{t('appointments.badges.rescheduled')}</Badge>
    default:
      return <Badge tone="muted">{t('appointments.badges.unknown')}</Badge>
  }
}

/**
 * Staff may cancel or move an appointment that hasn't started yet and is still
 * active. No 12-hour cutoff here: that is the patient's rule; the backend
 * refuses anything that has already started (appointment-already-started).
 */
function isManageable(a: AdminAppointmentListItem): boolean {
  return (
    (a.status === AppointmentStatus.Pending || a.status === AppointmentStatus.Confirmed) &&
    !isClinicPast(a.startDateTime)
  )
}

/**
 * `GET /api/admin/appointments` supports a single `Status` value, so the
 * "cancelled" tab (CancelledByPatient + CancelledByClinic) can't be expressed
 * as one server-paginated query. Rather than approximate real pagination by
 * merging two independently-paginated result sets — which drifts (items can
 * repeat or vanish across page boundaries) — this tab fetches up to 100 rows
 * of each cancellation reason, merges and sorts them client-side, and
 * paginates over that bounded, in-memory list. Clinics with a genuinely huge
 * cancelled backlog would need a real backend OR filter to go further; 200
 * rows covers everything this admin table is used for today.
 */
async function fetchCancelled(params: {
  clinicId?: string
  from?: string
  to?: string
  search?: string
}): Promise<{ items: AdminAppointmentListItem[]; totalItems: number }> {
  const [byPatient, byClinic] = await Promise.all([
    api.getAdminAppointments({ ...params, status: AppointmentStatus.CancelledByPatient, page: 1, pageSize: 100 }),
    api.getAdminAppointments({ ...params, status: AppointmentStatus.CancelledByClinic, page: 1, pageSize: 100 }),
  ])
  const items = [...byPatient.items, ...byClinic.items].sort((a, b) => b.startDateTime.localeCompare(a.startDateTime))
  return { items, totalItems: byPatient.totalItems + byClinic.totalItems }
}

export default function AdminAppointmentsPage() {
  const { t } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
  const { setTrail } = useAdminBreadcrumb()

  // WR-36: the breadcrumb used to fall back to "Klinikat e mia" on this page.
  useEffect(() => {
    setTrail([t('layout.appointmentsBreadcrumb')])
    return () => setTrail([])
  }, [setTrail, t])

  const [statusFilter, setStatusFilter] = useState<StatusTab>('all')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [reloadToken, setReloadToken] = useState(0)

  const [items, setItems] = useState<AdminAppointmentListItem[]>([])
  const [totalItems, setTotalItems] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [cancelTarget, setCancelTarget] = useState<AdminAppointmentListItem | null>(null)
  const [rescheduleTarget, setRescheduleTarget] = useState<AdminAppointmentListItem | null>(null)
  const reload = () => setReloadToken((n) => n + 1)

  const [stats, setStats] = useState<{ today: number; confirmed: number; completed: number; cancelled: number } | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setPage(1)
      setSearch(searchInput.trim())
    }, 400)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  useEffect(() => {
    setLoading(true)
    setError('')

    const params = { from: from || undefined, to: to || undefined, search: search || undefined }

    const load =
      statusFilter === 'cancelled'
        ? fetchCancelled(params).then((r) => ({
            items: r.items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
            totalItems: r.totalItems,
            totalPages: Math.max(1, Math.ceil(r.totalItems / PAGE_SIZE)),
          }))
        : api
            .getAdminAppointments({ ...params, status: TAB_STATUS[statusFilter], page, pageSize: PAGE_SIZE })
            .then((r) => ({ items: r.items, totalItems: r.totalItems, totalPages: r.totalPages }))

    load
      .then((r) => {
        setItems(r.items)
        setTotalItems(r.totalItems)
        setTotalPages(r.totalPages)
      })
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false))
  }, [statusFilter, search, from, to, page, reloadToken])

  // Stat cards are independent of the table's filters — a fixed dashboard
  // snapshot, loaded once. Each is a pageSize=1 request read only for its
  // `totalItems`, since the backend has no dedicated counts endpoint.
  useEffect(() => {
    const today = clinicToday()
    Promise.all([
      api.getAdminAppointments({ from: today, to: today, page: 1, pageSize: 1 }),
      api.getAdminAppointments({ status: AppointmentStatus.Confirmed, page: 1, pageSize: 1 }),
      api.getAdminAppointments({ status: AppointmentStatus.Completed, page: 1, pageSize: 1 }),
      api.getAdminAppointments({ status: AppointmentStatus.CancelledByPatient, page: 1, pageSize: 1 }),
      api.getAdminAppointments({ status: AppointmentStatus.CancelledByClinic, page: 1, pageSize: 1 }),
    ])
      .then(([todayR, confirmedR, completedR, cancelledByPatientR, cancelledByClinicR]) => {
        setStats({
          today: todayR.totalItems,
          confirmed: confirmedR.totalItems,
          completed: completedR.totalItems,
          cancelled: cancelledByPatientR.totalItems + cancelledByClinicR.totalItems,
        })
      })
      .catch(() => setStats(null))
  }, [])

  const STATUS_TABS: { value: StatusTab; label: string }[] = [
    { value: 'all', label: t('appointments.filterAll') },
    { value: 'confirmed', label: t('appointments.filterConfirmed') },
    { value: 'completed', label: t('appointments.statCompleted') },
    { value: 'cancelled', label: t('appointments.filterCancelled') },
    { value: 'noShow', label: t('appointments.filterNoShow') },
  ]

  const pageNumbers = useMemo(() => {
    const start = Math.max(1, page - 2)
    const end = Math.min(totalPages, start + 4)
    const pages: number[] = []
    for (let p = start; p <= end; p++) pages.push(p)
    return pages
  }, [page, totalPages])

  return (
    <div className="admin-appts-page">
      <div className="admin-header">
        <div>
          <h1>{t('appointments.title')}</h1>
          <p className="admin-header__sub">{t('appointments.subtitle')}</p>
        </div>
      </div>

      <div className="stats-row">
        <StatCard icon={Calendar} label={t('appointments.statToday')} value={stats?.today} />
        <StatCard icon={CalendarCheck} label={t('appointments.statConfirmed')} value={stats?.confirmed} />
        <StatCard icon={CalendarCheck} label={t('appointments.statCompleted')} value={stats?.completed} />
        <StatCard icon={CalendarX} label={t('appointments.statCancelled')} value={stats?.cancelled} />
      </div>

      <div className="filters">
        <div className="status-tabs">
          {STATUS_TABS.map((s) => (
            <button
              key={s.value}
              type="button"
              className={`status-tab ${statusFilter === s.value ? 'is-active' : ''}`}
              onClick={() => {
                setStatusFilter(s.value)
                setPage(1)
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="filters__field filters__field--grow">
          <label>{t('appointments.searchLabel')}</label>
          <div className="appts-search">
            <Search size={14} strokeWidth={1.5} color="var(--muted)" />
            <input
              placeholder={t('appointments.searchPlaceholder')}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="filters">
        <div className="filters__field">
          <label>{t('appointments.fromLabel')}</label>
          <input type="date" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setPage(1) }} />
        </div>
        <div className="filters__field">
          <label>{t('appointments.toLabel')}</label>
          <input type="date" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setPage(1) }} />
        </div>
      </div>

      {loading ? (
        <SkeletonRows count={6} label={t('appointments.loadingLabel')} />
      ) : error ? (
        <ErrorBox message={error} onRetry={() => setReloadToken((n) => n + 1)} />
      ) : items.length === 0 ? (
        <EmptyState icon={Calendar} title={t('appointments.notAvailableTitle')} />
      ) : (
        <>
          <div className="admin-card sa-table-card">
            <table className="sa-table">
              <thead>
                <tr>
                  <th>{t('appointments.columnDateTime')}</th>
                  <th>{t('appointments.columnPatient')}</th>
                  <th>{t('appointments.columnDoctorService')}</th>
                  <th>{t('appointments.columnBranch')}</th>
                  <th>{t('appointments.columnStatus')}</th>
                  <th>{t('appointments.columnActions')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => {
                  const [firstName, ...rest] = a.doctorName.split(' ')
                  return (
                    <tr key={a.id}>
                      <td className="sa-table__mono">{formatDateTime(a.startDateTime)}</td>
                      <td>
                        {a.patientName}
                        {a.isForDependent && a.dependentName && (
                          <div className="sa-table__secondary">{a.dependentName}</div>
                        )}
                        {a.bookedByClinic && (
                          <div className="sa-table__secondary">{tCommon('appointment.bookedByClinic')}</div>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span className="doctor-admin-card__avatar">
                            {initials(firstName ?? '', rest.join(' ') || firstName || '')}
                          </span>
                          <div>
                            {a.doctorName}
                            <div className="sa-table__secondary">{a.serviceName}</div>
                          </div>
                        </div>
                      </td>
                      <td>{a.branchName}</td>
                      <td>{statusBadge(a.status, t)}</td>
                      <td>
                        {isManageable(a) && (
                          <div className="appt-actions">
                            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setRescheduleTarget(a)}>
                              {tCommon('appointment.actions.reschedule')}
                            </button>
                            <button type="button" className="btn btn--danger-outline btn--sm" onClick={() => setCancelTarget(a)}>
                              {tCommon('appointment.actions.cancel')}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button className="pagination__arrow" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft size={16} strokeWidth={1.5} /> {t('audit.previousPage')}
              </button>
              {pageNumbers.map((p) => (
                <button key={p} className={p === page ? 'is-active' : ''} onClick={() => setPage(p)}>
                  {p}
                </button>
              ))}
              <button className="pagination__arrow" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                {t('audit.nextPage')} <ChevronRight size={16} strokeWidth={1.5} />
              </button>
            </div>
          )}
          <p className="results-head__count" style={{ marginTop: 8 }}>{t('audit.totalCount', { count: totalItems })}</p>
        </>
      )}

      {cancelTarget && (
        <CancelModal
          appointment={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onDone={() => {
            setCancelTarget(null)
            reload()
          }}
        />
      )}
      {rescheduleTarget && (
        <RescheduleModal
          appointment={rescheduleTarget}
          onClose={() => setRescheduleTarget(null)}
          onDone={() => {
            setRescheduleTarget(null)
            reload()
          }}
        />
      )}
    </div>
  )
}

function CancelModal({
  appointment,
  onClose,
  onDone,
}: {
  appointment: AdminAppointmentListItem
  onClose: () => void
  onDone: () => void
}) {
  const { t } = useTranslation('admin')
  const { notify } = useToast()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    setBusy(true)
    setError('')
    try {
      await api.adminCancelAppointment(appointment.id, reason.trim() || undefined)
      notify(t('appointments.cancelModal.done'), 'ok')
      onDone()
    } catch (e) {
      setError(getErrorMessage(e))
      setBusy(false)
    }
  }

  return (
    <Modal title={t('appointments.cancelModal.title')} onClose={onClose}>
      <p className="schedule-delete__text">
        <Trans
          i18nKey="appointments.cancelModal.text"
          ns="admin"
          values={{
            patient: appointment.dependentName ?? appointment.patientName,
            doctor: appointment.doctorName,
            when: formatDateTime(appointment.startDateTime),
          }}
          components={[<strong key="0" />]}
        />
      </p>
      <div className="field">
        <label htmlFor="admin-cancel-reason">{t('appointments.cancelModal.reasonLabel')}</label>
        <textarea
          id="admin-cancel-reason"
          rows={2}
          maxLength={500}
          placeholder={t('appointments.cancelModal.reasonPlaceholder')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      {error && (
        <div className="apptdetail-warning" role="alert">
          <CalendarX size={16} strokeWidth={1.5} color="var(--danger)" />
          <span>{error}</span>
        </div>
      )}
      <div className="schedule-delete__actions">
        <button type="button" className="btn btn--ghost btn--sm" style={{ flex: 1 }} onClick={onClose}>
          {t('appointments.cancelModal.keep')}
        </button>
        <button type="button" className="btn btn--danger-outline btn--sm" style={{ flex: 1 }} disabled={busy} onClick={confirm}>
          {busy ? <Pending /> : t('appointments.cancelModal.confirm')}
        </button>
      </div>
    </Modal>
  )
}

function RescheduleModal({
  appointment,
  onClose,
  onDone,
}: {
  appointment: AdminAppointmentListItem
  onClose: () => void
  onDone: () => void
}) {
  const { t } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
  const { notify } = useToast()
  const [date, setDate] = useState('')
  const [slots, setSlots] = useState<AvailableSlot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slot, setSlot] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Same doctor, branch and service: only the time moves.
  function pickDate(d: string) {
    setDate(d)
    setSlot('')
    setSlotsLoading(true)
    api
      .getAvailableSlots(appointment.doctorId, appointment.clinicBranchId, appointment.medicalServiceId, d)
      .then((s) => setSlots((s ?? []).filter((x) => x.isAvailable)))
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false))
  }

  async function confirm() {
    if (!slot) return
    setBusy(true)
    setError('')
    try {
      await api.adminRescheduleAppointment(appointment.id, slot)
      notify(t('appointments.rescheduleModal.done'), 'ok')
      onDone()
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError(getSlotTakenMessage())
        if (date) pickDate(date)
      } else {
        setError(getErrorMessage(e))
      }
      setBusy(false)
    }
  }

  return (
    <Modal title={t('appointments.rescheduleModal.title')} onClose={onClose} size="lg">
      <p className="appt-modal__summary">
        <strong>{appointment.dependentName ?? appointment.patientName}</strong> ·{' '}
        {t('appointments.rescheduleModal.current', { when: formatDateTime(appointment.startDateTime) })}
      </p>
      <p className="appt-modal__summary">
        {t('appointments.rescheduleModal.sameDoctorService', {
          doctor: appointment.doctorName,
          service: appointment.serviceName,
        })}
      </p>
      <div className="appt-reschedule">
        <MonthCalendar
          doctorId={appointment.doctorId}
          branchId={appointment.clinicBranchId}
          serviceId={appointment.medicalServiceId}
          selectedDate={date}
          onPick={pickDate}
        />
        <div>
          {!date ? (
            <p className="appt-modal__summary">{t('appointments.rescheduleModal.pickSlot')}</p>
          ) : (
            <>
              <p className="booking-step__label">{formatDateLong(date)}</p>
              {slotsLoading ? (
                <div className="booking-slotgrid">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="booking-slot-skeleton skeleton-shimmer" />
                  ))}
                </div>
              ) : slots.length === 0 ? (
                <div className="booking-slots-empty">
                  <CalendarX size={28} strokeWidth={1.5} color="var(--line)" style={{ margin: '0 auto 8px' }} />
                  <p>{t('appointments.rescheduleModal.noSlots')}</p>
                </div>
              ) : (
                <div className="booking-slotgrid">
                  {slots.map((s) => (
                    <button
                      key={s.startDateTime}
                      type="button"
                      className={`booking-slot ${slot === s.startDateTime ? 'is-selected' : ''}`}
                      onClick={() => setSlot(s.startDateTime)}
                    >
                      {formatTime(s.startDateTime)}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {error && (
        <div className="apptdetail-warning" role="alert" style={{ marginTop: 14 }}>
          <CalendarX size={16} strokeWidth={1.5} color="var(--danger)" />
          <span>{error}</span>
        </div>
      )}
      <div className="schedule-delete__actions" style={{ marginTop: 16 }}>
        <button type="button" className="btn btn--ghost btn--sm" style={{ flex: 1 }} onClick={onClose}>
          {tCommon('buttons.back')}
        </button>
        <button type="button" className="btn btn--primary btn--sm" style={{ flex: 1 }} disabled={busy || !slot} onClick={confirm}>
          {busy ? (
            <Pending />
          ) : slot ? (
            t('appointments.rescheduleModal.confirm', { when: `${formatDateLong(slot)}, ${formatTime(slot)}` })
          ) : (
            t('appointments.rescheduleModal.title')
          )}
        </button>
      </div>
    </Modal>
  )
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Calendar; label: string; value: number | undefined }) {
  return (
    <div className="stat-card">
      <div className="stat-card__icon">
        <Icon size={18} strokeWidth={1.5} color="var(--primary)" />
      </div>
      <div>
        <div className="stat-card__count num">{value ?? '—'}</div>
        <div className="stat-card__label">{label}</div>
      </div>
    </div>
  )
}
