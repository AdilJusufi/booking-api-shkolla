import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Calendar, CalendarX, Check, ChevronLeft, Clock, MapPin } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import type { CreateAppointmentRequest } from '../lib/types'
import { useToast } from '../context/ToastContext'
import { Pending } from '../components/ui'
import { formatDateLong, formatMoney } from '../lib/format'

const STORAGE_KEY = 'termini_pending_booking'

interface PendingBooking {
  doctorId: string
  doctorName: string
  serviceId: string
  serviceName: string
  serviceDurationMinutes: number
  branchId: string
  branchName: string
  date: string
  time: string
  startDateTime: string
  price: number
  currency: string
}

function readPendingBooking(): PendingBooking | null {
  const raw = sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as PendingBooking
    if (!parsed.doctorId || !parsed.startDateTime) return null
    return parsed
  } catch {
    return null
  }
}

export default function ConfirmBookingPage() {
  const navigate = useNavigate()
  const { notify } = useToast()

  const [booking] = useState<PendingBooking | null>(() => readPendingBooking())
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!booking) navigate('/kerko', { replace: true })
  }, [booking, navigate])

  if (!booking) return null

  async function handleConfirm() {
    if (!booking) return
    setSubmitting(true)
    setError('')
    try {
      const payload: CreateAppointmentRequest = {
        doctorId: booking.doctorId,
        clinicBranchId: booking.branchId,
        medicalServiceId: booking.serviceId,
        startDateTime: booking.startDateTime,
        patientNote: note.trim() || undefined,
      }
      const appointment = await api.createAppointment(payload)
      sessionStorage.removeItem(STORAGE_KEY)
      notify('Termini u rezervua me sukses.', 'ok')
      navigate(`/terminet/${appointment.id}`)
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError('Ky orar u zu ndërkohë. Zgjidhni një orar tjetër.')
      } else if (e instanceof ApiError) {
        setError(e.message)
      } else {
        setError('Rezervimi dështoi. Provoni përsëri.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="detail-page">
      <Link to={`/mjeku/${booking.doctorId}`} className="link-icon apptdetail-back">
        <ChevronLeft size={16} strokeWidth={1.5} /> Kthehu te mjeku
      </Link>

      <div className="apptdetail-layout">
        <div>
          <div className="card apptdetail-card">
            <p className="apptdetail-section-label">Konfirmoni rezervimin</p>

            <div className="apptdetail-doctor">
              <div className="apptdetail-avatar">
                {booking.doctorName
                  .replace('Dr. ', '')
                  .split(' ')
                  .map((p) => p.charAt(0))
                  .join('')
                  .toUpperCase()}
              </div>
              <div>
                <h2 className="apptdetail-doctor__name">{booking.doctorName}</h2>
                <div className="apptdetail-doctor__meta">
                  <span className="apptdetail-spec-chip">{booking.serviceName}</span>
                </div>
              </div>
            </div>

            <div className="apptdetail-divider" />

            <p className="apptdetail-section-label">Koha &amp; Vendi</p>
            <div className="apptdetail-grid">
              <div className="apptdetail-item">
                <span className="apptdetail-label">Data</span>
                <span className="apptdetail-value apptdetail-value--lg">
                  <Calendar size={14} strokeWidth={1.5} style={{ marginRight: 6 }} />
                  {formatDateLong(booking.startDateTime)}
                </span>
              </div>
              <div className="apptdetail-item">
                <span className="apptdetail-label">Ora</span>
                <span className="apptdetail-value apptdetail-value--md">
                  <Clock size={14} strokeWidth={1.5} style={{ marginRight: 6 }} />
                  {booking.time}
                  <span className="apptdetail-duration-pill">({booking.serviceDurationMinutes} min)</span>
                </span>
              </div>
              <div className="apptdetail-item">
                <span className="apptdetail-label">Dega</span>
                <span className="apptdetail-value apptdetail-value--row">
                  <MapPin size={13} strokeWidth={1.5} color="var(--muted)" />
                  {booking.branchName}
                </span>
              </div>
              <div className="apptdetail-item">
                <span className="apptdetail-label">Çmimi</span>
                <span className="apptdetail-value">{formatMoney(booking.price, booking.currency)}</span>
              </div>
            </div>

            <div className="apptdetail-divider" />

            <p className="apptdetail-section-label">Shënim (opsionale)</p>
            <textarea
              className="input"
              rows={3}
              maxLength={1000}
              placeholder="Diçka që klinika duhet ta dijë përpara vizitës..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>
        </div>

        <div className="card apptdetail-action">
          <div className="apptdetail-status-card">
            <p className="apptdetail-status-desc">
              Duke klikuar "Konfirmo rezervimin" pranoni terminin e mësipërm. Klinika do të njoftohet automatikisht.
            </p>
          </div>

          {error && (
            <div className="apptdetail-warning">
              <CalendarX size={16} strokeWidth={1.5} color="var(--danger)" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="button"
            className="btn btn--primary btn--block"
            disabled={submitting}
            onClick={handleConfirm}
          >
            {submitting ? (
              <>
                <Pending /> Duke rezervuar…
              </>
            ) : (
              <>
                <Check size={16} strokeWidth={1.5} /> Konfirmo rezervimin
              </>
            )}
          </button>

          <Link to={`/mjeku/${booking.doctorId}`} className="apptdetail-backlink">
            <ChevronLeft size={14} strokeWidth={1.5} style={{ display: 'inline' }} /> Ndrysho zgjedhjen
          </Link>
        </div>
      </div>
    </div>
  )
}
