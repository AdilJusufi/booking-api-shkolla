import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useOutletContext, useParams } from 'react-router-dom'
import { ArrowLeft, BarChart3, Building2, Globe, MapPin, Phone, Settings, Stethoscope, User } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import type { AdminClinicDetail } from '../lib/types'
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
  const { t } = useTranslation('admin')
  const { id } = useParams<{ id: string }>()
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
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(load, [load])

  useEffect(() => {
    setTrail(clinic ? [t('clinicDetail.breadcrumbClinics'), t('clinicDetail.breadcrumbClinicName', { name: clinic.name })] : [t('clinicDetail.breadcrumbClinics')])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinic, setTrail])

  if (loading) return <SkeletonDetail label={t('clinicDetail.loadingLabel')} />

  if (error || !clinic) {
    return (
      <>
        <ErrorBox message={error || t('clinicDetail.notFound')} onRetry={load} />
        <Link to="/admin-panel/klinikat" className="admin-back-link"><ArrowLeft size={14} strokeWidth={1.5} /> {t('clinicDetail.backToClinicsLink')}</Link>
      </>
    )
  }

  const tabs = [
    { to: `/admin-panel/klinikat/${clinic.id}`, end: true, icon: Settings, label: t('clinicDetail.tabSettings') },
    { to: `/admin-panel/klinikat/${clinic.id}/deget`, end: false, icon: Building2, label: t('clinicDetail.tabBranches') },
    { to: `/admin-panel/klinikat/${clinic.id}/sherbimet`, end: false, icon: Stethoscope, label: t('clinicDetail.tabServices') },
    { to: `/admin-panel/klinikat/${clinic.id}/mjeket`, end: false, icon: User, label: t('clinicDetail.tabDoctors') },
    { to: `/admin-panel/klinikat/${clinic.id}/raporti`, end: false, icon: BarChart3, label: t('clinicDetail.tabReport') },
  ]

  return (
    <>
      <div className="clinic-header">
        <div className="clinic-header__logo" aria-hidden>
          <Building2 size={26} strokeWidth={1.5} />
        </div>

        <div className="clinic-header__main">
          <div className="clinic-header__title-row">
            <h1>{t('clinicDetail.titlePrefix', { name: clinic.name })}</h1>
            <span className={`clinic-header__status ${clinic.isApproved ? 'is-approved' : 'is-pending'}`}>
              {clinic.isApproved ? t('clinicDetail.statusPublished') : t('clinicDetail.statusPending')}
            </span>
          </div>
          <div className="clinic-header__meta">
            {clinic.city && <span><MapPin size={13} strokeWidth={1.5} /> {clinic.city}, {t('clinicDetail.countrySuffix')}</span>}
            {clinic.phoneNumber && <span><Phone size={13} strokeWidth={1.5} /> {clinic.phoneNumber}</span>}
            {clinic.website && <span><Globe size={13} strokeWidth={1.5} /> {clinic.website}</span>}
          </div>
        </div>

        <div className="clinic-header__actions">
          <Link to={`/klinika/${clinic.id}`} className="btn btn--ghost btn--sm">{t('clinicDetail.viewProfileCta')}</Link>
        </div>
      </div>

      <nav className="clinic-tabs">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) => `clinic-tab ${isActive ? 'is-active' : ''}`}
          >
            <tab.icon size={16} strokeWidth={1.5} /> {tab.label}
          </NavLink>
        ))}
      </nav>

      <Outlet context={{ clinic, refresh: load } satisfies ClinicOutletContext} />
    </>
  )
}
