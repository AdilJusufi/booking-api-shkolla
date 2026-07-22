import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Calendar,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Search,
  X,
} from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { AppointmentStatus } from '../lib/types'
import type { Appointment } from '../lib/types'
import { useToast } from '../context/ToastContext'
import { Badge, Dropdown, EmptyState } from '../components/ui'
import { formatTime, toDateInput } from '../lib/format'

const PAGE_SIZE = 10

const MONTHS_ALB = ['JAN', 'SHK', 'MAR', 'PRI', 'MAJ', 'QER', 'KOR', 'GUS', 'SHT', 'TET', 'NËN', 'DHJ']

type StatusFilter = 'all' | 'active' | 'completed' | 'cancelled'
type DateRange = 'all' | 'today' | 'week' | 'month' | 'last3months' | 'year'

const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: 'all', label: 'Të gjitha datat' },
  { value: 'today', label: 'Sot' },
  { value: 'week', label: 'Kjo javë' },
  { value: 'month', label: 'Ky muaj' },
  { value: 'last3months', label: '3 muajt e fundit' },
  { value: 'year', label: 'Këtë vit' },
]

function parseLocal(iso: string): Date {
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/)
  if (!m) return new Date(iso)
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), m[4] ? Number(m[4]) : 0, m[5] ? Number(m[5]) : 0)
}

function dateRangeToParams(range: DateRange): { dateFrom?: string; dateTo?: string } {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  switch (range) {
    case 'today':
      return { dateFrom: toDateInput(today), dateTo: toDateInput(today) }
    case 'week': {
      const start = new Date(today)
      start.setDate(start.getDate() - start.getDay())
      const end = new Date(start)
      end.setDate(end.getDate() + 6)
      return { dateFrom: toDateInput(start), dateTo: toDateInput(end) }
    }
    case 'month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1)
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      return { dateFrom: toDateInput(start), dateTo: toDateInput(end) }
    }
    case 'last3months': {
      const start = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate())
      return { dateFrom: toDateInput(start), dateTo: toDateInput(today) }
    }
    case 'year': {
      const start = new Date(today.getFullYear(), 0, 1)
      const end = new Date(today.getFullYear(), 11, 31)
      return { dateFrom: toDateInput(start), dateTo: toDateInput(end) }
    }
    default:
      return {}
  }
}

function statusBadge(status: AppointmentStatus) {
  switch (status) {
    case AppointmentStatus.Pending:
      return <Badge tone="warn">NË PRITJE</Badge>
    case AppointmentStatus.Confirmed:
      return <Badge tone="primary">KONFIRMUAR</Badge>
    case AppointmentStatus.CheckedIn:
      return <Badge tone="ok">MBËRRITUR</Badge>
    case AppointmentStatus.InProgress:
      return <span className="badge" style={{ background: '#ede9fe', color: '#7c3aed' }}>NË PROGRES</span>
    case AppointmentStatus.Completed:
      return <Badge tone="ok">PËRFUNDUAR</Badge>
    case AppointmentStatus.CancelledByPatient:
      return <Badge tone="danger">ANULUAR</Badge>
    case AppointmentStatus.CancelledByClinic:
      return <Badge tone="danger">ANULUAR (KLINIKA)</Badge>
    case AppointmentStatus.NoShow:
      return <Badge tone="muted">NUK U PARAQIT</Badge>
    case AppointmentStatus.Rescheduled:
      return <Badge tone="warn">RISCHEDULUAR</Badge>
    default:
      return <Badge tone="muted">I PANJOHUR</Badge>
  }
}

const ACTIVE_STATUSES = [AppointmentStatus.Pending, AppointmentStatus.Confirmed, AppointmentStatus.CheckedIn, AppointmentStatus.InProgress]
const CANCELLED_STATUSES = [AppointmentStatus.CancelledByPatient, AppointmentStatus.CancelledByClinic, AppointmentStatus.NoShow]

function canCancel(a: Appointment): boolean {
  if (![AppointmentStatus.Pending, AppointmentStatus.Confirmed].includes(a.status)) return false
  const hoursUntil = (parseLocal(a.startDateTime).getTime() - Date.now()) / (1000 * 60 * 60)
  return hoursUntil > 12
}

function isWithin12Hours(a: Appointment): boolean {
  if (a.status === AppointmentStatus.Completed) return false
  if (![AppointmentStatus.Pending, AppointmentStatus.Confirmed].includes(a.status)) return false
  const hoursUntil = (parseLocal(a.startDateTime).getTime() - Date.now()) / (1000 * 60 * 60)
  return hoursUntil <= 12
}

function SkeletonRows() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div className="skeleton-appt-row" key={i}>
          <div className="skeleton-shimmer" style={{ width: 52, height: 70 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="skeleton-shimmer" style={{ height: 16, width: '40%' }} />
            <div className="skeleton-shimmer" style={{ height: 12, width: '60%' }} />
            <div className="skeleton-shimmer" style={{ height: 12, width: '30%' }} />
          </div>
        </div>
      ))}
    </>
  )
}

export default function MyAppointmentsPage() {
  const { notify } = useToast()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [dateRange, setDateRange] = useState<DateRange>('all')
  const [page, setPage] = useState(1)
  const [confirmingCancelId, setConfirmingCancelId] = useState('')
  const [cancellingId, setCancellingId] = useState('')

  const listRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(searchInput), 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchInput])

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    const { dateFrom, dateTo } = dateRangeToParams(dateRange)
    api
      .getMyAppointments({ page: 1, pageSize: 200, dateFrom, dateTo })
      .then((r) => setAppointments(r.items))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Ndodhi një gabim.'))
      .finally(() => setLoading(false))
  }, [dateRange])

  useEffect(load, [load])

  useEffect(() => {
    setPage(1)
  }, [statusFilter, debouncedSearch, dateRange])

  const stats = useMemo(() => {
    return {
      active: appointments.filter((a) => ACTIVE_STATUSES.includes(a.status) && a.status !== AppointmentStatus.Pending).length,
      pending: appointments.filter((a) => a.status === AppointmentStatus.Pending).length,
      completed: appointments.filter((a) => a.status === AppointmentStatus.Completed).length,
      cancelled: appointments.filter((a) => CANCELLED_STATUSES.includes(a.status)).length,
    }
  }, [appointments])

  const filtered = useMemo(() => {
    let list = appointments
    if (statusFilter === 'active') list = list.filter((a) => ACTIVE_STATUSES.includes(a.status))
    else if (statusFilter === 'completed') list = list.filter((a) => a.status === AppointmentStatus.Completed)
    else if (statusFilter === 'cancelled') list = list.filter((a) => CANCELLED_STATUSES.includes(a.status))

    if (debouncedSearch.trim()) {
      const q = debouncedSearch.trim().toLowerCase()
      list = list.filter((a) => a.doctorName.toLowerCase().includes(q))
    }
    return list
  }, [appointments, statusFilter, debouncedSearch])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function goToPage(next: number) {
    setPage(next)
    listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function confirmCancel(id: string) {
    setCancellingId(id)
    setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, status: AppointmentStatus.CancelledByPatient } : a)))
    try {
      await api.cancelAppointment(id, 'Anuluar nga pacienti')
      notify('Termini u anulua.', 'error')
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Anulimi dështoi.', 'error')
      load()
    } finally {
      setCancellingId('')
      setConfirmingCancelId('')
    }
  }

  return (
    <>
      <div className="appts-header">
        <div>
          <h1>Terminet e mia</h1>
          <p className="appts-header__sub">Shikoni dhe menaxhoni të gjitha terminet tuaja në një vend.</p>
        </div>
        <Link to="/kerko" className="btn btn--primary">
          Rezervo termin të ri <ArrowRight size={16} strokeWidth={1.5} />
        </Link>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-card__icon" style={{ background: 'var(--primary-050)' }}>
            <Calendar size={20} strokeWidth={1.5} color="var(--primary)" />
          </div>
          <div>
            <div className="stat-card__count" style={{ color: 'var(--primary)' }}>{stats.active}</div>
            <div className="stat-card__label">Aktive</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card__icon" style={{ background: 'var(--ok-bg)' }}>
            <CheckCircle size={20} strokeWidth={1.5} color="var(--ok)" />
          </div>
          <div>
            <div className="stat-card__count" style={{ color: 'var(--ok)' }}>{stats.completed}</div>
            <div className="stat-card__label">Përfunduar</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card__icon" style={{ background: 'var(--warn-bg)' }}>
            <Clock size={20} strokeWidth={1.5} color="var(--warn)" />
          </div>
          <div>
            <div className="stat-card__count" style={{ color: 'var(--warn)' }}>{stats.pending}</div>
            <div className="stat-card__label">Në pritje</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card__icon" style={{ background: 'var(--danger-bg)' }}>
            <X size={20} strokeWidth={1.5} color="var(--danger)" />
          </div>
          <div>
            <div className="stat-card__count" style={{ color: 'var(--danger)' }}>{stats.cancelled}</div>
            <div className="stat-card__label">Anuluara</div>
          </div>
        </div>
      </div>

      <div className="appts-filter-row">
        <div className="status-tabs">
          <button className={`status-tab ${statusFilter === 'all' ? 'is-active' : ''}`} onClick={() => setStatusFilter('all')}>Të gjitha</button>
          <button className={`status-tab ${statusFilter === 'active' ? 'is-active' : ''}`} onClick={() => setStatusFilter('active')}>Aktive</button>
          <button className={`status-tab ${statusFilter === 'completed' ? 'is-active' : ''}`} onClick={() => setStatusFilter('completed')}>Përfunduar</button>
          <button className={`status-tab ${statusFilter === 'cancelled' ? 'is-active' : ''}`} onClick={() => setStatusFilter('cancelled')}>Anuluara</button>
        </div>

        <div className="appts-search">
          <Search size={16} strokeWidth={1.5} aria-hidden />
          <input
            type="search"
            placeholder="Kërko sipas mjekut..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>

        <Dropdown
          options={DATE_RANGE_OPTIONS}
          value={dateRange}
          onChange={(v) => setDateRange(v as DateRange)}
          icon={Calendar}
        />
      </div>

      <div ref={listRef}>
        {loading ? (
          <SkeletonRows />
        ) : error ? (
          <EmptyState icon={AlertCircle} title="Ndodhi një gabim" hint={error} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Calendar} title="Nuk keni termine" hint="Rezervoni terminin tuaj të parë tani." />
        ) : (
          <>
            {pageItems.map((a) => {
              const d = parseLocal(a.startDateTime)
              const showCancel = canCancel(a)
              const showNote = isWithin12Hours(a) && !canCancel(a)
              return (
                <div className="appt-row" key={a.id}>
                  <div className="appt-row__date">
                    <div className="appt-row__day">{d.getDate()}</div>
                    <div className="appt-row__month">{MONTHS_ALB[d.getMonth()]}</div>
                    <div className="appt-row__year">{d.getFullYear()}</div>
                  </div>

                  <div className="appt-row__main">
                    <div className="appt-row__doctor">Dr. {a.doctorName}</div>
                    <div className="appt-row__meta">
                      <span className="chip">{a.serviceName}</span>
                      <span className="appt-row__clinic">
                        <Building2 size={12} strokeWidth={1.5} /> {a.clinicName}
                      </span>
                    </div>
                    <div className="appt-row__time">
                      <Clock size={12} strokeWidth={1.5} /> {formatTime(a.startDateTime)} – {formatTime(a.endDateTime)}
                    </div>
                    {confirmingCancelId === a.id && (
                      <div className="appt-row__cancel-confirm">
                        <span>Jeni i sigurt?</span>
                        <button
                          type="button"
                          style={{ background: 'none', border: 'none', color: 'var(--danger)', textDecoration: 'underline', cursor: 'pointer' }}
                          onClick={() => setConfirmingCancelId('')}
                        >
                          Anulo
                        </button>
                        <button
                          className="btn btn--sm"
                          style={{ background: 'var(--danger)', color: '#fff' }}
                          disabled={cancellingId === a.id}
                          onClick={() => confirmCancel(a.id)}
                        >
                          {cancellingId === a.id ? 'Duke anuluar…' : 'Po, anulo'}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="appt-row__side">
                    {statusBadge(a.status)}
                    <div className="appt-row__actions">
                      <Link to={`/terminet/${a.id}`} className="btn btn--ghost btn--sm">Shiko detajet</Link>
                      {showCancel && confirmingCancelId !== a.id && (
                        <button
                          type="button"
                          className="btn btn--sm btn--danger-outline"
                          onClick={() => setConfirmingCancelId(a.id)}
                        >
                          Anulo
                        </button>
                      )}
                    </div>
                    {showNote && <span className="appt-row__note">Anulimi jo i mundur (&lt; 12 orë)</span>}
                  </div>
                </div>
              )
            })}

            {totalPages > 1 && (
              <div className="pagination">
                <button disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                  <ChevronLeft size={16} strokeWidth={1.5} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button key={p} className={p === page ? 'is-active' : ''} onClick={() => goToPage(p)}>{p}</button>
                ))}
                <button disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>
                  <ChevronRight size={16} strokeWidth={1.5} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
