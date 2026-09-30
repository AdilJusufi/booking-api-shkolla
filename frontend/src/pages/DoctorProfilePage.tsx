import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import DoctorPhotoUpload from '../components/DoctorPhotoUpload'
import { ErrorBox, SkeletonRows } from '../components/ui'
import { useDoctorProfile } from '../context/DoctorProfileContext'

export default function DoctorProfilePage() {
  const { t } = useTranslation('doctor')
  const ctx = useDoctorProfile()
  const profile = ctx?.profile

  return (
    <div className="doctor-profile-page">
      <h1 className="doctor-profile-page__title">{t('profile.title')}</h1>

      {ctx?.failed ? (
        <ErrorBox message={t('profile.loadFailed')} onRetry={ctx.reload} />
      ) : !profile ? (
        <SkeletonRows count={1} />
      ) : (
        <section className="card doctor-profile-card">
          <h2 className="doctor-profile-card__heading">{t('profile.photoTitle')}</h2>
          <p className="muted doctor-profile-card__desc">{t('profile.photoDescription')}</p>
          <DoctorPhotoUpload
            doctorId={profile.id}
            firstName={profile.firstName}
            lastName={profile.lastName}
            photoUrl={profile.photoUrl}
            onChange={ctx.setPhotoUrl}
          />
          <Link to={`/mjeku/${profile.id}`} className="link-icon doctor-profile-card__public">
            {t('profile.viewPublic')} <ArrowRight size={14} strokeWidth={1.5} />
          </Link>
        </section>
      )}
    </div>
  )
}
