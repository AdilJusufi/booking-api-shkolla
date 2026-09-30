import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Clock, Globe, Mail, MapPin, Phone, Stethoscope } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import type { ClinicDetails, Doctor, MedicalService } from '../lib/types'
import DoctorCard from '../components/DoctorCard'
import { EmptyState, ErrorBox, Modal, Pending, SkeletonDetail, specialtyIcon } from '../components/ui'
import { useSpecialtyLabel } from '../context/SpecialtyNamesContext'
import { formatMoney } from '../lib/format'
import { SITE_NAME, clinicSeo } from '../lib/seo'
import { useSeo } from '../lib/useSeo'

export default function ClinicDetailPage() {
  const { t } = useTranslation('patient')
  const specialtyLabel = useSpecialtyLabel()
  const { id } = useParams<{ id: string }>()
  const [clinic, setClinic] = useState<ClinicDetails | null>(null)
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    if (!id) return
    let active = true
    setLoading(true)
    setError('')
    Promise.all([api.getClinic(id), api.getClinicDoctors(id).catch(() => [])])
      .then(([c, docs]) => {
        if (!active) return
        setClinic(c)
        setDoctors(docs)
      })
      .catch((e) => active && setError(getErrorMessage(e)))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [id])

  useEffect(load, [load])

  const navigate = useNavigate()
  // The public doctor list carries no services, so which doctors offer a given
  // service is resolved on first click from each doctor's profile, then cached.
  const [doctorServiceIds, setDoctorServiceIds] = useState<Map<string, Set<string>> | null>(null)
  const [pendingServiceId, setPendingServiceId] = useState<string | null>(null)
  const [pickFor, setPickFor] = useState<{ service: MedicalService; doctors: Doctor[] } | null>(null)
  const [serviceError, setServiceError] = useState('')

  async function startBooking(service: MedicalService) {
    setServiceError('')
    let byDoctor = doctorServiceIds
    if (!byDoctor) {
      setPendingServiceId(service.id)
      try {
        const details = await Promise.all(doctors.map((d) => api.getDoctor(d.id)))
        byDoctor = new Map(details.map((d) => [d.id, new Set(d.services.map((s) => s.medicalServiceId))]))
        setDoctorServiceIds(byDoctor)
      } catch (e) {
        setServiceError(getErrorMessage(e))
        return
      } finally {
        setPendingServiceId(null)
      }
    }
    const offering = doctors.filter((d) => byDoctor.get(d.id)?.has(service.id))
    if (offering.length === 0) setServiceError(t('clinicDetail.noDoctorForService'))
    else if (offering.length === 1) navigate(bookingPath(offering[0].id, service.id))
    else setPickFor({ service, doctors: offering })
  }

  // An error / unknown id is still served as HTTP 200 (SPA), so it must say noindex itself.
  useSeo(clinic ? clinicSeo(clinic, { t, specialtyLabel }) : error ? { title: SITE_NAME, noindex: true } : null)

  if (loading) return <div className="container page"><SkeletonDetail label={t('clinicDetail.loadingLabel')} /></div>
  if (error) return <div className="container page"><ErrorBox message={error} onRetry={load} /></div>
  if (!clinic) return null

  return (
    <div className="page">
      <div className="detail-hero">
        <div className="container">
          <Link to="/kerko" className="backlink link-icon">
            <ChevronLeft size={16} strokeWidth={1.5} /> {t('clinicDetail.backToSearch')}
          </Link>
          <div className="detail-hero__row">
            <div className="detail-hero__logo" aria-hidden>{clinic.name.charAt(0)}</div>
            <div>
              <h1>{clinic.name}</h1>
              {clinic.description && <p className="detail-hero__desc">{clinic.description}</p>}
              <div className="detail-hero__meta">
                {clinic.phoneNumber && (
                  <span className="chip chip--light">
                    <Phone size={14} strokeWidth={1.5} /> {clinic.phoneNumber}
                  </span>
                )}
                {clinic.email && (
                  <span className="chip chip--light">
                    <Mail size={14} strokeWidth={1.5} /> {clinic.email}
                  </span>
                )}
                {clinic.website && (
                  <span className="chip chip--light">
                    <Globe size={14} strokeWidth={1.5} /> {clinic.website}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container detail-body">
        {clinic.branches.length > 0 && (
          <section className="block">
            <h2 className="block__title">{t('clinicDetail.branchesTitle')}</h2>
            <div className="grid grid--branches">
              {clinic.branches.map((b) => (
                <div key={b.id} className="branch-card">
                  <strong>{b.name}</strong>
                  <span>
                    <MapPin size={14} strokeWidth={1.5} /> {b.address}, {b.city}
                  </span>
                  {b.phoneNumber && (
                    <span>
                      <Phone size={14} strokeWidth={1.5} /> {b.phoneNumber}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {clinic.services.length > 0 && (
          <section className="block">
            <h2 className="block__title">{t('clinicDetail.servicesTitle')}</h2>
            <p className="block__hint">{t('clinicDetail.servicesHint')}</p>
            {serviceError && <p className="block__hint service-list__error" role="alert">{serviceError}</p>}
            <div className="service-list">
              {clinic.services.map((s) => {
                const Icon = specialtyIcon(s.specialtyName)
                return (
                  <button
                    key={s.id}
                    type="button"
                    className="service-row service-row--pick"
                    onClick={() => startBooking(s)}
                    disabled={pendingServiceId !== null}
                    aria-busy={pendingServiceId === s.id}
                  >
                    <span className="service-row__icon"><Icon size={20} strokeWidth={1.5} /></span>
                    <span className="service-row__info">
                      <strong>{s.name}</strong>
                      <span>{specialtyLabel(s.specialtyName)} · <Clock size={12} strokeWidth={1.5} /> {s.durationMinutes} {t('clinicDetail.minutesShort')}</span>
                    </span>
                    <span className="service-row__price">{formatMoney(s.price, s.currency)}</span>
                    <span className="service-row__cta">
                      {pendingServiceId === s.id ? <Pending /> : <>{t('cards.bookCta')} <ChevronRight size={16} strokeWidth={1.75} /></>}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        <section className="block">
          <h2 className="block__title">{t('clinicDetail.doctorsTitle')}</h2>
          {doctors.length ? (
            <div className="grid grid--cards">
              {doctors.map((d) => (
                <DoctorCard key={d.id} doctor={d} />
              ))}
            </div>
          ) : (
            <EmptyState icon={Stethoscope} title={t('clinicDetail.noDoctorsListed')} />
          )}
        </section>
      </div>

      {pickFor && (
        <Modal title={t('clinicDetail.pickDoctorTitle', { service: pickFor.service.name })} onClose={() => setPickFor(null)} size="lg">
          <p className="block__hint">{t('clinicDetail.pickDoctorHint')}</p>
          <div className="grid grid--cards">
            {pickFor.doctors.map((d) => (
              <DoctorCard key={d.id} doctor={d} to={bookingPath(d.id, pickFor.service.id)} />
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}

/** Doctor profile with the service preselected — DoctorDetailPage reads `sherbimi`. */
function bookingPath(doctorId: string, serviceId: string) {
  return `/mjeku/${doctorId}?sherbimi=${encodeURIComponent(serviceId)}`
}
