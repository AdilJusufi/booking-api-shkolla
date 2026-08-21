import { useMemo, useState } from 'react'
import { Building2, Calendar, CalendarCheck, CalendarX, Download, Stethoscope, Wallet } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import type { ClinicReport } from '../lib/types'
import { useToast } from '../context/ToastContext'
import { useClinicContext } from '../components/ClinicDetailLayout'
import { ErrorBox, SkeletonRows, initials } from '../components/ui'
import { formatMoney, formatNumber } from '../lib/format'

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function firstOfMonth(): string {
  const d = new Date()
  return toDateInput(new Date(d.getFullYear(), d.getMonth(), 1))
}

export default function ClinicReportPage() {
  const { t } = useTranslation('admin')
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
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false))
  }

  const sortedByDoctor = useMemo(
    () => [...(report?.byDoctor ?? [])].sort((a, b) => b.appointmentCount - a.appointmentCount),
    [report],
  )
  const sortedByBranch = useMemo(
    () => [...(report?.byBranch ?? [])].sort((a, b) => b.appointmentCount - a.appointmentCount),
    [report],
  )
  const sortedByService = useMemo(
    () => [...(report?.byService ?? [])].sort((a, b) => b.appointmentCount - a.appointmentCount),
    [report],
  )

  return (
    <div className="clinic-report-page">
      <div className="filters">
        <div className="filters__field">
          <label>{t('appointments.fromLabel')}</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} max={to} />
        </div>
        <div className="filters__field">
          <label>{t('appointments.toLabel')}</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} min={from} />
        </div>
        <button type="button" className="btn btn--primary btn--sm" style={{ alignSelf: 'flex-end' }} onClick={generate}>
          {t('report.generateCta')}
        </button>
        {hasGenerated && !loading && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            style={{ alignSelf: 'flex-end', marginLeft: 'auto' }}
            onClick={() => notify(t('report.featureInDevelopmentToast'), 'info')}
          >
            <Download size={14} strokeWidth={1.5} /> {t('report.downloadPdfCta')}
          </button>
        )}
      </div>

      {loading ? (
        <SkeletonRows count={4} label={t('report.loadingLabel')} />
      ) : error ? (
        <ErrorBox message={error} onRetry={generate} />
      ) : !hasGenerated ? (
        <div className="empty">
          <div className="empty__icon" aria-hidden>
            <Calendar size={26} strokeWidth={1.5} />
          </div>
          <h3>{t('report.chooseRangeTitle')}</h3>
        </div>
      ) : report ? (
        <>
          <div className="stats-row">
            <ReportStat icon={Calendar} label={t('report.statTotal')} value={formatNumber(report.totalAppointments)} />
            <ReportStat icon={CalendarCheck} label={t('report.statCompleted')} value={formatNumber(report.completedAppointments)} />
            <ReportStat icon={CalendarX} label={t('report.statCancelled')} value={formatNumber(report.cancelledAppointments)} />
            <ReportStat icon={CalendarX} label={t('report.statNoShow')} value={formatNumber(report.noShowAppointments)} />
            <ReportStat icon={Wallet} label={t('report.statRevenue')} value={formatMoney(report.totalRevenue, report.currency)} />
          </div>

          {report.totalAppointments === 0 && (
            <p className="muted" style={{ marginBottom: 16 }}>{t('report.noDataForRange')}</p>
          )}

          <div className="admin-card sa-table-card" style={{ marginTop: 20 }}>
            <div className="clinic-settings__card-head" style={{ padding: '18px 20px 0' }}>
              <h2>{t('report.byDoctorTitle')}</h2>
            </div>
            {sortedByDoctor.length === 0 ? (
              <p className="muted" style={{ padding: '0 20px 20px' }}>{t('report.noAppointmentsInRange')}</p>
            ) : (
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>{t('report.columnDoctor')}</th>
                    <th>{t('report.columnTotal')}</th>
                    <th>{t('report.columnCompleted')}</th>
                    <th>{t('report.columnCancelled')}</th>
                    <th>{t('report.columnNoShow')}</th>
                    <th>{t('report.columnRevenue')}</th>
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
                        <td className="sa-table__mono">{d.completedCount}</td>
                        <td className="sa-table__mono">{d.cancelledCount}</td>
                        <td className="sa-table__mono">{d.noShowCount}</td>
                        <td className="sa-table__mono">{formatMoney(d.revenue, report.currency)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="admin-card sa-table-card" style={{ marginTop: 20 }}>
            <div className="clinic-settings__card-head" style={{ padding: '18px 20px 0' }}>
              <h2><Building2 size={16} strokeWidth={1.5} style={{ verticalAlign: -3, marginRight: 8 }} />{t('report.byBranchTitle')}</h2>
            </div>
            {sortedByBranch.length === 0 ? (
              <p className="muted" style={{ padding: '0 20px 20px' }}>{t('report.noAppointmentsInRange')}</p>
            ) : (
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>{t('report.columnBranch')}</th>
                    <th>{t('report.columnCity')}</th>
                    <th>{t('report.columnTotal')}</th>
                    <th>{t('report.columnCompleted')}</th>
                    <th>{t('report.columnCancelled')}</th>
                    <th>{t('report.columnRevenue')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedByBranch.map((b) => (
                    <tr key={b.branchId}>
                      <td>{b.branchName}</td>
                      <td>{b.city}</td>
                      <td className="sa-table__mono">{b.appointmentCount}</td>
                      <td className="sa-table__mono">{b.completedCount}</td>
                      <td className="sa-table__mono">{b.cancelledCount}</td>
                      <td className="sa-table__mono">{formatMoney(b.revenue, report.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="admin-card sa-table-card" style={{ marginTop: 20 }}>
            <div className="clinic-settings__card-head" style={{ padding: '18px 20px 0' }}>
              <h2><Stethoscope size={16} strokeWidth={1.5} style={{ verticalAlign: -3, marginRight: 8 }} />{t('report.byServiceTitle')}</h2>
            </div>
            {sortedByService.length === 0 ? (
              <p className="muted" style={{ padding: '0 20px 20px' }}>{t('report.noAppointmentsInRange')}</p>
            ) : (
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>{t('report.columnService')}</th>
                    <th>{t('report.columnSpecialty')}</th>
                    <th>{t('report.columnBasePrice')}</th>
                    <th>{t('report.columnTotal')}</th>
                    <th>{t('report.columnRevenue')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedByService.map((s) => (
                    <tr key={s.serviceId}>
                      <td>{s.serviceName}</td>
                      <td>{s.specialtyName}</td>
                      <td className="sa-table__mono">{formatMoney(s.price, report.currency)}</td>
                      <td className="sa-table__mono">{s.appointmentCount}</td>
                      <td className="sa-table__mono">{formatMoney(s.revenue, report.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}

function ReportStat({ icon: Icon, label, value }: { icon: typeof Calendar; label: string; value: string }) {
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
