import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Building2, Clock, Lock, MapPin, Plus, RotateCw } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import type { AdminClinic, ClinicBranch, Doctor, MedicalService } from '../lib/types'
import { useToast } from '../context/ToastContext'
import { ErrorBox, initials } from '../components/ui'
import { toDateInput } from '../lib/format'
import { useReveal } from '../lib/motion'

interface ClinicCardData {
  clinic: AdminClinic
  address: string
  city: string
  branchCount: number
  serviceCount: number
  doctors: Doctor[]
  todayAppointmentCount: number
}

function ClinicCardSkeleton() {
  return <div className="admin-card skeleton-shimmer" style={{ height: 220 }} data-reveal />
}

export default function MyClinicsPage() {
  const revealRef = useReveal()
  const { notify } = useToast()

  const [clinics, setClinics] = useState<AdminClinic[]>([])
  const [cardData, setCardData] = useState<Record<string, ClinicCardData>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    api
      .getAdminClinics()
      .then((list) => {
        if (!active) return
        setClinics(list)
        const today = toDateInput(new Date())
        list.forEach((c) => {
          Promise.all([
            api.getClinic(c.id).catch(() => null),
            api.getClinicDoctors(c.id).catch(() => [] as Doctor[]),
            api.getClinicReport(c.id, today, today).catch(() => null),
          ]).then(([details, doctors, report]) => {
            if (!active) return
            const branches: ClinicBranch[] = details?.branches ?? []
            const services: MedicalService[] = details?.services ?? []
            setCardData((prev) => ({
              ...prev,
              [c.id]: {
                clinic: c,
                address: branches[0]?.address ?? '',
                city: branches[0]?.city ?? '',
                branchCount: branches.length,
                serviceCount: services.length,
                doctors,
                todayAppointmentCount: report?.totalAppointments ?? 0,
              },
            }))
          })
        })
      })
      .catch((e) => active && setError(e instanceof ApiError ? e.message : 'Ndodhi një gabim.'))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  const pendingClinics = useMemo(() => clinics.filter((c) => !c.isApproved), [clinics])

  function handleAddClinic() {
    notify('Regjistrimi i klinikave të reja bëhet nga stafi i Termini.ks. Kontaktoni administratorin qendror.', 'info')
  }

  if (loading) {
    return (
      <>
        <div className="admin-header">
          <div>
            <h1>Klinikat e mia</h1>
            <p className="admin-header__sub">Zgjidhni klinikën për të menaxhuar stafin, oraret dhe pacientët.</p>
          </div>
        </div>
        <div className="admin-grid">
          {[0, 1, 2, 3].map((i) => <ClinicCardSkeleton key={i} />)}
        </div>
      </>
    )
  }

  if (error) {
    return (
      <>
        <div className="admin-header">
          <div>
            <h1>Klinikat e mia</h1>
            <p className="admin-header__sub">Zgjidhni klinikën për të menaxhuar stafin, oraret dhe pacientët.</p>
          </div>
        </div>
        <ErrorBox message={error} />
      </>
    )
  }

  return (
    <>
      <div className="admin-header">
        <div>
          <h1>Klinikat e mia</h1>
          <p className="admin-header__sub">Zgjidhni klinikën për të menaxhuar stafin, oraret dhe pacientët.</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={handleAddClinic}>
          <Plus size={16} strokeWidth={1.5} /> Regjistro Klinikë të Re
        </button>
      </div>

      {pendingClinics.map((c) => (
        <div className="admin-pending-banner" key={c.id}>
          <Clock size={18} strokeWidth={1.5} />
          <div>
            <div className="admin-pending-banner__title">Kërkesë në pritje</div>
            <div className="admin-pending-banner__body">
              Klinika "{c.name}" është duke u verifikuar nga stafi ynë. Disa funksione mund të jenë të kufizuara derisa të aprovohet.
            </div>
          </div>
        </div>
      ))}

      {clinics.length === 0 ? (
        <div className="admin-empty">
          <Building2 size={48} strokeWidth={1.5} color="var(--line)" />
          <h3>Nuk keni asnjë klinikë të caktuar ende.</h3>
          <p>Kontaktoni administratorin qendror të Termini.ks për t'ju caktuar një klinikë.</p>
        </div>
      ) : (
        <div className="admin-grid" ref={revealRef} data-reveal-root>
          {clinics.map((c) => {
            const data = cardData[c.id]
            if (!data) return <ClinicCardSkeleton key={c.id} />
            return <ClinicCard key={c.id} data={data} />
          })}

          <button type="button" className="admin-add-card" onClick={handleAddClinic} data-reveal>
            <Building2 size={28} strokeWidth={1.5} />
            <span className="admin-add-card__title">Shto një klinikë tjetër</span>
            <span className="admin-add-card__sub">Zgjero rrjetin tënd duke shtuar një lokacion të ri.</span>
          </button>
        </div>
      )}
    </>
  )
}

function ClinicCard({ data }: { data: ClinicCardData }) {
  const { clinic, address, city, branchCount, serviceCount, doctors, todayAppointmentCount } = data
  const isPending = !clinic.isApproved
  const shownDoctors = doctors.slice(0, 4)
  const overflow = doctors.length - shownDoctors.length

  return (
    <div className="admin-card" data-reveal>
      <span className={`admin-card__status ${isPending ? 'admin-card__status--pending' : 'admin-card__status--approved'}`}>
        {isPending ? 'NË PRITJE' : 'APROVUAR'}
      </span>

      <div className="admin-card__top">
        <div className="admin-card__avatar">{initialsFromClinicName(clinic.name)}</div>
        <div>
          <div className="admin-card__name">{clinic.name}</div>
          {(address || city) && (
            <div className="admin-card__address">
              <MapPin size={12} strokeWidth={1.5} /> {[address, city].filter(Boolean).join(', ')}
            </div>
          )}
        </div>
      </div>

      <div className="admin-card__stats">
        <div className="admin-card__stat">
          <span className="admin-card__stat-label">Dega</span>
          <span className="admin-card__stat-value">{branchCount}</span>
        </div>
        <div className="admin-card__stat">
          <span className="admin-card__stat-label">Mjekë</span>
          <span className="admin-card__stat-value">{doctors.length}</span>
        </div>
        <div className="admin-card__stat">
          <span className="admin-card__stat-label">Shërbime</span>
          <span className="admin-card__stat-value">{serviceCount}</span>
        </div>
        <div className="admin-card__stat">
          <span className="admin-card__stat-label">Sot</span>
          <span className="admin-card__stat-value">{todayAppointmentCount}</span>
        </div>
      </div>

      <div className="admin-card__bottom">
        {isPending ? (
          <span className="admin-card__verifying">
            <RotateCw size={13} strokeWidth={1.5} /> Verifikimi vazhdon...
          </span>
        ) : (
          <div className="admin-card__avatars">
            {shownDoctors.map((d) => (
              <span key={d.id} className="admin-card__doctor-avatar" title={`${d.firstName} ${d.lastName}`}>
                {initials(d.firstName, d.lastName)}
              </span>
            ))}
            {overflow > 0 && <span className="admin-card__doctor-overflow">+{overflow}</span>}
          </div>
        )}

        {isPending ? (
          <span className="admin-card__manage admin-card__manage--disabled">
            <Lock size={13} strokeWidth={1.5} /> Menaxho
          </span>
        ) : (
          <Link to={`/admin-panel/klinikat/${clinic.id}`} className="admin-card__manage">
            Menaxho <ArrowRight size={14} strokeWidth={1.5} />
          </Link>
        )}
      </div>
    </div>
  )
}

function initialsFromClinicName(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase()
}
