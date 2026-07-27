import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useOutletContext, useParams } from 'react-router-dom'
import { ArrowLeft, Building2, Globe, MapPin, Phone, Plus, Settings, Stethoscope, User } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import type { AdminClinicDetail } from '../lib/types'
import { useToast } from '../context/ToastContext'
import { useAdminBreadcrumb } from '../context/AdminBreadcrumbContext'
import { ErrorBox, SkeletonDetail } from './ui'

interface ClinicOutletContext {
  clinic: AdminClinicDetail
  refresh: () => void
}

// eslint-disable-next-line react-refresh/only-export-components
export function useClinicContext(): ClinicOutletContext {
  return useOutletContext<ClinicOutletContext>()
}

export default function ClinicDetailLayout() {
  const { id } = useParams<{ id: string }>()
  const { notify } = useToast()
  const { setTrail } = useAdminBreadcrumb()

  const [clinic, setClinic] = useState<AdminClinicDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    if (!id) return
    setLoading(true)
    setError('')
    api
      .getAdminClinicDetail(id)
      .then(setClinic)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Ndodhi një gabim.'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(load, [load])

  useEffect(() => {
    setTrail(clinic ? ['Klinikat', `Klinika "${clinic.name}"`] : ['Klinikat'])
    return () => setTrail([])
  }, [clinic, setTrail])

  if (loading) return <SkeletonDetail label="Duke ngarkuar klinikën" />

  if (error || !clinic) {
    return (
      <>
        <ErrorBox message={error || 'Klinika nuk u gjet.'} />
        <Link to="/admin-panel/klinikat" className="admin-back-link"><ArrowLeft size={14} strokeWidth={1.5} /> Kthehu te klinikat</Link>
      </>
    )
  }

  const tabs = [
    { to: `/admin-panel/klinikat/${clinic.id}`, end: true, icon: Settings, label: 'Cilësimet' },
    { to: `/admin-panel/klinikat/${clinic.id}/deget`, end: false, icon: Building2, label: 'Degët' },
    { to: `/admin-panel/klinikat/${clinic.id}/sherbimet`, end: false, icon: Stethoscope, label: 'Shërbimet' },
    { to: `/admin-panel/klinikat/${clinic.id}/mjeket`, end: false, icon: User, label: 'Mjekët' },
  ]

  return (
    <>
      <div className="clinic-header">
        <div className="clinic-header__logo" aria-hidden>
          <Building2 size={26} strokeWidth={1.5} />
        </div>

        <div className="clinic-header__main">
          <div className="clinic-header__title-row">
            <h1>Klinika "{clinic.name}"</h1>
            <span className={`clinic-header__status ${clinic.isApproved ? 'is-approved' : 'is-pending'}`}>
              {clinic.isApproved ? 'PUBLIKUAR' : 'NË PRITJE'}
            </span>
          </div>
          <div className="clinic-header__meta">
            {clinic.city && <span><MapPin size={13} strokeWidth={1.5} /> {clinic.city}, Kosovë</span>}
            {clinic.phoneNumber && <span><Phone size={13} strokeWidth={1.5} /> {clinic.phoneNumber}</span>}
            {clinic.website && <span><Globe size={13} strokeWidth={1.5} /> {clinic.website}</span>}
          </div>
        </div>

        <div className="clinic-header__actions">
          <Link to={`/klinika/${clinic.id}`} className="btn btn--ghost btn--sm">Shiko Profilin</Link>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => notify('Funksion në zhvillim.', 'info')}
          >
            <Plus size={15} strokeWidth={1.5} /> Termini i Ri
          </button>
        </div>
      </div>

      <nav className="clinic-tabs">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) => `clinic-tab ${isActive ? 'is-active' : ''}`}
          >
            <t.icon size={16} strokeWidth={1.5} /> {t.label}
          </NavLink>
        ))}
      </nav>

      <Outlet context={{ clinic, refresh: load } satisfies ClinicOutletContext} />
    </>
  )
}
