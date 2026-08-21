import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle, ChevronLeft, ChevronRight, Search, UserCog, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import type { AdminUser } from '../lib/types'
import { useToast } from '../context/ToastContext'
import { Badge, CustomSelect, EmptyState, ErrorBox, SkeletonRows } from '../components/ui'
import type { CustomSelectOption } from '../components/ui'

const PAGE_SIZE = 20
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function UsersPage() {
  const { t } = useTranslation('admin')
  const { notify } = useToast()

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [isActive, setIsActive] = useState('')
  const [page, setPage] = useState(1)
  const [openSelect, setOpenSelect] = useState<'role' | 'status' | null>(null)

  const [users, setUsers] = useState<AdminUser[]>([])
  const [totalItems, setTotalItems] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actingId, setActingId] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

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
    api
      .getAdminUsers({
        role: role || undefined,
        isActive: isActive === '' ? undefined : isActive === 'true',
        search: search || undefined,
        page,
        pageSize: PAGE_SIZE,
      })
      .then((r) => {
        setUsers(r.items)
        setTotalItems(r.totalItems)
        setTotalPages(r.totalPages)
      })
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false))
  }, [role, isActive, search, page, reloadToken])

  async function toggleActive(user: AdminUser) {
    setActingId(user.id)
    try {
      if (user.isActive) await api.deactivateUser(user.id)
      else await api.activateUser(user.id)
      notify(user.isActive ? t('users.deactivatedToast') : t('users.activatedToast'), 'ok')
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, isActive: !u.isActive } : u)))
    } catch (e) {
      notify(getErrorMessage(e), 'error')
    } finally {
      setActingId(null)
    }
  }

  // Manual-ID form kept as a fallback: the table's row actions cover the
  // normal flow, but the endpoints have always accepted a bare user ID and
  // that stays useful when a user isn't on the currently-filtered page
  // (e.g. acting on an ID shared via a support ticket).
  const [manualId, setManualId] = useState('')
  const [manualActing, setManualActing] = useState<'activate' | 'deactivate' | null>(null)
  const [manualError, setManualError] = useState('')

  async function runManualAction(action: 'activate' | 'deactivate') {
    setManualError('')
    if (!GUID_RE.test(manualId.trim())) {
      setManualError(t('users.invalidUserId'))
      return
    }
    setManualActing(action)
    try {
      if (action === 'activate') await api.activateUser(manualId.trim())
      else await api.deactivateUser(manualId.trim())
      notify(action === 'activate' ? t('users.activatedToast') : t('users.deactivatedToast'), 'ok')
      setManualId('')
      setReloadToken((n) => n + 1)
    } catch (e) {
      notify(getErrorMessage(e), 'error')
    } finally {
      setManualActing(null)
    }
  }

  const ROLE_OPTIONS: CustomSelectOption[] = [
    { value: '', label: t('users.allRoles') },
    { value: 'Patient', label: t('users.rolePatient') },
    { value: 'Doctor', label: t('users.roleDoctor') },
    { value: 'ClinicAdmin', label: t('users.roleClinicAdmin') },
    { value: 'SuperAdmin', label: t('users.roleSuperAdmin') },
  ]
  const STATUS_OPTIONS: CustomSelectOption[] = [
    { value: '', label: t('users.allStatuses') },
    { value: 'true', label: t('users.statusActive') },
    { value: 'false', label: t('users.statusInactive') },
  ]

  const pageNumbers = useMemo(() => {
    const start = Math.max(1, page - 2)
    const end = Math.min(totalPages, start + 4)
    const pages: number[] = []
    for (let p = start; p <= end; p++) pages.push(p)
    return pages
  }, [page, totalPages])

  return (
    <div className="sa-users-page">
      <div className="admin-header">
        <div>
          <h1>{t('users.title')}</h1>
          <p className="admin-header__sub">{t('users.subtitle')}</p>
        </div>
      </div>

      <div className="filters">
        <div className="filters__field filters__field--grow">
          <label>{t('appointments.searchLabel')}</label>
          <div className="appts-search">
            <Search size={14} strokeWidth={1.5} color="var(--muted)" />
            <input
              placeholder={t('users.searchPlaceholder')}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
        </div>
        <div className="filters__field">
          <CustomSelect
            label={t('users.roleLabel')}
            options={ROLE_OPTIONS}
            value={role}
            onChange={(v) => {
              setRole(v)
              setPage(1)
            }}
            open={openSelect === 'role'}
            onOpenChange={(isOpen) => setOpenSelect(isOpen ? 'role' : null)}
          />
        </div>
        <div className="filters__field">
          <CustomSelect
            label={t('users.statusLabel')}
            options={STATUS_OPTIONS}
            value={isActive}
            onChange={(v) => {
              setIsActive(v)
              setPage(1)
            }}
            open={openSelect === 'status'}
            onOpenChange={(isOpen) => setOpenSelect(isOpen ? 'status' : null)}
          />
        </div>
      </div>

      {loading ? (
        <SkeletonRows count={6} label={t('users.loadingLabel')} />
      ) : error ? (
        <ErrorBox message={error} onRetry={() => setReloadToken((n) => n + 1)} />
      ) : users.length === 0 ? (
        <EmptyState icon={UserCog} title={t('users.emptyTitle')} />
      ) : (
        <>
          <div className="admin-card sa-table-card">
            <table className="sa-table">
              <thead>
                <tr>
                  <th>{t('users.columnName')}</th>
                  <th>{t('users.columnEmail')}</th>
                  <th>{t('users.columnRoles')}</th>
                  <th>{t('users.columnStatus')}</th>
                  <th>{t('users.columnActions')}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.fullName}</td>
                    <td className="sa-table__mono">{u.email}</td>
                    <td>
                      {u.roles.map((r) => (
                        <span key={r} className="chip chip--soft" style={{ marginRight: 4 }}>
                          {r}
                        </span>
                      ))}
                    </td>
                    <td>
                      {u.isActive ? (
                        <Badge tone="ok">{t('users.statusActive')}</Badge>
                      ) : (
                        <Badge tone="danger">{t('users.statusInactive')}</Badge>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn--sm btn--ghost"
                        disabled={actingId === u.id}
                        onClick={() => toggleActive(u)}
                      >
                        {u.isActive ? (
                          <>
                            <XCircle size={14} strokeWidth={1.5} /> {t('users.deactivateCta')}
                          </>
                        ) : (
                          <>
                            <CheckCircle size={14} strokeWidth={1.5} /> {t('users.activateCta')}
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
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

      <div className="admin-card" style={{ maxWidth: 480, marginTop: 24 }}>
        <div className="clinic-settings__card-head">
          <h2><UserCog size={16} strokeWidth={1.5} style={{ verticalAlign: -3, marginRight: 8 }} />{t('users.actionByIdTitle')}</h2>
        </div>

        {manualError && <ErrorBox message={manualError} />}

        <div className="field">
          <label>{t('users.userIdLabel')}</label>
          <input
            type="text"
            value={manualId}
            onChange={(e) => setManualId(e.target.value)}
            placeholder={t('users.userIdPlaceholder')}
          />
        </div>

        <div className="clinic-settings__actions">
          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={manualActing !== null}
            onClick={() => runManualAction('activate')}
          >
            {manualActing === 'activate' ? t('users.activating') : t('users.activateCta')}
          </button>
          <button
            type="button"
            className="btn btn--sm"
            style={{ background: 'var(--danger)', color: '#fff' }}
            disabled={manualActing !== null}
            onClick={() => runManualAction('deactivate')}
          >
            {manualActing === 'deactivate' ? t('users.deactivating') : t('users.deactivateCta')}
          </button>
        </div>
      </div>
    </div>
  )
}
