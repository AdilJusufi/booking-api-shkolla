import { Link } from 'react-router-dom'
import type { Clinic } from '../lib/types'

export default function ClinicCard({ clinic }: { clinic: Clinic }) {
  return (
    <Link to={`/klinika/${clinic.id}`} className="card clinic-card">
      <div className="clinic-card__banner" aria-hidden>
        <span>{clinic.name.charAt(0)}</span>
      </div>
      <div className="clinic-card__body">
        <h3 className="clinic-card__name">{clinic.name}</h3>
        {clinic.description && <p className="clinic-card__desc">{clinic.description}</p>}
        <div className="clinic-card__meta">
          {clinic.cities.length > 0 && (
            <span className="chip chip--soft">📍 {clinic.cities.join(', ')}</span>
          )}
          {clinic.phoneNumber && <span className="chip chip--soft">☎ {clinic.phoneNumber}</span>}
        </div>
        <span className="clinic-card__cta">Shiko klinikën →</span>
      </div>
    </Link>
  )
}
