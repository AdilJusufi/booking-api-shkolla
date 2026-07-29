import { useMemo, useState } from 'react'
import { Calendar, CalendarCheck, CalendarX, Download, Users } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import type { ClinicReport } from '../lib/types'
import { useToast } from '../context/ToastContext'
import { useClinicContext } from '../components/ClinicDetailLayout'
import { ErrorBox, SkeletonRows, initials } from '../components/ui'

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function firstOfMonth(): string {
  const d = new Date()
  return toDateInput(new Date(d.getFullYear(), d.getMonth(), 1))
}

export default function ClinicReportPage() {
  const { clinic } = useClinicContext()
  const { notify } = useToast()

  const [from, setFrom] = useState(firstOfMonth())
  const [to, setTo] = useState(toDateInput(new Date()))
  const [report, setReport] = useState<ClinicReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hasGenerated, setHasGenerated] = useState(false)

  function generate() {
    setLoading(true)
    setError('')
    api
      .getClinicReport(clinic.id, from, to)
      .then((r) => {
        setReport(r)
        setHasGenerated(true)
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Ndodhi një gabim.'))
      .finally(() => setLoading(false))
  }

  const completed = report?.byStatus['Completed'] ?? 0
  const cancelled = (report?.byStatus['CancelledByPatient'] ?? 0) + (report?.byStatus['CancelledByClinic'] ?? 0)
  const noShow = report?.byStatus['NoShow'] ?? 0

  const sortedByDoctor = useMemo(
    () => [...(report?.byDoctor ?? [])].sort((a, b) => b.appointmentCount - a.appointmentCount),
    [report],
  )

  return (
    <div className="clinic-report-page">
      <div className="filters">
        <div className="filters__field">
          <label>Prej</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} max={to} />
        </div>
        <div className="filters__field">
          <label>Deri</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} min={from} />
        </div>
        <button type="button" className="btn btn--primary btn--sm" style={{ alignSelf: 'flex-end' }} onClick={generate}>
          Gjenero Raportin
        </button>
        {hasGenerated && !loading && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            style={{ alignSelf: 'flex-end', marginLeft: 'auto' }}
            onClick={() => notify('Funksion në zhvillim.', 'info')}
          >
            <Download size={14} strokeWidth={1.5} /> Shkarko PDF
          </button>
        )}
      </div>

      {error && <ErrorBox message={error} />}

      {loading ? (
        <SkeletonRows count={4} label="Duke gjeneruar raportin" />
      ) : !hasGenerated ? (
        <div className="empty">
          <div className="empty__icon" aria-hidden>
            <Calendar size={26} strokeWidth={1.5} />
          </div>
          <h3>Zgjidhni një periudhë dhe gjeneroni raportin.</h3>
        </div>
      ) : report ? (
        <>
          <div className="stats-row">
            <ReportStat icon={Calendar} label="Terminet Gjithsej" value={report.totalAppointments} />
            <ReportStat icon={CalendarCheck} label="Përfunduar" value={completed} />
            <ReportStat icon={CalendarX} label="Anuluar" value={cancelled} />
            <ReportStat icon={CalendarX} label="Nuk Erdhën" value={noShow} />
          </div>

          {report.totalAppointments === 0 && (
            <p className="muted" style={{ marginBottom: 16 }}>Nuk ka të dhëna për periudhën e zgjedhur.</p>
          )}

          {/*
            ClinicReportDto (the real backend response) has no revenue field
            at all, and no byBranch/byService breakdown — only TotalAppointments,
            ByStatus, and ByDoctor (name + count, no completed/cancelled/no-show
            split or revenue per doctor). A revenue card and branch/service
            tables would have to be invented; they're omitted rather than
            faked. Only what the backend actually returns is rendered below.
          */}
          <div className="admin-card sa-table-card" style={{ marginTop: 20 }}>
            <div className="clinic-settings__card-head" style={{ padding: '18px 20px 0' }}>
              <h2>Terminet sipas Mjekut</h2>
            </div>
            {sortedByDoctor.length === 0 ? (
              <p className="muted" style={{ padding: '0 20px 20px' }}>Asnjë termin në këtë periudhë.</p>
            ) : (
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>Mjeku</th>
                    <th>Gjithsej</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedByDoctor.map((d) => {
                    const [firstName, ...rest] = d.doctorName.split(' ')
                    return (
                      <tr key={d.doctorId}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span className="doctor-admin-card__avatar">
                              {initials(firstName ?? '', rest.join(' ') || firstName || '')}
                            </span>
                            {d.doctorName}
                          </div>
                        </td>
                        <td className="sa-table__mono">{d.appointmentCount}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}

function ReportStat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return (
    <div className="stat-card">
      <div className="stat-card__icon">
        <Icon size={18} strokeWidth={1.5} color="var(--primary)" />
      </div>
      <div>
        <div className="stat-card__count num">{value}</div>
        <div className="stat-card__label">{label}</div>
      </div>
    </div>
  )
}
