import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Doctor } from '../lib/types'
import { specialtyIcon } from './ui'
import DoctorAvatar from './DoctorAvatar'
import { useSpecialtyLabel } from '../context/SpecialtyNamesContext'

/** `to` overrides the default profile link, e.g. to carry a preselected service. */
export default function DoctorCard({ doctor, to }: { doctor: Doctor; to?: string }) {
  const { t } = useTranslation('patient')
  const specialtyLabel = useSpecialtyLabel()
  return (
    <Link to={to ?? `/mjeku/${doctor.id}`} className="card doctor-card" data-reveal>
      <DoctorAvatar
        className="doctor-card__avatar"
        firstName={doctor.firstName}
        lastName={doctor.lastName}
        photoUrl={doctor.photoUrl}
        displayPx={56}
      />
      <div className="doctor-card__body">
        <h3 className="doctor-card__name">Dr. {doctor.firstName} {doctor.lastName}</h3>
        <div className="doctor-card__specs">
          {doctor.specialties.map((s) => {
            const Icon = specialtyIcon(s)
            return (
              <span key={s} className="chip">
                <Icon size={14} strokeWidth={1.5} /> {specialtyLabel(s)}
              </span>
            )
          })}
        </div>
        <p className="doctor-card__exp">
          {doctor.yearsOfExperience > 0
            ? t('home.doctorsSection.experienceYears', { count: doctor.yearsOfExperience })
            : t('home.doctorsSection.licensedDoctor')}
        </p>
      </div>
      <span className="doctor-card__cta">
        {t('cards.bookCta')} <ArrowRight size={16} strokeWidth={1.5} />
      </span>
    </Link>
  )
}
