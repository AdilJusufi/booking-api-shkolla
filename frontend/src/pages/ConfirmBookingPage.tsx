import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Calendar, CalendarX, Check, ChevronLeft, Clock, MapPin } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api, ApiError } from '../lib/api'
import { getErrorMessage, getSlotTakenMessage } from '../lib/errors'
import type { CreateAppointmentRequest } from '../lib/types'
import { useToast } from '../context/ToastContext'
import { Pending } from '../components/ui'
import { formatDateLong, formatMoney } from '../lib/format'

const STORAGE_KEY = 'rezervo_pending_booking'

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
  const { t } = useTranslation('patient')
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
      notify(t('confirmBooking.bookedToast'), 'ok')
      navigate(`/terminet/${appointment.id}`)
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        // Expected outcome, not an error state — rendered as an inline
        // warning below, never an ErrorBox. No slot grid on this page to
        // refetch; the "Ndrysho zgjedhjen" link is how the user picks again.
        setError(getSlotTakenMessage())
      } else {
        setError(getErrorMessage(e))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="detail-page">
      <Link to={`/mjeku/${booking.doctorId}`} className="link-icon apptdetail-back">
        <ChevronLeft size={16} strokeWidth={1.5} /> {t('confirmBooking.backToDoctor')}
      </Link>

      <div className="apptdetail-layout">
        <div>
          <div className="card apptdetail-card">
            <p className="apptdetail-section-label">{t('confirmBooking.title')}</p>

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

            <p className="apptdetail-section-label">{t('confirmBooking.timeAndPlace')}</p>
            <div className="apptdetail-grid">
              <div className="apptdetail-item">
                <span className="apptdetail-label">{t('confirmBooking.dateLabel')}</span>
                <span className="apptdetail-value apptdetail-value--lg">
                  <Calendar size={14} strokeWidth={1.5} style={{ marginRight: 6 }} />
                  {formatDateLong(booking.startDateTime)}
                </span>
              </div>
              <div className="apptdetail-item">
                <span className="apptdetail-label">{t('confirmBooking.timeLabel')}</span>
                <span className="apptdetail-value apptdetail-value--md">
                  <Clock size={14} strokeWidth={1.5} style={{ marginRight: 6 }} />
                  {booking.time}
                  <span className="apptdetail-duration-pill">({booking.serviceDurationMinutes} min)</span>
                </span>
              </div>
              <div className="apptdetail-item">
                <span className="apptdetail-label">{t('confirmBooking.branchLabel')}</span>
                <span className="apptdetail-value apptdetail-value--row">
                  <MapPin size={13} strokeWidth={1.5} color="var(--muted)" />
                  {booking.branchName}
                </span>
              </div>
              <div className="apptdetail-item">
                <span className="apptdetail-label">{t('confirmBooking.priceLabel')}</span>
                <span className="apptdetail-value">{formatMoney(booking.price, booking.currency)}</span>
              </div>
            </div>

            <div className="apptdetail-divider" />

            <p className="apptdetail-section-label">{t('confirmBooking.noteLabel')}</p>
            <div className="field">
              <textarea
                rows={3}
                maxLength={1000}
                placeholder={t('confirmBooking.notePlaceholder')}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="card apptdetail-action">
          <div className="apptdetail-status-card">
            <p className="apptdetail-status-desc">
              {t('confirmBooking.confirmNotice')}
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
                <Pending /> {t('confirmBooking.submitting')}
              </>
            ) : (
              <>
                <Check size={16} strokeWidth={1.5} /> {t('confirmBooking.confirmCta')}
              </>
            )}
          </button>

          <Link to={`/mjeku/${booking.doctorId}`} className="apptdetail-backlink">
            <ChevronLeft size={14} strokeWidth={1.5} style={{ display: 'inline' }} /> {t('confirmBooking.changeSelection')}
          </Link>
        </div>
      </div>
    </div>
  )
}
