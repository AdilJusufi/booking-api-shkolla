import { useRef, useState } from 'react'
import { Image, Loader2, Pencil, X } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import type { UpdateClinicRequest } from '../lib/types'
import { useToast } from '../context/ToastContext'
import { useClinicContext } from '../components/ClinicDetailLayout'
import { ErrorBox } from '../components/ui'

const LOGO_ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
const LOGO_MAX_BYTES = 2 * 1024 * 1024
const LOGO_MIN_DIMENSION = 200

/** Fut një transformim Cloudinary (f_auto,q_auto + madhësi) menjëherë pas "/upload/". */
function cloudinaryDisplayUrl(url: string, transform: string): string {
  return url.includes('/upload/') ? url.replace('/upload/', `/upload/${transform}/`) : url
}

function readImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  if (file.type === 'image/svg+xml') return Promise.resolve(null)
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(null)
    }
    img.src = objectUrl
  })
}

interface FormState {
  name: string
  email: string
  phoneNumber: string
  website: string
  description: string
}

export default function ClinicSettingsPage() {
  const { clinic, refresh } = useClinicContext()
  const { notify } = useToast()

  const [isEditing, setIsEditing] = useState(false)
  const [form, setForm] = useState<FormState>(() => toForm())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  function toForm(): FormState {
    return {
      name: clinic.name,
      email: clinic.email ?? '',
      phoneNumber: clinic.phoneNumber ?? '',
      website: clinic.website ?? '',
      description: clinic.description ?? '',
    }
  }

  function startEditing() {
    setForm(toForm())
    setFormError('')
    setIsEditing(true)
  }

  function cancelEditing() {
    setForm(toForm())
    setFormError('')
    setIsEditing(false)
  }

  function updateField(key: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    if (form.name.trim().length < 2) {
      setFormError('Emri i klinikës është i detyrueshëm.')
      return
    }
    setFormError('')
    setSaving(true)
    const payload: UpdateClinicRequest = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      phoneNumber: form.phoneNumber.trim() || undefined,
      email: form.email.trim() || undefined,
      website: form.website.trim() || undefined,
    }
    try {
      await api.updateClinic(clinic.id, payload)
      notify('Ndryshimet u ruajtën.', 'ok')
      setIsEditing(false)
      refresh()
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Gabim. Provoni përsëri.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="clinic-settings">
      <div className="admin-card clinic-settings__main">
        <div className="clinic-settings__card-head">
          <h2>Informacioni Bazë</h2>
          {!isEditing && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={startEditing}>
              <Pencil size={14} strokeWidth={1.5} /> Ndrysho
            </button>
          )}
        </div>

        {formError && <ErrorBox message={formError} />}

        <div className="clinic-settings__grid">
          <SettingsField
            label="Emri i klinikës"
            editing={isEditing}
            value={clinic.name}
            input={<input type="text" value={form.name} onChange={(e) => updateField('name', e.target.value)} />}
          />
          <SettingsField
            label="Email-i i kontaktit"
            editing={isEditing}
            value={clinic.email || '—'}
            input={<input type="email" value={form.email} onChange={(e) => updateField('email', e.target.value)} />}
          />
          <SettingsField
            label="Telefoni"
            editing={isEditing}
            value={clinic.phoneNumber || '—'}
            input={<input type="tel" value={form.phoneNumber} onChange={(e) => updateField('phoneNumber', e.target.value)} />}
          />
          <SettingsField
            label="Website"
            editing={isEditing}
            value={clinic.website || '—'}
            input={<input type="url" value={form.website} onChange={(e) => updateField('website', e.target.value)} />}
          />
        </div>

        <SettingsField
          label="Përshkrimi"
          editing={isEditing}
          value={clinic.description || '—'}
          input={
            <textarea rows={4} value={form.description} onChange={(e) => updateField('description', e.target.value)} />
          }
        />

        {isEditing && (
          <div className="clinic-settings__actions">
            <button type="button" className="btn btn--primary btn--sm" disabled={saving} onClick={handleSave}>
              {saving ? 'Duke ruajtur…' : 'Ruaj'}
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={cancelEditing}>Anulo</button>
          </div>
        )}
      </div>

      <div className="clinic-settings__side">
        <div className="admin-card">
          <h2 className="clinic-settings__card-title">Branding</h2>
          <ClinicLogoUpload />
        </div>

        <div className="admin-card clinic-danger">
          <h2 className="clinic-danger__title">Zona e rrezikut</h2>
          <p className="clinic-danger__text">
            Çaktivizimi i klinikës do të fshijë të gjitha të dhënat e pacientëve dhe mjekëve përgjithmonë.
          </p>
          <button
            type="button"
            className="clinic-danger__btn"
            disabled
            title="Çaktivizimi kryhet vetëm nga stafi qendror i Termini.ks"
          >
            Çaktivizo Klinikën
          </button>
          <p className="clinic-danger__note">
            Çaktivizimi kryhet vetëm nga stafi qendror i Termini.ks. Kontaktoni administratorin qendror.
          </p>
        </div>
      </div>

    </div>
  )
}

function ClinicLogoUpload() {
  const { clinic, refresh } = useClinicContext()
  const { notify } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)

  const savedLogo = clinic.logoUrl ? cloudinaryDisplayUrl(clinic.logoUrl, 'f_auto,q_auto,w_144,h_144,c_fill,g_auto') : null
  const displayUrl = preview ?? savedLogo

  function openFilePicker() {
    if (uploading) return
    fileInputRef.current?.click()
  }

  function currentClinicPayload(overrides: Partial<UpdateClinicRequest> = {}): UpdateClinicRequest {
    return {
      name: clinic.name,
      description: clinic.description,
      phoneNumber: clinic.phoneNumber,
      email: clinic.email,
      website: clinic.website,
      logoUrl: clinic.logoUrl,
      ...overrides,
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    if (!LOGO_ACCEPTED_TYPES.includes(file.type)) {
      notify('Formati i skedarit nuk mbështetet. Përdorni PNG, JPEG, SVG ose WEBP.', 'error')
      return
    }
    if (file.size > LOGO_MAX_BYTES) {
      notify('Skedari është shumë i madh. Madhësia maksimale është 2MB.', 'error')
      return
    }
    const dimensions = await readImageDimensions(file)
    if (dimensions && (dimensions.width < LOGO_MIN_DIMENSION || dimensions.height < LOGO_MIN_DIMENSION)) {
      notify(`Imazhi duhet të jetë së paku ${LOGO_MIN_DIMENSION}x${LOGO_MIN_DIMENSION}px.`, 'error')
      return
    }

    const localPreview = URL.createObjectURL(file)
    setPreview(localPreview)
    setUploading(true)

    try {
      const signature = await api.getClinicUploadSignature(clinic.id)

      const formData = new FormData()
      formData.append('file', file)
      formData.append('api_key', signature.apiKey)
      formData.append('timestamp', String(signature.timestamp))
      formData.append('signature', signature.signature)
      formData.append('folder', signature.folder)

      const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`, {
        method: 'POST',
        body: formData,
      })
      if (!uploadRes.ok) throw new Error('Cloudinary upload failed')
      const uploaded = (await uploadRes.json()) as { secure_url: string }

      await api.updateClinic(clinic.id, currentClinicPayload({ logoUrl: uploaded.secure_url }))
      notify('Logo u ngarkua me sukses.', 'ok')
      refresh()
    } catch {
      notify('Ngarkimi dështoi. Provoni përsëri.', 'error')
    } finally {
      URL.revokeObjectURL(localPreview)
      setPreview(null)
      setUploading(false)
    }
  }

  async function handleRemove() {
    if (uploading) return
    setUploading(true)
    try {
      await api.updateClinic(clinic.id, currentClinicPayload({ logoUrl: undefined }))
      notify('Logo u hoq.', 'ok')
      refresh()
    } catch {
      notify('Gabim. Provoni përsëri.', 'error')
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={LOGO_ACCEPTED_TYPES.join(',')}
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      <button type="button" className="clinic-upload" onClick={openFilePicker} disabled={uploading}>
        {displayUrl ? (
          <div className="clinic-upload__preview">
            <img src={displayUrl} alt="Logo e klinikës" />
            {uploading && (
              <div className="clinic-upload__spinner">
                <Loader2 size={22} strokeWidth={1.5} className="clinic-upload__spin" />
              </div>
            )}
          </div>
        ) : uploading ? (
          <Loader2 size={26} strokeWidth={1.5} className="clinic-upload__spin" />
        ) : (
          <>
            <Image size={26} strokeWidth={1.5} />
            <span>LOGO E KLINIKËS</span>
          </>
        )}
      </button>
      {clinic.logoUrl ? (
        <button type="button" className="btn btn--ghost btn--sm btn--block" onClick={handleRemove} disabled={uploading}>
          <X size={14} strokeWidth={1.5} /> Hiq Logon
        </button>
      ) : (
        <button type="button" className="btn btn--ghost btn--sm btn--block" onClick={openFilePicker} disabled={uploading}>
          Ngarko Logon
        </button>
      )}
    </>
  )
}

function SettingsField({
  label,
  editing,
  value,
  input,
}: {
  label: string
  editing: boolean
  value: string
  input: React.ReactNode
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {editing ? input : <div className="clinic-settings__readonly">{value}</div>}
    </div>
  )
}
