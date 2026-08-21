import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ClipboardList } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import type { AuditLog } from '../lib/types'
import { EmptyState, ErrorBox, SkeletonRows } from '../components/ui'
import { monthName } from '../lib/format'

const PAGE_SIZE = 50

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function firstOfMonth(): string {
  const d = new Date()
  return toDateInput(new Date(d.getFullYear(), d.getMonth(), 1))
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getDate()} ${monthName(d.getMonth(), 'short')} ${d.getFullYear()} · ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function prettyJson(raw?: string): string | null {
  if (!raw) return null
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

export default function AuditLogsPage() {
  const { t } = useTranslation('admin')
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [actionFilter, setActionFilter] = useState('')
  const [entityFilter, setEntityFilter] = useState('')
  const [from, setFrom] = useState(firstOfMonth())
  const [to, setTo] = useState(toDateInput(new Date()))
  const [appliedFilters, setAppliedFilters] = useState({ action: '', entity: '', from: firstOfMonth(), to: toDateInput(new Date()) })

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    api
      .getAuditLogs({
        entityName: appliedFilters.entity || undefined,
        from: appliedFilters.from || undefined,
        to: appliedFilters.to || undefined,
        page,
        pageSize: PAGE_SIZE,
      })
      .then((r) => {
        // The backend query has no free-text "action" filter — narrow client-side
        // on the page we already fetched rather than pretending the API supports it.
        const items = appliedFilters.action
          ? r.items.filter((l) => l.action.toLowerCase().includes(appliedFilters.action.toLowerCase()))
          : r.items
        setLogs(items)
        setTotalPages(r.totalPages)
        setTotalItems(r.totalItems)
      })
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false))
  }, [appliedFilters, page])

  useEffect(load, [load])

  function applyFilters() {
    setPage(1)
    setAppliedFilters({ action: actionFilter, entity: entityFilter, from, to })
  }

  const pageNumbers = useMemo(() => {
    const start = Math.max(1, page - 2)
    const end = Math.min(totalPages, start + 4)
    const pages: number[] = []
    for (let p = start; p <= end; p++) pages.push(p)
    return pages
  }, [page, totalPages])

  return (
    <div className="sa-audit-page">
      <div className="admin-header">
        <div>
          <h1>{t('audit.pageTitle')}</h1>
          <p className="admin-header__sub">{t('audit.pageSubtitle')}</p>
        </div>
      </div>

      <div className="filters">
        <div className="filters__field">
          <label>{t('audit.actionLabel')}</label>
          <input type="text" placeholder={t('audit.actionPlaceholder')} value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} />
        </div>
        <div className="filters__field">
          <label>{t('audit.entityLabel')}</label>
          <input type="text" placeholder={t('audit.entityPlaceholder')} value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)} />
        </div>
        <div className="filters__field">
          <label>{t('appointments.fromLabel')}</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="filters__field">
          <label>{t('appointments.toLabel')}</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button type="button" className="btn btn--primary btn--sm" onClick={applyFilters} style={{ alignSelf: 'flex-end' }}>
          {t('audit.filterCta')}
        </button>
      </div>

      {loading ? (
        <SkeletonRows count={6} label={t('audit.loadingLabel')} />
      ) : error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : logs.length === 0 ? (
        <EmptyState icon={ClipboardList} title={t('audit.emptyTitle')} />
      ) : (
        <>
          <div className="admin-card sa-table-card">
            <table className="sa-table">
              <thead>
                <tr>
                  <th />
                  <th>{t('audit.columnTime')}</th>
                  <th>{t('audit.columnAction')}</th>
                  <th>{t('audit.columnEntity')}</th>
                  <th>{t('audit.columnUser')}</th>
                  <th>{t('audit.columnIp')}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const expanded = expandedId === log.id
                  const oldJson = prettyJson(log.oldValues)
                  const newJson = prettyJson(log.newValues)
                  const canExpand = !!(oldJson || newJson)
                  return (
                    <Fragment key={log.id}>
                      <tr
                        onClick={() => canExpand && setExpandedId(expanded ? null : log.id)}
                        style={{ cursor: canExpand ? 'pointer' : 'default' }}
                      >
                        <td>
                          {canExpand && (
                            <ChevronDown
                              size={14}
                              strokeWidth={1.5}
                              style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}
                            />
                          )}
                        </td>
                        <td className="sa-table__mono">{formatTimestamp(log.createdAt)}</td>
                        <td><span className="chip chip--soft sa-table__mono">{log.action}</span></td>
                        <td>
                          {log.entityName}
                          {log.entityId && <div className="sa-table__mono">{log.entityId.slice(0, 8)}</div>}
                        </td>
                        <td className="sa-table__mono">{log.userId ? log.userId.slice(0, 8) : t('audit.systemUser')}</td>
                        <td className="sa-table__mono">{log.ipAddress || '—'}</td>
                      </tr>
                      {expanded && (
                        <tr className="sa-table__expand-row">
                          <td colSpan={6}>
                            <div className="sa-table__json">
                              <div>
                                <div className="sa-table__secondary" style={{ marginBottom: 6 }}>{t('audit.oldValues')}</div>
                                <pre>{oldJson ?? '—'}</pre>
                              </div>
                              <div>
                                <div className="sa-table__secondary" style={{ marginBottom: 6 }}>{t('audit.newValues')}</div>
                                <pre>{newJson ?? '—'}</pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
    </div>
  )
}
