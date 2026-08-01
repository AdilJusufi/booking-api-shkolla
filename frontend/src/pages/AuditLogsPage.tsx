import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ClipboardList } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import type { AuditLog } from '../lib/types'
import { EmptyState, ErrorBox, SkeletonRows } from '../components/ui'

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
  const MONTHS = ['Jan', 'Shk', 'Mar', 'Pri', 'Maj', 'Qer', 'Kor', 'Gus', 'Sht', 'Tet', 'Nën', 'Dhj']
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} · ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
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
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Ndodhi një gabim.'))
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
          <h1>Regjistrat e Auditimit</h1>
          <p className="admin-header__sub">Historiku i veprimeve administrative në platformë.</p>
        </div>
      </div>

      <div className="filters">
        <div className="filters__field">
          <label>Veprimi</label>
          <input type="text" placeholder="p.sh. ClinicApproved" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} />
        </div>
        <div className="filters__field">
          <label>Entiteti</label>
          <input type="text" placeholder="p.sh. Appointment" value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)} />
        </div>
        <div className="filters__field">
          <label>Prej</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="filters__field">
          <label>Deri</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button type="button" className="btn btn--primary btn--sm" onClick={applyFilters} style={{ alignSelf: 'flex-end' }}>
          Filtro
        </button>
      </div>

      {error && <ErrorBox message={error} />}

      {loading ? (
        <SkeletonRows count={6} label="Duke ngarkuar regjistrat" />
      ) : logs.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Nuk u gjet asnjë regjistrim me këto filtra." />
      ) : (
        <>
          <div className="admin-card sa-table-card">
            <table className="sa-table">
              <thead>
                <tr>
                  <th />
                  <th>Koha</th>
                  <th>Veprimi</th>
                  <th>Entiteti</th>
                  <th>Përdoruesi</th>
                  <th>IP</th>
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
                        <td className="sa-table__mono">{log.userId ? log.userId.slice(0, 8) : 'Sistem'}</td>
                        <td className="sa-table__mono">{log.ipAddress || '—'}</td>
                      </tr>
                      {expanded && (
                        <tr className="sa-table__expand-row">
                          <td colSpan={6}>
                            <div className="sa-table__json">
                              <div>
                                <div className="sa-table__secondary" style={{ marginBottom: 6 }}>VLERAT E VJETRA</div>
                                <pre>{oldJson ?? '—'}</pre>
                              </div>
                              <div>
                                <div className="sa-table__secondary" style={{ marginBottom: 6 }}>VLERAT E REJA</div>
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
                <ChevronLeft size={16} strokeWidth={1.5} /> Prapa
              </button>
              {pageNumbers.map((p) => (
                <button key={p} className={p === page ? 'is-active' : ''} onClick={() => setPage(p)}>
                  {p}
                </button>
              ))}
              <button className="pagination__arrow" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Para <ChevronRight size={16} strokeWidth={1.5} />
              </button>
            </div>
          )}
          <p className="results-head__count" style={{ marginTop: 8 }}>{totalItems} regjistrime gjithsej</p>
        </>
      )}
    </div>
  )
}
