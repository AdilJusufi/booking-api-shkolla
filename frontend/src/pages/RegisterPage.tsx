import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { ApiError } from '../lib/api'
import { getErrorMessage, getFieldErrors } from '../lib/errors'
import { useCooldown } from '../lib/useCooldown'
import type { Gender } from '../lib/types'
import { CustomSelect, ErrorBox } from '../components/ui'
import type { CustomSelectOption } from '../components/ui'
import { ROLE_HOME } from '../components/ProtectedRoute'
import { KOSOVO_CITIES } from '../lib/kosovoCities'

const GENDER_OPTION_VALUES = ['1', '2', '3'] as const
const GENDER_OPTION_KEYS = ['genderMale', 'genderFemale', 'genderOther'] as const

export default function RegisterPage() {
  const { t: tCommon } = useTranslation('common')
  const { t } = useTranslation('auth')
  const { register } = useAuth()
  const navigate = useNavigate()

  const CITY_OPTIONS: CustomSelectOption[] = [
    { value: '', label: t('register.citySelectPlaceholder') },
    ...KOSOVO_CITIES.map(({ key, value }) => ({
      value,
      label: tCommon(`cities.${key}`),
    })),
  ]
  const GENDER_OPTIONS: CustomSelectOption[] = GENDER_OPTION_VALUES.map((value, i) => ({
    value,
    label: t(`register.${GENDER_OPTION_KEYS[i]}`),
  }))

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    password: '',
    dateOfBirth: '',
    gender: 1 as Gender,
    city: '',
  })
  const [error, setError] = useState('')
  const [emailTaken, setEmailTaken] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [openSelect, setOpenSelect] = useState<'city' | 'gender' | null>(null)
  const { secondsLeft, startCooldown } = useCooldown()

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setEmailTaken(false)
    setFieldErrors({})
    setLoading(true)
    try {
      const authUser = await register({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phoneNumber: form.phoneNumber,
        password: form.password,
        dateOfBirth: form.dateOfBirth,
        gender: form.gender,
        city: form.city || undefined,
      })
      // Public registration only ever produces a Patient account today, but
      // route by role rather than hardcode /terminet so this stays correct
      // if that ever changes.
      const ownRole = authUser.roles.find((r) => ROLE_HOME[r])
      navigate((ownRole && ROLE_HOME[ownRole]) ?? '/terminet', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setEmailTaken(true)
        return
      }
      const backendFieldErrors = getFieldErrors(err)
      if (backendFieldErrors) {
        setFieldErrors(backendFieldErrors)
        return
      }
      if (err instanceof ApiError && err.status === 429) {
        startCooldown()
      }
      setError(getErrorMessage(err, { default: t('register.genericFailure') }))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card auth-card--wide">
        <h1>{t('register.title')}</h1>
        <p className="auth-sub">{t('register.subtitle')}</p>

        <form onSubmit={handleSubmit} className="form">
          {error && <ErrorBox message={error} />}
          <div className="form-row">
            <div className="field">
              <label>{t('register.firstNameLabel')}</label>
              <input required value={form.firstName} onChange={(e) => set('firstName', e.target.value)} />
              {fieldErrors.firstName && <span className="field__error">{fieldErrors.firstName}</span>}
            </div>
            <div className="field">
              <label>{t('register.lastNameLabel')}</label>
              <input required value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />
              {fieldErrors.lastName && <span className="field__error">{fieldErrors.lastName}</span>}
            </div>
          </div>

          <div className="field">
            <label>{t('register.emailLabel')}</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => { set('email', e.target.value); setEmailTaken(false) }}
            />
            {emailTaken ? (
              <span className="field__error">
                {/* `components` array, not inline JSX children: Trans's default
                    index-matching counts ALL children (text nodes included),
                    not just elements, so two adjacent <Link>s with text
                    between them silently mis-map — this form is explicit
                    about which index is which. */}
                <Trans
                  i18nKey="register.duplicateEmail"
                  ns="auth"
                  components={[<Link key="0" to="/hyr" />, <Link key="1" to="/harrova-fjalekalimin" />]}
                />
              </span>
            ) : fieldErrors.email ? (
              <span className="field__error">{fieldErrors.email}</span>
            ) : null}
          </div>

          <div className="form-row">
            <div className="field">
              <label>{t('register.phoneLabel')}</label>
              <input
                required
                placeholder={t('register.phonePlaceholder')}
                value={form.phoneNumber}
                onChange={(e) => set('phoneNumber', e.target.value)}
              />
              {fieldErrors.phoneNumber && <span className="field__error">{fieldErrors.phoneNumber}</span>}
            </div>
            <div className="field">
              <CustomSelect
                label={t('register.cityLabel')}
                options={CITY_OPTIONS}
                value={form.city}
                onChange={(v) => set('city', v)}
                open={openSelect === 'city'}
                onOpenChange={(isOpen) => setOpenSelect(isOpen ? 'city' : null)}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="field">
              <label>{t('register.dobLabel')}</label>
              <input
                type="date"
                required
                max={maxBirth()}
                value={form.dateOfBirth}
                onChange={(e) => set('dateOfBirth', e.target.value)}
              />
              {fieldErrors.dateOfBirth && <span className="field__error">{fieldErrors.dateOfBirth}</span>}
            </div>
            <div className="field">
              <CustomSelect
                label={t('register.genderLabel')}
                options={GENDER_OPTIONS}
                value={String(form.gender)}
                onChange={(v) => set('gender', Number(v) as Gender)}
                open={openSelect === 'gender'}
                onOpenChange={(isOpen) => setOpenSelect(isOpen ? 'gender' : null)}
              />
            </div>
          </div>

          <div className="field">
            <label>{t('fields.password.label')}</label>
            <input
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
              placeholder={t('register.passwordPlaceholder')}
            />
            {fieldErrors.password && <span className="field__error">{fieldErrors.password}</span>}
          </div>

          <button className="btn btn--primary btn--lg btn--block" disabled={loading || secondsLeft > 0}>
            {loading
              ? t('register.submitting')
              : secondsLeft > 0
                ? t('common.retryCountdown', { seconds: secondsLeft })
                : t('register.submit')}
          </button>
        </form>

        <p className="auth-alt">
          {t('register.haveAccount')} <Link to="/hyr">{t('register.loginLink')}</Link>
        </p>
      </div>
    </div>
  )
}

function maxBirth(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 16)
  return d.toISOString().slice(0, 10)
}
