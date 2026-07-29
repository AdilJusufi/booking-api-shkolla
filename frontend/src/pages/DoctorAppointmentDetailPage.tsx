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
import { api, ApiError } from '../lib/api'
import { AppointmentStatus } from '../lib/types'
import type { DoctorAppointment } from '../lib/types'
import { useToast } from '../context/ToastContext'
import { Badge, Pending } from '../components/ui'

const DAYS_SQ = ['E Diel', 'E Hënë', 'E Martë', 'E Mërkurë', 'E Enjte', 'E Premte', 'E Shtunë']
const MONTHS_SQ = ['Janar', 'Shkurt', 'Mars', 'Prill', 'Maj', 'Qershor', 'Korrik', 'Gusht', 'Shtator', 'Tetor', 'Nëntor', 'Dhjetor']

function parseLocal(iso: string): Date {
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/)
  if (!m) return new Date(iso)
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), m[4] ? Number(m[4]) : 0, m[5] ? Number(m[5]) : 0)
}

function formatDateSq(iso: string): string {
  const d = parseLocal(iso)
  return `${DAYS_SQ[d.getDay()]}, ${d.getDate()} ${MONTHS_SQ[d.getMonth()]} ${d.getFullYear()}`
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

const STATUS_DESCRIPTIONS: Partial<Record<AppointmentStatus, string>> = {
  [AppointmentStatus.Pending]: 'Termini pret konfirmimin tuaj.',
  [AppointmentStatus.Confirmed]: 'Termini është konfirmuar. Pacienti është njoftuar.',
  [AppointmentStatus.CheckedIn]: 'Pacienti ka mbërrritur.',
  [AppointmentStatus.InProgress]: 'Konsulta është në progres.',
  [AppointmentStatus.Completed]: 'Ky termin është përfunduar.',
  [AppointmentStatus.CancelledByPatient]: 'Pacienti e anuloi këtë termin.',
  [AppointmentStatus.CancelledByClinic]: 'Klinika e anuloi këtë termin.',
  [AppointmentStatus.NoShow]: 'Pacienti nuk mbërriti në termin.',
  [AppointmentStatus.Rescheduled]: 'Ky termin është ricaktuar.',
}

function statusBadge(status: AppointmentStatus) {
  switch (status) {
    case AppointmentStatus.Pending:
      return <Badge tone="warn">NË PRITJE</Badge>
    case AppointmentStatus.Confirmed:
      return <Badge tone="primary">KONFIRMUAR</Badge>
    case AppointmentStatus.CheckedIn:
      return <Badge tone="ok">MBËRRITI</Badge>
    case AppointmentStatus.InProgress:
      return <Badge tone="primary">NË PROGRES</Badge>
    case AppointmentStatus.Completed:
      return <Badge tone="ok">PËRFUNDUAR</Badge>
    case AppointmentStatus.CancelledByPatient:
    case AppointmentStatus.CancelledByClinic:
      return <Badge tone="danger">ANULUAR</Badge>
    case AppointmentStatus.NoShow:
      return <Badge tone="muted">NUK ERDHI</Badge>
    case AppointmentStatus.Rescheduled:
      return <Badge tone="warn">RICAKTUAR</Badge>
    default:
      return <Badge tone="muted">I PANJOHUR</Badge>
  }
}

type ConfirmAction = 'confirm' | 'complete' | 'no-show' | null

export default function DoctorAppointmentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { notify } = useToast()

  const [appointment, setAppointment] = useState<DoctorAppointment | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [pendingAction, setPendingAction] = useState<ConfirmAction>(null)
  const [acting, setActing] = useState(false)

  const [note, setNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  const load = () => {
    if (!id) return
    setLoading(true)
    setNotFound(false)
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
        setNotFound(true)
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
      notify('Termini u përditësua.', 'ok')
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Gabim. Provoni përsëri.', 'error')
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
      notify('Shënimi u ruajt.', 'ok')
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Gabim. Provoni përsëri.', 'error')
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

  if (notFound || !appointment) {
    return (
      <div className="apptdetail-notfound">
        <CalendarX size={64} strokeWidth={1.5} color="var(--line)" style={{ margin: '0 auto 16px' }} />
        <h2>Termini nuk u gjet</h2>
        <p>Ky termin nuk ekziston ose nuk i përket kalendarit tuaj.</p>
        <Link to="/mjeku-panel/kalendari" className="btn btn--ghost">
          <ChevronLeft size={16} strokeWidth={1.5} /> Kthehu te kalendari
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
        <ChevronLeft size={16} strokeWidth={1.5} /> Kalendari
      </Link>

      <div className="apptdetail-layout">
        <div>
          <div className="card apptdetail-card">
            <div className="apptdetail-top">
              {statusBadge(appointment.status)}
              <span className="apptdetail-ref">REF: #{appointment.id.slice(0, 7).toUpperCase()}</span>
            </div>

            <p className="apptdetail-section-label">Koha &amp; Vendi</p>
            <div className="apptdetail-grid">
              <div className="apptdetail-item">
                <span className="apptdetail-label">Data</span>
                <span className="apptdetail-value apptdetail-value--lg">{formatDateSq(appointment.startDateTime)}</span>
              </div>
              <div className="apptdetail-item">
                <span className="apptdetail-label">Ora</span>
                <span className="apptdetail-value apptdetail-value--md">
                  {formatTimeSq(appointment.startDateTime)} – {formatTimeSq(appointment.endDateTime)}
                </span>
              </div>
              <div className="apptdetail-item">
                <span className="apptdetail-label">Dega</span>
                <span className="apptdetail-value apptdetail-value--row">
                  <MapPin size={13} strokeWidth={1.5} color="var(--muted)" />
                  {appointment.branchName}
                </span>
              </div>
            </div>

            <div className="apptdetail-divider" />

            <p className="apptdetail-section-label">Pacienti</p>
            <div className="apptdetail-doctor">
              <div className="apptdetail-avatar">{patientInitials(appointment.patientName)}</div>
              <div>
                <h2 className="apptdetail-doctor__name">{appointment.patientName}</h2>
                {appointment.dependentName && (
                  <div className="apptdetail-doctor__meta">
                    <span className="apptdetail-muted">Rezervuar për: {appointment.dependentName}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="apptdetail-grid" style={{ marginTop: 14 }}>
              {appointment.patientPhoneNumber && (
                <div className="apptdetail-item">
                  <span className="apptdetail-label">Telefoni</span>
                  <a href={`tel:${appointment.patientPhoneNumber}`} className="apptdetail-value apptdetail-value--row">
                    <Phone size={13} strokeWidth={1.5} color="var(--muted)" /> {appointment.patientPhoneNumber}
                  </a>
                </div>
              )}
              <div className="apptdetail-item">
                <span className="apptdetail-label">ID e Termini</span>
                <span className="apptdetail-value apptdetail-value--row sa-table__mono">#{appointment.id.slice(0, 8)}</span>
              </div>
            </div>

            <div className="apptdetail-divider" />

            <p className="apptdetail-section-label">Shërbimi</p>
            <div className="apptdetail-grid">
              <div className="apptdetail-item">
                <span className="apptdetail-label">Shërbimi</span>
                <span className="apptdetail-value apptdetail-value--row">
                  <Stethoscope size={13} strokeWidth={1.5} color="var(--muted)" /> {appointment.serviceName}
                </span>
              </div>
              <div className="apptdetail-item">
                <span className="apptdetail-label">Kohëzgjatja</span>
                <span className="apptdetail-value apptdetail-value--row">
                  <Clock size={13} strokeWidth={1.5} color="var(--muted)" /> {durationMinutes} minuta
                </span>
              </div>
            </div>

            {appointment.patientNote && (
              <div className="apptdetail-note">
                <span className="apptdetail-note__label">Shënime të Pacientit</span>
                <p className="apptdetail-note__text">{appointment.patientNote}</p>
              </div>
            )}
          </div>
        </div>

        <div className="card apptdetail-action">
          <div className="apptdetail-status-card">
            {statusBadge(appointment.status)}
            <p className="apptdetail-status-desc">
              {STATUS_DESCRIPTIONS[appointment.status] ?? 'Statusi i këtij termini nuk njihet.'}
            </p>
          </div>

          {isReadOnly ? (
            <p className="muted" style={{ fontSize: 13, textAlign: 'center' }}>
              Ky termin është vetëm për lexim — nuk ka veprime të disponueshme.
            </p>
          ) : (
            <>
              {pendingAction ? (
                <div className="apptdetail-cancel-confirm">
                  <p>
                    {pendingAction === 'confirm'
                      ? 'A jeni të sigurt që dëshironi të konfirmoni këtë termin?'
                      : pendingAction === 'complete'
                        ? 'A jeni të sigurt që dëshironi ta shënoni si të përfunduar?'
                        : 'A jeni të sigurt? Pacienti do të shënohet si i pa-ardhur.'}
                  </p>
                  <div className="apptdetail-cancel-confirm__row">
                    <button type="button" className="btn btn--ghost btn--sm" style={{ flex: 1 }} onClick={() => setPendingAction(null)}>
                      Anulo
                    </button>
                    <button
                      type="button"
                      className="apptdetail-btn-danger-solid"
                      style={{ flex: 1 }}
                      disabled={acting}
                      onClick={() => runAction(pendingAction)}
                    >
                      {acting ? 'Duke ruajtur…' : 'Konfirmo'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {canConfirm && (
                    <button type="button" className="apptdetail-btn-primary" onClick={() => setPendingAction('confirm')}>
                      <Check size={16} strokeWidth={1.5} /> Konfirmo
                    </button>
                  )}
                  {canComplete && (
                    <button type="button" className="apptdetail-btn-primary" onClick={() => setPendingAction('complete')}>
                      <CheckCircle size={16} strokeWidth={1.5} /> Përfundo
                    </button>
                  )}
                  {canNoShow && (
                    <button type="button" className="apptdetail-btn-danger-outline" onClick={() => setPendingAction('no-show')}>
                      <XCircle size={16} strokeWidth={1.5} /> Shëno Si Nuk Erdhi
                    </button>
                  )}
                </>
              )}
            </>
          )}

          <div className="apptdetail-divider" />

          <div className="profile-security__head">
            <span>Shënime Interne</span>
          </div>
          <p className="profile-security__text">Të dukshme vetëm për stafin mjekësor.</p>
          <textarea
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Shkruani shënime interne këtu..."
            style={{ width: '100%', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button type="button" className="btn btn--ghost btn--sm" disabled={savingNote} onClick={saveNote}>
              {savingNote ? (
                <>
                  <Pending /> Duke ruajtur…
                </>
              ) : (
                'Ruaj Shënimin'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
