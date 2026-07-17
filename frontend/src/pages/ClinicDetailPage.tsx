import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import type { ClinicDetails, Doctor } from '../lib/types'
import DoctorCard from '../components/DoctorCard'
import { EmptyState, ErrorBox, Spinner, specialtyIcon, specialtyLabel } from '../components/ui'
import { formatMoney } from '../lib/format'

export default function ClinicDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [clinic, setClinic] = useState<ClinicDetails | null>(null)
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    let active = true
    setLoading(true)
    Promise.all([api.getClinic(id), api.getClinicDoctors(id).catch(() => [])])
      .then(([c, docs]) => {
        if (!active) return
        setClinic(c)
        setDoctors(docs)
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [id])

  if (loading) return <div className="container page"><Spinner label="Duke ngarkuar klinikën…" /></div>
  if (error) return <div className="container page"><ErrorBox message={error} /></div>
  if (!clinic) return null

  return (
    <div className="page">
      <div className="detail-hero">
        <div className="container">
          <Link to="/kerko" className="backlink">← Kthehu te kërkimi</Link>
          <div className="detail-hero__row">
            <div className="detail-hero__logo" aria-hidden>{clinic.name.charAt(0)}</div>
            <div>
              <h1>{clinic.name}</h1>
              {clinic.description && <p className="detail-hero__desc">{clinic.description}</p>}
              <div className="detail-hero__meta">
                {clinic.phoneNumber && <span className="chip chip--light">☎ {clinic.phoneNumber}</span>}
                {clinic.email && <span className="chip chip--light">✉ {clinic.email}</span>}
                {clinic.website && <span className="chip chip--light">🌐 {clinic.website}</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container detail-body">
        {clinic.branches.length > 0 && (
          <section className="block">
            <h2 className="block__title">Degët</h2>
            <div className="grid grid--branches">
              {clinic.branches.map((b) => (
                <div key={b.id} className="branch-card">
                  <strong>{b.name}</strong>
                  <span>📍 {b.address}, {b.city}</span>
                  {b.phoneNumber && <span>☎ {b.phoneNumber}</span>}
                </div>
              ))}
            </div>
          </section>
        )}

        {clinic.services.length > 0 && (
          <section className="block">
            <h2 className="block__title">Shërbimet & çmimet</h2>
            <div className="service-list">
              {clinic.services.map((s) => (
                <div key={s.id} className="service-row">
                  <span className="service-row__icon">{specialtyIcon(s.specialtyName)}</span>
                  <div className="service-row__info">
                    <strong>{s.name}</strong>
                    <span>{specialtyLabel(s.specialtyName)} · {s.durationMinutes} min</span>
                  </div>
                  <span className="service-row__price">{formatMoney(s.price, s.currency)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="block">
          <h2 className="block__title">Mjekët</h2>
          {doctors.length ? (
            <div className="grid grid--cards">
              {doctors.map((d) => (
                <DoctorCard key={d.id} doctor={d} />
              ))}
            </div>
          ) : (
            <EmptyState icon="🩺" title="Nuk ka mjekë të listuar" />
          )}
        </section>
      </div>
    </div>
  )
}
