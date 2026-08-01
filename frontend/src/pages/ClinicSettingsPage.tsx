import { useState } from 'react'
import { Image, Pencil } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import type { UpdateClinicRequest } from '../lib/types'
import { useToast } from '../context/ToastContext'
import { useClinicContext } from '../components/ClinicDetailLayout'
import { ErrorBox } from '../components/ui'

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
          <button
            type="button"
            className="clinic-upload"
            onClick={() => notify('Funksion në zhvillim.', 'info')}
          >
            <Image size={26} strokeWidth={1.5} />
            <span>LOGO E KLINIKËS</span>
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm btn--block"
            onClick={() => notify('Funksion në zhvillim.', 'info')}
          >
            Ndrysho Logon
          </button>
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
