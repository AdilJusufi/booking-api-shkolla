import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../lib/api'
import type { Appointment } from '../lib/types'
import { useToast } from '../context/ToastContext'
import { Badge, EmptyState, ErrorBox, Spinner } from '../components/ui'
import { formatDateTime, isUpcoming, statusLabel } from '../lib/format'

export default function MyAppointmentsPage() {
  const { notify } = useToast()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cancellingId, setCancellingId] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    api
      .getMyAppointments()
      .then((r) => setAppointments(r.items))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  async function handleCancel(id: string) {
    if (!confirm('A je i sigurt që dëshiron ta anulosh këtë termin?')) return
    setCancellingId(id)
    try {
      await api.cancelAppointment(id, 'Anuluar nga pacienti')
      notify('Termini u anulua.', 'ok')
      load()
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Anulimi dështoi.', 'error')
    } finally {
      setCancellingId('')
    }
  }

  if (loading) return <div className="container page"><Spinner label="Duke ngarkuar terminet…" /></div>
  if (error) return <div className="container page"><ErrorBox message={error} /></div>

  const upcoming = appointments.filter(isUpcoming)
  const past = appointments.filter((a) => !isUpcoming(a))

  return (
    <div className="container page">
      <div className="page__head">
        <h1>Terminet e mia</h1>
        <p>Menaxho terminet e ardhshme dhe shiko historikun.</p>
      </div>

      {appointments.length === 0 ? (
        <EmptyState
          icon="📅"
          title="Nuk ke asnjë termin ende"
          hint="Gjej një mjek dhe rezervo terminin tënd të parë."
        />
      ) : (
        <>
          <section className="block">
            <h2 className="block__title">Të ardhshme ({upcoming.length})</h2>
            {upcoming.length ? (
              <div className="appt-list">
                {upcoming.map((a) => (
                  <AppointmentRow
                    key={a.id}
                    appointment={a}
                    onCancel={handleCancel}
                    cancelling={cancellingId === a.id}
                  />
                ))}
              </div>
            ) : (
              <p className="muted">Nuk ke termine të ardhshme.</p>
            )}
          </section>

          {past.length > 0 && (
            <section className="block">
              <h2 className="block__title">Historiku</h2>
              <div className="appt-list">
                {past.map((a) => (
                  <AppointmentRow key={a.id} appointment={a} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <div className="page__foot">
        <Link to="/kerko" className="btn btn--primary">+ Rezervo termin të ri</Link>
      </div>
    </div>
  )
}

function AppointmentRow({
  appointment: a,
  onCancel,
  cancelling,
}: {
  appointment: Appointment
  onCancel?: (id: string) => void
  cancelling?: boolean
}) {
  const status = statusLabel(a.status)
  return (
    <div className="appt-card">
      <div className="appt-card__date">
        <span className="appt-card__day">{formatDateTime(a.startDateTime).split(',')[0]}</span>
        <span className="appt-card__time">{formatDateTime(a.startDateTime).split(', ')[1]}</span>
      </div>
      <div className="appt-card__info">
        <strong>{a.serviceName}</strong>
        <span>Dr. {a.doctorName} · {a.clinicName}</span>
        <span className="muted">📍 {a.branchName}, {a.branchAddress}</span>
        {a.dependentName && <span className="muted">Për: {a.dependentName}</span>}
      </div>
      <div className="appt-card__side">
        <Badge tone={status.tone}>{status.text}</Badge>
        {onCancel && (
          <button className="btn btn--ghost btn--sm" disabled={cancelling} onClick={() => onCancel(a.id)}>
            {cancelling ? 'Duke anuluar…' : 'Anulo'}
          </button>
        )}
      </div>
    </div>
  )
}
