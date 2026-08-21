import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Calendar,
  CalendarCheck,
  CheckCircle,
  Lock,
  Mail,
  Shield,
  Users,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api, ApiError } from '../lib/api'
import { getErrorMessage, getFieldErrors } from '../lib/errors'
import { AppointmentStatus } from '../lib/types'
import type { Gender, PatientProfile } from '../lib/types'
import { useToast } from '../context/ToastContext'
import { CustomSelect, ErrorBox, initials } from '../components/ui'
import type { CustomSelectOption } from '../components/ui'
import { monthName } from '../lib/format'

const KNOWN_PROFILE_FIELDS = new Set(['firstName', 'lastName', 'phoneNumber', 'address', 'city', 'dateOfBirth', 'gender'])

const ACTIVE_STATUSES = [
  AppointmentStatus.Pending,
  AppointmentStatus.Confirmed,
  AppointmentStatus.CheckedIn,
  AppointmentStatus.InProgress,
]

function formatDob(iso: string | undefined, unset: string): string {
  if (!iso) return unset
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return iso
  return `${Number(m[3])} ${monthName(Number(m[2]) - 1).toLowerCase()} ${m[1]}`
}

interface FormData {
  firstName: string
  lastName: string
  phoneNumber: string
  address: string
  city: string
  dateOfBirth: string
  gender: string
}

function toForm(p: PatientProfile): FormData {
  return {
    firstName: p.firstName,
    lastName: p.lastName,
    phoneNumber: p.phoneNumber ?? '',
    address: p.address ?? '',
    city: p.city ?? '',
    dateOfBirth: p.dateOfBirth ?? '',
    gender: p.gender ? String(p.gender) : '',
  }
}

function ProfileSkeleton() {
  return (
    <div className="profile-page">
      <div className="card skeleton-shimmer" style={{ height: 110, marginBottom: 20 }} />
      <div className="stats-row">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card skeleton-shimmer" style={{ height: 72, flex: 1, minWidth: 160 }} />
        ))}
      </div>
      <div className="profile-layout">
        <div className="card skeleton-shimmer" style={{ height: 420 }} />
        <div>
          <div className="card skeleton-shimmer" style={{ height: 180, marginBottom: 14 }} />
          <div className="card skeleton-shimmer" style={{ height: 160 }} />
        </div>
      </div>
    </div>
  )
}

export default function MyProfilePage() {
  const { t } = useTranslation('patient')
  const { t: tCommon } = useTranslation('common')
  const navigate = useNavigate()
  const { notify } = useToast()

  const GENDER_OPTIONS: CustomSelectOption[] = [
    { value: '', label: t('profile.genderPlaceholder') },
    { value: '1', label: t('profile.genderMale') },
    { value: '2', label: t('profile.genderFemale') },
    { value: '3', label: t('profile.genderOther') },
  ]

  function genderLabel(gender: Gender | undefined): string {
    switch (gender) {
      case 1:
        return t('profile.genderMale')
      case 2:
        return t('profile.genderFemale')
      case 3:
        return t('profile.genderOther')
      default:
        return t('profile.unsetValue')
    }
  }

  const [profile, setProfile] = useState<PatientProfile | null>(null)
  const [dependentsCount, setDependentsCount] = useState(0)
  const [totalAppointments, setTotalAppointments] = useState(0)
  const [activeAppointments, setActiveAppointments] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState<FormData | null>(null)
  const [saving, setSaving] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [genderSelectOpen, setGenderSelectOpen] = useState(false)

  const formRef = useRef<HTMLDivElement>(null)

  const load = useCallback(() => {
    let active = true
    setLoading(true)
    setError('')

    Promise.all([
      api.getMyProfile(),
      api.getDependents().catch(() => []),
      api.getMyAppointments({ page: 1, pageSize: 1 }).catch(() => null),
      api.getMyAppointments({ page: 1, pageSize: 200 }).catch(() => null),
    ])
      .then(([p, deps, firstPage, allPage]) => {
        if (!active) return
        setProfile(p)
        setFormData(toForm(p))
        setDependentsCount(deps.length)
        setTotalAppointments(firstPage?.totalItems ?? allPage?.items.length ?? 0)
        if (allPage) {
          setActiveAppointments(allPage.items.filter((a) => ACTIVE_STATUSES.includes(a.status)).length)
        }
      })
      .catch((e) => {
        if (!active) return
        if (e instanceof ApiError && e.status === 401) {
          navigate('/hyr', { state: { from: '/llogaria' } })
          return
        }
        setError(getErrorMessage(e))
      })
      .finally(() => active && setLoading(false))

    return () => {
      active = false
    }
  }, [navigate])

  useEffect(load, [load])

  const memberSince = useMemo(() => {
    // The patient profile DTO has no createdAt; omitted rather than fabricated.
    return null
  }, [])

  function startEditing() {
    if (profile) setFormData(toForm(profile))
    setFieldErrors({})
    setIsEditing(true)
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  function cancelEditing() {
    if (profile) setFormData(toForm(profile))
    setFieldErrors({})
    setIsEditing(false)
  }

  function updateField(key: keyof FormData, value: string) {
    setFormData((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  function validate(data: FormData): Record<string, string> {
    const errs: Record<string, string> = {}
    if (data.firstName.trim().length < 2) errs.firstName = t('profile.validation.firstNameTooShort')
    if (data.lastName.trim().length < 2) errs.lastName = t('profile.validation.lastNameTooShort')
    if (!data.phoneNumber.trim()) errs.phoneNumber = t('profile.validation.phoneRequired')
    if (!data.dateOfBirth) errs.dateOfBirth = t('profile.validation.dobRequired')
    if (!data.gender) errs.gender = t('profile.validation.genderRequired')
    return errs
  }

  async function handleSave() {
    if (!formData) return
    const errs = validate(formData)
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs)
      return
    }
    setFieldErrors({})
    setSaving(true)
    try {
      const updated = await api.updateMyProfile({
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        phoneNumber: formData.phoneNumber.trim(),
        dateOfBirth: formData.dateOfBirth,
        gender: Number(formData.gender) as Gender,
        address: formData.address.trim() || undefined,
        city: formData.city.trim() || undefined,
      })
      setProfile(updated)
      setFormData(toForm(updated))
      setIsEditing(false)
      notify(t('profile.updatedToast'), 'ok')
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        navigate('/hyr')
        return
      }
      const backendFieldErrors = getFieldErrors(e)
      if (backendFieldErrors) {
        const matched: Record<string, string> = {}
        let hasUnmatched = false
        for (const [field, message] of Object.entries(backendFieldErrors)) {
          if (KNOWN_PROFILE_FIELDS.has(field)) matched[field] = message
          else hasUnmatched = true
        }
        if (Object.keys(matched).length > 0) setFieldErrors((prev) => ({ ...prev, ...matched }))
        // A field name with no matching input would otherwise be silently dropped.
        if (hasUnmatched || Object.keys(matched).length === 0) {
          notify(getErrorMessage(e, { 400: t('profile.invalidDataToast') }), 'error')
        }
        return
      }
      notify(getErrorMessage(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <ProfileSkeleton />
  if (error || !profile || !formData) {
    return (
      <div className="apptdetail-notfound">
        <h2>{t('profile.loadFailedTitle')}</h2>
        <ErrorBox message={error || t('profile.loadFailedFallback')} onRetry={load} />
      </div>
    )
  }

  return (
    <div className="profile-page">
      {/* Hero card */}
      <div className="card profile-hero">
        <div className="profile-hero__avatar-col">
          <div className="profile-hero__avatar">{initials(profile.firstName, profile.lastName)}</div>
          <button
            type="button"
            className="profile-hero__photo-link"
            onClick={() => notify(t('profile.photoComingSoon'), 'info')}
          >
            {t('profile.changePhoto')}
          </button>
        </div>

        <div className="profile-hero__center">
          <div className="profile-hero__name-row">
            <span className="profile-hero__name">{profile.firstName} {profile.lastName}</span>
            <span className="profile-hero__role">{t('profile.roleBadge')}</span>
          </div>
          <div className="profile-hero__meta">
            <span><Mail size={14} strokeWidth={1.5} color="var(--muted)" /> {profile.email}</span>
            {memberSince && (
              <span><Calendar size={14} strokeWidth={1.5} color="var(--muted)" /> {t('profile.memberSince', { date: memberSince })}</span>
            )}
          </div>
        </div>

        <button type="button" className="btn btn--ghost btn--sm profile-hero__edit" onClick={startEditing}>
          {t('profile.editCta')} <ArrowRight size={14} strokeWidth={1.5} />
        </button>
      </div>

      {/* Stats row */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-card__icon" style={{ background: 'var(--primary-050)' }}>
            <Calendar size={20} strokeWidth={1.5} color="var(--primary)" />
          </div>
          <div>
            <div className="stat-card__count" style={{ color: 'var(--primary)' }}>{totalAppointments}</div>
            <div className="stat-card__label">{t('profile.statTotalAppointments')}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card__icon" style={{ background: 'var(--ok-bg)' }}>
            <CalendarCheck size={20} strokeWidth={1.5} color="var(--ok)" />
          </div>
          <div>
            <div className="stat-card__count" style={{ color: 'var(--ok)' }}>{activeAppointments}</div>
            <div className="stat-card__label">{t('profile.statActiveAppointments')}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card__icon" style={{ background: 'var(--primary-050)' }}>
            <Users size={20} strokeWidth={1.5} color="var(--primary)" />
          </div>
          <div>
            <div className="stat-card__count" style={{ color: 'var(--primary)' }}>{dependentsCount}</div>
            <div className="stat-card__label">{t('profile.statFamilyMembers')}</div>
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="profile-layout">
        {/* Personal info form */}
        <div className="card profile-form" ref={formRef}>
          <div className="profile-form__header">
            <h2 className="profile-form__title">{t('profile.personalInfoTitle')}</h2>
            {isEditing ? (
              <div className="profile-form__actions">
                <button type="button" className="btn btn--primary btn--sm" disabled={saving} onClick={handleSave}>
                  {saving ? t('profile.saving') : t('profile.saveChanges')}
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={cancelEditing}>{tCommon('buttons.cancel')}</button>
              </div>
            ) : (
              <button type="button" className="btn btn--ghost btn--sm" onClick={startEditing}>{t('profile.editCta')}</button>
            )}
          </div>

          <div className="form-row">
            <ProfileField label={t('profile.firstNameLabel')} editing={isEditing} value={profile.firstName} error={fieldErrors.firstName}>
              <input type="text" required minLength={2} value={formData.firstName} onChange={(e) => updateField('firstName', e.target.value)} />
            </ProfileField>
            <ProfileField label={t('profile.lastNameLabel')} editing={isEditing} value={profile.lastName} error={fieldErrors.lastName}>
              <input type="text" required minLength={2} value={formData.lastName} onChange={(e) => updateField('lastName', e.target.value)} />
            </ProfileField>
          </div>

          <div className="field">
            <label>{t('profile.emailLabel')}</label>
            <div className="profile-field__readonly profile-field__readonly--locked">{profile.email}</div>
            <span className="profile-field__note">{t('profile.emailImmutableNote')}</span>
          </div>

          <div className="form-row">
            <ProfileField label={t('profile.phoneLabel')} editing={isEditing} value={profile.phoneNumber || t('profile.unsetValue')} error={fieldErrors.phoneNumber}>
              <input type="tel" placeholder="+383 44 000 000" value={formData.phoneNumber} onChange={(e) => updateField('phoneNumber', e.target.value)} />
            </ProfileField>
            <div />
          </div>

          <ProfileField label={t('profile.addressLabel')} editing={isEditing} value={profile.address || t('profile.unsetValue')}>
            <input type="text" placeholder={t('profile.addressPlaceholder')} value={formData.address} onChange={(e) => updateField('address', e.target.value)} />
          </ProfileField>

          <div className="form-row">
            <ProfileField label={t('profile.cityLabel')} editing={isEditing} value={profile.city || t('profile.unsetValue')}>
              <input type="text" placeholder={t('profile.cityPlaceholder')} value={formData.city} onChange={(e) => updateField('city', e.target.value)} />
            </ProfileField>
            <ProfileField label={t('profile.dobLabel')} editing={isEditing} value={formatDob(profile.dateOfBirth, t('profile.unsetValue'))} error={fieldErrors.dateOfBirth}>
              <input type="date" value={formData.dateOfBirth} onChange={(e) => updateField('dateOfBirth', e.target.value)} />
            </ProfileField>
          </div>

          <ProfileField label={t('profile.genderLabel')} editing={isEditing} value={genderLabel(profile.gender)} error={fieldErrors.gender}>
            <CustomSelect
              label={t('profile.genderLabel')}
              hideLabel
              options={GENDER_OPTIONS}
              value={formData.gender}
              onChange={(v) => updateField('gender', v)}
              open={genderSelectOpen}
              onOpenChange={setGenderSelectOpen}
            />
          </ProfileField>
        </div>

        {/* Right column */}
        <div className="profile-side">
          <div className="card profile-account">
            <h3 className="profile-account__title">{t('profile.accountDetailsTitle')}</h3>
            <div className="profile-account__row">
              <span className="profile-account__label">{t('profile.emailLabelBare')}</span>
              <span className="profile-account__value">{profile.email}</span>
            </div>
            <div className="profile-account__row">
              <span className="profile-account__label">{t('profile.passwordLabel')}</span>
              <span className="profile-account__value profile-account__value--row">
                ••••••••
                <button type="button" className="profile-account__link" onClick={() => navigate('/llogaria/fjalekalimi')}>{t('profile.editCta')}</button>
              </span>
            </div>
            <div className="profile-account__row profile-account__row--last">
              <span className="profile-account__label">{t('profile.statusLabel')}</span>
              <span className="profile-account__status">
                <CheckCircle size={12} strokeWidth={1.5} /> {t('profile.statusActive')}
              </span>
            </div>
          </div>

          <div className="card profile-security">
            <div className="profile-security__head">
              <Shield size={16} strokeWidth={1.5} color="var(--primary)" />
              <span>{t('profile.securityTitle')}</span>
            </div>
            <p className="profile-security__text">
              {t('profile.securityText')}
            </p>
            <button type="button" className="btn btn--ghost btn--sm btn--block" onClick={() => navigate('/llogaria/fjalekalimi')}>
              <Lock size={14} strokeWidth={1.5} /> {t('profile.changePasswordCta')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ProfileField({
  label,
  editing,
  value,
  error,
  children,
}: {
  label: string
  editing: boolean
  value: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {editing ? children : <div className="profile-field__readonly">{value}</div>}
      {error && <span className="field__error">{error}</span>}
    </div>
  )
}
