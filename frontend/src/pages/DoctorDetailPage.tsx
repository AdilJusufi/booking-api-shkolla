import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../lib/api'
import type { AvailableSlot, DoctorDetails } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { ErrorBox, Spinner, initials, specialtyIcon, specialtyLabel } from '../components/ui'
import { formatDateLong, formatMoney, formatTime, toDateInput } from '../lib/format'

export default function DoctorDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const { notify } = useToast()

  const [doctor, setDoctor] = useState<DoctorDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [branchId, setBranchId] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [date, setDate] = useState(() => toDateInput(tomorrow()))
  const [slots, setSlots] = useState<AvailableSlot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slotsError, setSlotsError] = useState('')
  const [selectedSlot, setSelectedSlot] = useState<string>('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!id) return
    let active = true
    setLoading(true)
    api
      .getDoctor(id)
      .then((d) => {
        if (!active) return
        setDoctor(d)
        if (d.branches[0]) setBranchId(d.branches[0].branchId)
        if (d.services[0]) setServiceId(d.services[0].medicalServiceId)
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [id])

  useEffect(() => {
    if (!id || !branchId || !serviceId || !date) {
      setSlots([])
      return
    }
    let active = true
    setSlotsLoading(true)
    setSlotsError('')
    setSelectedSlot('')
    api
      .getAvailableSlots(id, branchId, serviceId, date)
      .then((s) => active && setSlots(s))
      .catch((e) => active && setSlotsError(e.message))
      .finally(() => active && setSlotsLoading(false))
    return () => {
      active = false
    }
  }, [id, branchId, serviceId, date])

  const availableSlots = useMemo(() => slots.filter((s) => s.isAvailable), [slots])
  const selectedService = doctor?.services.find((s) => s.medicalServiceId === serviceId)

  async function handleBook() {
    if (!id || !selectedSlot) return
    if (!isAuthenticated) {
      navigate('/hyr', { state: { from: `/mjeku/${id}` } })
      return
    }
    setSubmitting(true)
    try {
      await api.createAppointment({
        doctorId: id,
        clinicBranchId: branchId,
        medicalServiceId: serviceId,
        startDateTime: selectedSlot,
        patientNote: note || undefined,
      })
      notify('Termini u rezervua me sukses! 🎉', 'ok')
      navigate('/terminet')
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Rezervimi dështoi.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="container page"><Spinner label="Duke ngarkuar profilin…" /></div>
  if (error) return <div className="container page"><ErrorBox message={error} /></div>
  if (!doctor) return null

  const minDate = toDateInput(new Date())

  return (
    <div className="page">
      <div className="detail-hero detail-hero--doctor">
        <div className="container">
          <Link to="/kerko" className="backlink">← Kthehu te kërkimi</Link>
          <div className="detail-hero__row">
            <div className="detail-hero__avatar" aria-hidden>
              {initials(doctor.firstName, doctor.lastName)}
            </div>
            <div>
              <h1>Dr. {doctor.firstName} {doctor.lastName}</h1>
              <div className="detail-hero__meta">
                {doctor.specialties.map((s) => (
                  <span key={s} className="chip chip--light">{specialtyIcon(s)} {specialtyLabel(s)}</span>
                ))}
              </div>
              {doctor.yearsOfExperience > 0 && (
                <p className="detail-hero__desc">{doctor.yearsOfExperience} vjet përvojë</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="container detail-body detail-body--split">
        <div className="detail-col">
          {doctor.biography && (
            <section className="block">
              <h2 className="block__title">Rreth mjekut</h2>
              <p className="prose">{doctor.biography}</p>
            </section>
          )}

          <section className="block">
            <h2 className="block__title">Ku ordinon</h2>
            <div className="grid grid--branches">
              {doctor.branches.map((b) => (
                <div key={b.branchId} className="branch-card">
                  <strong>{b.clinicName}</strong>
                  <span>{b.branchName}</span>
                  <span>📍 {b.address}, {b.city}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="block">
            <h2 className="block__title">Shërbimet</h2>
            <div className="service-list">
              {doctor.services.map((s) => (
                <div key={s.medicalServiceId} className="service-row">
                  <span className="service-row__icon">{specialtyIcon(s.specialtyName)}</span>
                  <div className="service-row__info">
                    <strong>{s.name}</strong>
                    <span>{s.durationMinutes} min</span>
                  </div>
                  <span className="service-row__price">{formatMoney(s.price, s.currency)}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="booking">
          <div className="booking__card">
            <h2 className="booking__title">Rezervo termin</h2>

            {doctor.branches.length > 1 && (
              <div className="field">
                <label>Dega</label>
                <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                  {doctor.branches.map((b) => (
                    <option key={b.branchId} value={b.branchId}>{b.clinicName} — {b.branchName}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="field">
              <label>Shërbimi</label>
              <select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
                {doctor.services.map((s) => (
                  <option key={s.medicalServiceId} value={s.medicalServiceId}>
                    {s.name} — {formatMoney(s.price, s.currency)}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Data</label>
              <input
                type="date"
                value={date}
                min={minDate}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <div className="field">
              <label>Orari i lirë — {formatDateLong(date)}</label>
              {slotsLoading ? (
                <div className="slots-loading"><div className="spinner spinner--sm" /> Duke kontrolluar…</div>
              ) : slotsError ? (
                <ErrorBox message={slotsError} />
              ) : availableSlots.length ? (
                <div className="slots">
                  {availableSlots.map((s) => (
                    <button
                      key={s.startDateTime}
                      className={`slot ${selectedSlot === s.startDateTime ? 'is-selected' : ''}`}
                      onClick={() => setSelectedSlot(s.startDateTime)}
                    >
                      {formatTime(s.startDateTime)}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="slots-empty">Nuk ka orare të lira për këtë ditë. Provo një datë tjetër.</p>
              )}
            </div>

            <div className="field">
              <label>Shënim për mjekun <span className="muted">(opsional)</span></label>
              <textarea
                rows={2}
                placeholder="p.sh. dhimbje dhëmbi prej 3 ditësh…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            {selectedService && selectedSlot && (
              <div className="booking__summary">
                <div><span>Shërbimi</span><strong>{selectedService.name}</strong></div>
                <div><span>Kur</span><strong>{formatDateLong(date)}, {formatTime(selectedSlot)}</strong></div>
                <div><span>Çmimi</span><strong>{formatMoney(selectedService.price, selectedService.currency)}</strong></div>
              </div>
            )}

            <button
              className="btn btn--primary btn--lg btn--block"
              disabled={!selectedSlot || submitting}
              onClick={handleBook}
            >
              {submitting
                ? 'Duke rezervuar…'
                : isAuthenticated
                  ? 'Konfirmo terminin'
                  : 'Kyçu për të rezervuar'}
            </button>
            {!isAuthenticated && (
              <p className="booking__hint">Duhet të kyçesh që ta konfirmosh terminin.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

function tomorrow(): Date {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d
}
