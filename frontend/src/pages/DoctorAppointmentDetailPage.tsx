import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  CalendarX,
  Check,
  CheckCircle,
  ChevronLeft,
  Clock,
  MapPin,
  Phone,
  Stethoscope,
  XCircle,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api, ApiError } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import { AppointmentStatus } from '../lib/types'
import type { DoctorAppointment } from '../lib/types'
import { useToast } from '../context/ToastContext'
import { Badge, ErrorBox, Pending } from '../components/ui'
import { monthName, weekdayName } from '../lib/format'

function parseLocal(iso: string): Date {
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/)
  if (!m) return new Date(iso)
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), m[4] ? Number(m[4]) : 0, m[5] ? Number(m[5]) : 0)
}

function formatDateSq(iso: string): string {
  const d = parseLocal(iso)
  return `${weekdayName(d.getDay())}, ${d.getDate()} ${monthName(d.getMonth())} ${d.getFullYear()}`
}

function formatTimeSq(iso: string): string {
  const d = parseLocal(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** DoctorAppointmentDto only carries a single combined patient name string,
 * not separate first/last fields, so the shared `initials(first, last)`
 * helper doesn't apply here. */
function patientInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  const first = parts[0]?.charAt(0) ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : ''
  return (first + last).toUpperCase()
}

const STATUS_KEYS: Partial<Record<AppointmentStatus, string>> = {
  [AppointmentStatus.Pending]: 'pending',
  [AppointmentStatus.Confirmed]: 'confirmed',
  [AppointmentStatus.CheckedIn]: 'checkedIn',
  [AppointmentStatus.InProgress]: 'inProgress',
  [AppointmentStatus.Completed]: 'completed',
  [AppointmentStatus.CancelledByPatient]: 'cancelledByPatient',
  [AppointmentStatus.CancelledByClinic]: 'cancelledByClinic',
  [AppointmentStatus.NoShow]: 'noShow',
  [AppointmentStatus.Rescheduled]: 'rescheduled',
}

function statusDescription(status: AppointmentStatus, t: (key: string) => string): string {
  const key = STATUS_KEYS[status]
  return key ? t(`appointmentDetail.statusDescriptions.${key}`) : t('appointmentDetail.statusDescriptionFallback')
}

function statusBadge(status: AppointmentStatus, t: (key: string) => string) {
  switch (status) {
    case AppointmentStatus.Pending:
      return <Badge tone="warn">{t('appointmentDetail.badges.pending')}</Badge>
    case AppointmentStatus.Confirmed:
      return <Badge tone="primary">{t('appointmentDetail.badges.confirmed')}</Badge>
    case AppointmentStatus.CheckedIn:
      return <Badge tone="ok">{t('appointmentDetail.badges.checkedIn')}</Badge>
    case AppointmentStatus.InProgress:
      return <Badge tone="primary">{t('appointmentDetail.badges.inProgress')}</Badge>
    case AppointmentStatus.Completed:
      return <Badge tone="ok">{t('appointmentDetail.badges.completed')}</Badge>
    case AppointmentStatus.CancelledByPatient:
    case AppointmentStatus.CancelledByClinic:
      return <Badge tone="danger">{t('appointmentDetail.badges.cancelled')}</Badge>
    case AppointmentStatus.NoShow:
      return <Badge tone="muted">{t('appointmentDetail.badges.noShow')}</Badge>
    case AppointmentStatus.Rescheduled:
      return <Badge tone="warn">{t('appointmentDetail.badges.rescheduled')}</Badge>
    default:
      return <Badge tone="muted">{t('appointmentDetail.badges.unknown')}</Badge>
  }
}

type ConfirmAction = 'confirm' | 'complete' | 'no-show' | null

export default function DoctorAppointmentDetailPage() {
  const { t } = useTranslation('doctor')
  const { t: tCommon } = useTranslation('common')
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { notify } = useToast()

  const [appointment, setAppointment] = useState<DoctorAppointment | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [loadError, setLoadError] = useState('')

  const [pendingAction, setPendingAction] = useState<ConfirmAction>(null)
  const [acting, setActing] = useState(false)

  const [note, setNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  const load = () => {
    if (!id) return
    setLoading(true)
    setNotFound(false)
    setLoadError('')
    api
      .getDoctorAppointmentDetail(id)
      .then((a) => {
        setAppointment(a)
        setNote(a.internalNote ?? '')
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) {
          navigate('/hyr')
          return
        }
        if (e instanceof ApiError && e.status === 404) {
          setNotFound(true)
        } else {
          setLoadError(getErrorMessage(e))
        }
      })
      .finally(() => setLoading(false))
  }

  useEffect(load, [id])

  async function runAction(action: Exclude<ConfirmAction, null>) {
    if (!id) return
    setActing(true)
    try {
      const updated =
        action === 'confirm'
          ? await api.confirmDoctorAppointment(id)
          : action === 'complete'
            ? await api.completeDoctorAppointment(id)
            : await api.markDoctorAppointmentNoShow(id)
      setAppointment(updated)
      setPendingAction(null)
      notify(t('appointmentDetail.updatedToast'), 'ok')
    } catch (e) {
      notify(getErrorMessage(e), 'error')
    } finally {
      setActing(false)
    }
  }

  async function saveNote() {
    if (!id) return
    setSavingNote(true)
    try {
      const updated = await api.updateDoctorAppointmentInternalNote(id, note)
      setAppointment(updated)
      notify(t('appointmentDetail.noteSavedToast'), 'ok')
    } catch (e) {
      notify(getErrorMessage(e), 'error')
    } finally {
      setSavingNote(false)
    }
  }

  if (loading) {
    return (
      <div className="detail-page">
        <div className="skeleton-shimmer" style={{ height: 16, width: 160, marginBottom: 20, borderRadius: 6 }} />
        <div className="apptdetail-layout">
          <div>
            <div className="card skeleton-shimmer" style={{ height: 260, marginBottom: 16 }} />
          </div>
          <div className="card skeleton-shimmer" style={{ height: 200 }} />
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="detail-page">
        <ErrorBox message={loadError} onRetry={load} />
      </div>
    )
  }

  if (notFound || !appointment) {
    return (
      <div className="apptdetail-notfound">
        <CalendarX size={64} strokeWidth={1.5} color="var(--line)" style={{ margin: '0 auto 16px' }} />
        <h2>{t('appointmentDetail.notFoundTitle')}</h2>
        <p>{t('appointmentDetail.notFoundHint')}</p>
        <Link to="/mjeku-panel/kalendari" className="btn btn--ghost">
          <ChevronLeft size={16} strokeWidth={1.5} /> {t('appointmentDetail.backToCalendar')}
        </Link>
      </div>
    )
  }

  const durationMinutes = Math.round(
    (parseLocal(appointment.endDateTime).getTime() - parseLocal(appointment.startDateTime).getTime()) / 60000,
  )
  const canConfirm = appointment.status === AppointmentStatus.Pending
  const canComplete = appointment.status === AppointmentStatus.Confirmed
  const canNoShow = canConfirm || canComplete
  const isReadOnly = !canConfirm && !canComplete

  return (
    <div className="detail-page">
      <Link to="/mjeku-panel/kalendari" className="link-icon apptdetail-back">
        <ChevronLeft size={16} strokeWidth={1.5} /> {t('appointmentDetail.calendarLink')}
      </Link>

      <div className="apptdetail-layout">
        <div>
          <div className="card apptdetail-card">
            <div className="apptdetail-top">
              {statusBadge(appointment.status, t)}
              <span className="apptdetail-ref">{t('appointmentDetail.refLabel')}: #{appointment.id.slice(0, 7).toUpperCase()}</span>
            </div>

            <p className="apptdetail-section-label">{t('appointmentDetail.timeAndPlace')}</p>
            <div className="apptdetail-grid">
              <div className="apptdetail-item">
                <span className="apptdetail-label">{t('appointmentDetail.dateLabel')}</span>
                <span className="apptdetail-value apptdetail-value--lg">{formatDateSq(appointment.startDateTime)}</span>
              </div>
              <div className="apptdetail-item">
                <span className="apptdetail-label">{t('appointmentDetail.timeLabel')}</span>
                <span className="apptdetail-value apptdetail-value--md">
                  {formatTimeSq(appointment.startDateTime)} – {formatTimeSq(appointment.endDateTime)}
                </span>
              </div>
              <div className="apptdetail-item">
                <span className="apptdetail-label">{t('appointmentDetail.branchLabel')}</span>
                <span className="apptdetail-value apptdetail-value--row">
                  <MapPin size={13} strokeWidth={1.5} color="var(--muted)" />
                  {appointment.branchName}
                </span>
              </div>
            </div>

            <div className="apptdetail-divider" />

            <p className="apptdetail-section-label">{t('appointmentDetail.patientSectionTitle')}</p>
            <div className="apptdetail-doctor">
              <div className="apptdetail-avatar">{patientInitials(appointment.patientName)}</div>
              <div>
                <h2 className="apptdetail-doctor__name">{appointment.patientName}</h2>
                {appointment.dependentName && (
                  <div className="apptdetail-doctor__meta">
                    <span className="apptdetail-muted">{t('appointmentDetail.bookedFor', { name: appointment.dependentName })}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="apptdetail-grid" style={{ marginTop: 14 }}>
              {appointment.patientPhoneNumber && (
                <div className="apptdetail-item">
                  <span className="apptdetail-label">{t('appointmentDetail.phoneLabel')}</span>
                  <a href={`tel:${appointment.patientPhoneNumber}`} className="apptdetail-value apptdetail-value--row">
                    <Phone size={13} strokeWidth={1.5} color="var(--muted)" /> {appointment.patientPhoneNumber}
                  </a>
                </div>
              )}
              <div className="apptdetail-item">
                <span className="apptdetail-label">{t('appointmentDetail.appointmentIdLabel')}</span>
                <span className="apptdetail-value apptdetail-value--row sa-table__mono">#{appointment.id.slice(0, 8)}</span>
              </div>
            </div>

            <div className="apptdetail-divider" />

            <p className="apptdetail-section-label">{t('appointmentDetail.serviceSectionTitle')}</p>
            <div className="apptdetail-grid">
              <div className="apptdetail-item">
                <span className="apptdetail-label">{t('appointmentDetail.serviceLabel')}</span>
                <span className="apptdetail-value apptdetail-value--row">
                  <Stethoscope size={13} strokeWidth={1.5} color="var(--muted)" /> {appointment.serviceName}
                </span>
              </div>
              <div className="apptdetail-item">
                <span className="apptdetail-label">{t('appointmentDetail.durationLabel')}</span>
                <span className="apptdetail-value apptdetail-value--row">
                  <Clock size={13} strokeWidth={1.5} color="var(--muted)" /> {t('appointmentDetail.durationMinutes', { count: durationMinutes })}
                </span>
              </div>
            </div>

            {appointment.patientNote && (
              <div className="apptdetail-note">
                <span className="apptdetail-note__label">{t('appointmentDetail.patientNotesLabel')}</span>
                <p className="apptdetail-note__text">{appointment.patientNote}</p>
              </div>
            )}
          </div>
        </div>

        <div className="card apptdetail-action">
          <div className="apptdetail-status-card">
            {statusBadge(appointment.status, t)}
            <p className="apptdetail-status-desc">
              {statusDescription(appointment.status, t)}
            </p>
          </div>

          {isReadOnly ? (
            <p className="muted" style={{ fontSize: 13, textAlign: 'center' }}>
              {t('appointmentDetail.readOnlyNote')}
            </p>
          ) : (
            <>
              {pendingAction ? (
                <div className="apptdetail-cancel-confirm">
                  <p>
                    {pendingAction === 'confirm'
                      ? t('appointmentDetail.confirmPrompt')
                      : pendingAction === 'complete'
                        ? t('appointmentDetail.completePrompt')
                        : t('appointmentDetail.noShowPrompt')}
                  </p>
                  <div className="apptdetail-cancel-confirm__row">
                    <button type="button" className="btn btn--ghost btn--sm" style={{ flex: 1 }} onClick={() => setPendingAction(null)}>
                      {tCommon('appointment.actions.cancel')}
                    </button>
                    <button
                      type="button"
                      className="apptdetail-btn-danger-solid"
                      style={{ flex: 1 }}
                      disabled={acting}
                      onClick={() => runAction(pendingAction)}
                    >
                      {acting ? t('appointmentDetail.saving') : t('appointmentDetail.confirmCta')}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {canConfirm && (
                    <button type="button" className="apptdetail-btn-primary" onClick={() => setPendingAction('confirm')}>
                      <Check size={16} strokeWidth={1.5} /> {t('appointmentDetail.confirmCta')}
                    </button>
                  )}
                  {canComplete && (
                    <button type="button" className="apptdetail-btn-primary" onClick={() => setPendingAction('complete')}>
                      <CheckCircle size={16} strokeWidth={1.5} /> {t('appointmentDetail.completeCta')}
                    </button>
                  )}
                  {canNoShow && (
                    <button type="button" className="apptdetail-btn-danger-outline" onClick={() => setPendingAction('no-show')}>
                      <XCircle size={16} strokeWidth={1.5} /> {t('appointmentDetail.markNoShowCta')}
                    </button>
                  )}
                </>
              )}
            </>
          )}

          <div className="apptdetail-divider" />

          <div className="profile-security__head">
            <span>{t('appointmentDetail.internalNotesTitle')}</span>
          </div>
          <p className="profile-security__text">{t('appointmentDetail.internalNotesHint')}</p>
          <textarea
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('appointmentDetail.internalNotesPlaceholder')}
            style={{ width: '100%', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button type="button" className="btn btn--ghost btn--sm" disabled={savingNote} onClick={saveNote}>
              {savingNote ? (
                <>
                  <Pending /> {t('appointmentDetail.saving')}
                </>
              ) : (
                t('appointmentDetail.saveNoteCta')
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
