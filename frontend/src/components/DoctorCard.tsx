import { Link } from 'react-router-dom'
import type { Doctor } from '../lib/types'
import { initials, specialtyIcon, specialtyLabel } from './ui'

export default function DoctorCard({ doctor }: { doctor: Doctor }) {
  return (
    <Link to={`/mjeku/${doctor.id}`} className="card doctor-card">
      <div className="doctor-card__avatar" aria-hidden>
        {initials(doctor.firstName, doctor.lastName)}
      </div>
      <div className="doctor-card__body">
        <h3 className="doctor-card__name">Dr. {doctor.firstName} {doctor.lastName}</h3>
        <div className="doctor-card__specs">
          {doctor.specialties.map((s) => (
            <span key={s} className="chip">
              {specialtyIcon(s)} {specialtyLabel(s)}
            </span>
          ))}
        </div>
        <p className="doctor-card__exp">
          {doctor.yearsOfExperience > 0
            ? `${doctor.yearsOfExperience} vjet përvojë`
            : 'Mjek i licencuar'}
        </p>
      </div>
      <span className="doctor-card__cta">Rezervo →</span>
    </Link>
  )
}
