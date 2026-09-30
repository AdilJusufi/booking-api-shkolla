import { useState } from 'react'
import { doctorPhotoUrl } from '../lib/cloudinary'
import { initials } from './ui'

interface DoctorAvatarProps {
  firstName: string
  lastName: string
  photoUrl?: string | null
  /** Klasa ekzistuese e vendit (p.sh. "doctor-card__avatar") — madhësia dhe forma vijnë prej saj. */
  className: string
  /** Madhësia në ekran në px, që Cloudinary të kthejë një imazh të vogël, jo origjinalin. */
  displayPx: number
  as?: 'div' | 'span'
}

/**
 * Fotoja e mjekut, ose inicialet kur s'ka foto ose kur imazhi s'ngarkohet (p.sh. u fshi
 * nga Cloudinary). Dekorative: emri i mjekut është gjithmonë pranë saj në tekst.
 */
export default function DoctorAvatar({ firstName, lastName, photoUrl, className, displayPx, as = 'div' }: DoctorAvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const showPhoto = Boolean(photoUrl) && failedUrl !== photoUrl
  const Tag = as

  return (
    <Tag className={`${className}${showPhoto ? ' avatar--photo' : ''}`} aria-hidden>
      {showPhoto && photoUrl ? (
        <img
          className="avatar__img"
          src={doctorPhotoUrl(photoUrl, displayPx)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailedUrl(photoUrl)}
        />
      ) : (
        initials(firstName, lastName)
      )}
    </Tag>
  )
}
