import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Doctor } from '../lib/types'
import { initials, specialtyIcon, specialtyLabel } from './ui'

export default function DoctorCard({ doctor }: { doctor: Doctor }) {
  const { t } = useTranslation('patient')
  return (
    <Link to={`/mjeku/${doctor.id}`} className="card doctor-card" data-reveal>
      <div className="doctor-card__avatar" aria-hidden>
        {initials(doctor.firstName, doctor.lastName)}
      </div>
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
