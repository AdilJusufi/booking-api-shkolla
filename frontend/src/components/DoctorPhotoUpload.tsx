import { useEffect, useRef, useState } from 'react'
import { Camera, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { uploadSignedImage } from '../lib/cloudinary'
import { getUploadErrorMessage } from '../lib/errors'
import { useToast } from '../context/ToastContext'
import DoctorAvatar from './DoctorAvatar'

/** I njëjti kufi si backend-i (DoctorPhotoService) — ky kontroll ekziston për mesazhin e qartë para ngarkimit. */
export const PHOTO_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024

interface DoctorPhotoUploadProps {
  doctorId: string
  firstName: string
  lastName: string
  photoUrl?: string | null
  /** Thirret pasi serveri e ruajti ndryshimin — prindi përditëson listën/header-in pa rifreskim. */
  onChange: (photoUrl: string | null) => void
}

/**
 * Ngarkimi i fotos së mjekut: nënshkrim nga API-ja → ngarkim direkt te Cloudinary → ruajtje
 * e URL-së. `accept` pa `capture`, që në celular sistemi të ofrojë si kamerën ashtu edhe galerinë.
 */
export default function DoctorPhotoUpload({ doctorId, firstName, lastName, photoUrl, onChange }: DoctorPhotoUploadProps) {
  const { t } = useTranslation('common')
  const { notify } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview)
  }, [preview])

  function openPicker() {
    if (busy) return
    inputRef.current?.click()
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')

    if (!PHOTO_ACCEPTED_TYPES.includes(file.type)) {
      setError(t('photoUpload.wrongType'))
      return
    }
    if (file.size > PHOTO_MAX_BYTES) {
      setError(t('photoUpload.tooLarge'))
      return
    }

    setPreview(URL.createObjectURL(file))
    setBusy('upload')
    try {
      const signature = await api.getDoctorPhotoUploadSignature(doctorId)
      const uploadedUrl = await uploadSignedImage(signature, file)
      const saved = await api.setDoctorPhoto(doctorId, uploadedUrl)
      onChange(saved.photoUrl ?? null)
      notify(t('photoUpload.uploadedToast'), 'ok')
    } catch (err) {
      setError(getUploadErrorMessage(err))
    } finally {
      setPreview(null)
      setBusy(null)
    }
  }

  async function handleRemove() {
    if (busy) return
    setError('')
    setBusy('remove')
    try {
      await api.setDoctorPhoto(doctorId, null)
      onChange(null)
      notify(t('photoUpload.removedToast'), 'ok')
    } catch (err) {
      setError(getUploadErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="photo-upload">
      <input
        ref={inputRef}
        type="file"
        accept={PHOTO_ACCEPTED_TYPES.join(',')}
        hidden
        data-testid="doctor-photo-input"
        onChange={handleFile}
      />
      <button
        type="button"
        className="photo-upload__avatar"
        onClick={openPicker}
        disabled={busy !== null}
        aria-label={photoUrl ? t('photoUpload.change') : t('photoUpload.upload')}
      >
        {preview ? (
          <span className="photo-upload__circle avatar--photo" aria-hidden>
            <img className="avatar__img" src={preview} alt="" />
          </span>
        ) : (
          <DoctorAvatar
            as="span"
            className="photo-upload__circle"
            firstName={firstName}
            lastName={lastName}
            photoUrl={photoUrl}
            displayPx={112}
          />
        )}
        {busy === 'upload' ? (
          <span className="photo-upload__overlay" role="status" aria-label={t('photoUpload.uploading')}>
            <Loader2 size={24} strokeWidth={1.5} className="clinic-upload__spin" />
          </span>
        ) : (
          <span className="photo-upload__badge" aria-hidden>
            <Camera size={14} strokeWidth={1.75} />
          </span>
        )}
      </button>

      <div className="photo-upload__side">
        <div className="photo-upload__actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={openPicker} disabled={busy !== null}>
            {photoUrl ? t('photoUpload.change') : t('photoUpload.upload')}
          </button>
          {photoUrl && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={handleRemove} disabled={busy !== null}>
              {busy === 'remove' ? <Loader2 size={14} strokeWidth={1.5} className="clinic-upload__spin" /> : null}
              {t('photoUpload.remove')}
            </button>
          )}
        </div>
        <p className="photo-upload__hint">{t('photoUpload.hint')}</p>
        {error && (
          <p className="photo-upload__error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
