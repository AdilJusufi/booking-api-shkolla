import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { ApiError } from '../lib/api'
import { getErrorMessage, getFieldErrors } from '../lib/errors'
import { useCooldown } from '../lib/useCooldown'
import type { Gender, RegisterClinicBranchRequest } from '../lib/types'
import { CustomSelect, ErrorBox } from '../components/ui'
import type { CustomSelectOption } from '../components/ui'
import { ROLE_HOME } from '../components/ProtectedRoute'
import AuthModeTabs from '../components/AuthModeTabs'
import { KOSOVO_CITIES } from '../lib/kosovoCities'
import { authModeSearch, readAuthMode, type AuthMode } from '../lib/authMode'

const GENDER_OPTION_VALUES = ['1', '2', '3'] as const
const GENDER_OPTION_KEYS = ['genderMale', 'genderFemale', 'genderOther'] as const

interface BranchFormState {
  name: string
  address: string
  city: string
  municipality: string
  phoneNumber: string
}

const EMPTY_BRANCH: BranchFormState = {
  name: '',
  address: '',
  city: '',
  municipality: '',
  phoneNumber: '',
}

// Backend errors (FluentValidation) key by the flat RegisterClinicRequest
// PascalCase property name; getFieldErrors() lowercases only the first
// character, so this must match that lowerCamel shape exactly — anything
// outside this set (e.g. a nested "Branches[0].City" failure) has nowhere to
// render inline and falls back to the form-level error banner instead.
const CLINIC_FIELD_KEYS = new Set([
  'firstName',
  'lastName',
  'email',
  'phoneNumber',
  'password',
  'clinicName',
  'description',
  'clinicPhoneNumber',
  'clinicEmail',
  'website',
  'branches',
])

export default function RegisterPage() {
  const { t: tCommon } = useTranslation('common')
  const { t } = useTranslation('auth')
  const { register, registerClinic } = useAuth()
  const { notify } = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const [mode, setMode] = useState<AuthMode>(() => readAuthMode(location.search))

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

  // --- Pacienti ---
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

  const [openSelect, setOpenSelect] = useState<'city' | 'gender' | null>(null)

  // --- Klinika ---
  const [clinicForm, setClinicForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    password: '',
    confirmPassword: '',
    clinicName: '',
    description: '',
    clinicPhoneNumber: '',
    clinicEmail: '',
    website: '',
  })

  const [branches, setBranches] = useState<BranchFormState[]>([{ ...EMPTY_BRANCH }])

  const [error, setError] = useState('')
  const [emailTaken, setEmailTaken] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const { secondsLeft, startCooldown } = useCooldown()

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function setClinicField<K extends keyof typeof clinicForm>(
    key: K,
    value: (typeof clinicForm)[K],
  ) {
    setClinicForm((f) => ({ ...f, [key]: value }))
  }

  function updateBranch(index: number, key: keyof BranchFormState, value: string) {
    setBranches((prev) =>
      prev.map((branch, i) => (i === index ? { ...branch, [key]: value } : branch)),
    )
  }

  function addBranch() {
    setBranches((prev) => [...prev, { ...EMPTY_BRANCH }])
  }

  function removeBranch(index: number) {
    setBranches((prev) => prev.filter((_, i) => i !== index))
  }

  function resetSubmitState() {
    setError('')
    setEmailTaken(false)
    setFieldErrors({})
  }

  // Same mode model as LoginPage: keep the selected account type in the URL.
  function changeMode(next: AuthMode) {
    setMode(next)
    resetSubmitState()
    navigate(
      { pathname: location.pathname, search: authModeSearch(next) },
      { replace: true },
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    resetSubmitState()
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

  async function handleClinicSubmit(e: React.FormEvent) {
    e.preventDefault()
    resetSubmitState()

    if (clinicForm.password !== clinicForm.confirmPassword) {
      setFieldErrors({ confirmPassword: t('fields.passwordMismatch') })
      return
    }

    setLoading(true)

    try {
      const payload = {
        firstName: clinicForm.firstName,
        lastName: clinicForm.lastName,
        email: clinicForm.email,
        phoneNumber: clinicForm.phoneNumber,
        password: clinicForm.password,
        clinicName: clinicForm.clinicName,
        description: clinicForm.description.trim() || undefined,
        clinicPhoneNumber: clinicForm.clinicPhoneNumber,
        clinicEmail: clinicForm.clinicEmail.trim() || undefined,
        website: clinicForm.website.trim() || undefined,
        branches: branches.map(
          (branch): RegisterClinicBranchRequest => ({
            name: branch.name,
            address: branch.address,
            city: branch.city,
            municipality: branch.municipality.trim() || undefined,
            phoneNumber: branch.phoneNumber.trim() || undefined,
          }),
        ),
      }

      await registerClinic(payload)

      notify(t('register.clinicSuccessToast'), 'ok')
      navigate('/admin-panel/klinikat', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setEmailTaken(true)
        return
      }

      const backendFieldErrors = getFieldErrors(err)
      if (backendFieldErrors) {
        setFieldErrors(backendFieldErrors)

        const unmapped = Object.entries(backendFieldErrors).find(
          ([key]) => !CLINIC_FIELD_KEYS.has(key),
        )

        if (unmapped) {
          setError(unmapped[1])
        }

        return
      }

      if (err instanceof ApiError && err.status === 429) {
        startCooldown()
      }

      setError(
        getErrorMessage(err, {
          default: t('register.clinicGenericFailure'),
        }),
      )
    } finally {
      setLoading(false)
    }
  }

  const cardWidthClass = mode === 'clinic' ? 'auth-card--xwide' : 'auth-card--wide'

  return (
    <div className="auth-page">
      <div className={`auth-card ${cardWidthClass}`}>
        <h1>{mode === 'clinic' ? t('register.clinicTitle') : t('register.title')}</h1>

        <p className="auth-sub">
          {mode === 'clinic' ? t('register.clinicSubtitle') : t('register.subtitle')}
        </p>

        <AuthModeTabs value={mode} onChange={changeMode} idPrefix="register" />

        {mode === 'patient' ? (
          <form
            onSubmit={handleSubmit}
            className="form"
            role="tabpanel"
            id="register-panel-patient"
            aria-labelledby="register-tab-patient"
          >
            {error && <ErrorBox message={error} />}

            <div className="form-row">
              <div className="field">
                <label>{t('register.firstNameLabel')}</label>
                <input
                  required
                  value={form.firstName}
                  onChange={(e) => set('firstName', e.target.value)}
                />
                {fieldErrors.firstName && (
                  <span className="field__error">{fieldErrors.firstName}</span>
                )}
              </div>

              <div className="field">
                <label>{t('register.lastNameLabel')}</label>
                <input
                  required
                  value={form.lastName}
                  onChange={(e) => set('lastName', e.target.value)}
                />
                {fieldErrors.lastName && (
                  <span className="field__error">{fieldErrors.lastName}</span>
                )}
              </div>
            </div>

            <div className="field">
              <label>{t('register.emailLabel')}</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => {
                  set('email', e.target.value)
                  setEmailTaken(false)
                }}
              />

              {emailTaken ? (
                <span className="field__error">
                  <Trans
                    i18nKey="register.duplicateEmail"
                    ns="auth"
                    components={[
                      <Link key="0" to="/hyr" />,
                      <Link key="1" to="/harrova-fjalekalimin" />,
                    ]}
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
                {fieldErrors.phoneNumber && (
                  <span className="field__error">{fieldErrors.phoneNumber}</span>
                )}
              </div>

              <div className="field">
                <CustomSelect
                  label={t('register.cityLabel')}
                  options={CITY_OPTIONS}
                  value={form.city}
                  onChange={(value) => set('city', value)}
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
                {fieldErrors.dateOfBirth && (
                  <span className="field__error">{fieldErrors.dateOfBirth}</span>
                )}
              </div>

              <div className="field">
                <CustomSelect
                  label={t('register.genderLabel')}
                  options={GENDER_OPTIONS}
                  value={String(form.gender)}
                  onChange={(value) => set('gender', Number(value) as Gender)}
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
              {fieldErrors.password && (
                <span className="field__error">{fieldErrors.password}</span>
              )}
            </div>

            <button
              className="btn btn--primary btn--lg btn--block"
              disabled={loading || secondsLeft > 0}
            >
              {loading
                ? t('register.submitting')
                : secondsLeft > 0
                  ? t('common.retryCountdown', { seconds: secondsLeft })
                  : t('register.submit')}
            </button>
          </form>
        ) : (
          <form
            onSubmit={handleClinicSubmit}
            className="form"
            role="tabpanel"
            id="register-panel-clinic"
            aria-labelledby="register-tab-clinic"
          >
            {error && <ErrorBox message={error} />}

            <h2 className="auth-section-title">
              {t('register.clinicSectionYourDetails')}
            </h2>

            <div className="form-row">
              <div className="field">
                <label>{t('register.firstNameLabel')}</label>
                <input
                  required
                  value={clinicForm.firstName}
                  onChange={(e) => setClinicField('firstName', e.target.value)}
                />
                {fieldErrors.firstName && (
                  <span className="field__error">{fieldErrors.firstName}</span>
                )}
              </div>

              <div className="field">
                <label>{t('register.lastNameLabel')}</label>
                <input
                  required
                  value={clinicForm.lastName}
                  onChange={(e) => setClinicField('lastName', e.target.value)}
                />
                {fieldErrors.lastName && (
                  <span className="field__error">{fieldErrors.lastName}</span>
                )}
              </div>
            </div>

            <div className="field">
              <label>{t('register.emailLabel')}</label>
              <input
                type="email"
                required
                value={clinicForm.email}
                onChange={(e) => {
                  setClinicField('email', e.target.value)
                  setEmailTaken(false)
                }}
              />

              {emailTaken ? (
                <span className="field__error">
                  <Trans
                    i18nKey="register.duplicateEmail"
                    ns="auth"
                    components={[
                      <Link key="0" to="/hyr" />,
                      <Link key="1" to="/harrova-fjalekalimin" />,
                    ]}
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
                  value={clinicForm.phoneNumber}
                  onChange={(e) => setClinicField('phoneNumber', e.target.value)}
                />
                {fieldErrors.phoneNumber && (
                  <span className="field__error">{fieldErrors.phoneNumber}</span>
                )}
              </div>

              <div className="field">
                <label>{t('fields.password.label')}</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={clinicForm.password}
                  onChange={(e) => setClinicField('password', e.target.value)}
                  placeholder={t('register.passwordPlaceholder')}
                />
                {fieldErrors.password && (
                  <span className="field__error">{fieldErrors.password}</span>
                )}
              </div>
            </div>

            <div className="field">
              <label>{t('fields.confirmPassword.label')}</label>
              <input
                type="password"
                required
                minLength={8}
                value={clinicForm.confirmPassword}
                onChange={(e) => setClinicField('confirmPassword', e.target.value)}
              />
              {fieldErrors.confirmPassword && (
                <span className="field__error">{fieldErrors.confirmPassword}</span>
              )}
            </div>

            <h2 className="auth-section-title">
              {t('register.clinicSectionClinicDetails')}
            </h2>

            <div className="field">
              <label>{t('register.clinicNameLabel')}</label>
              <input
                required
                value={clinicForm.clinicName}
                onChange={(e) => setClinicField('clinicName', e.target.value)}
              />
              {fieldErrors.clinicName && (
                <span className="field__error">{fieldErrors.clinicName}</span>
              )}
            </div>

            <div className="field">
              <label>
                {t('register.clinicDescriptionLabel')}{' '}
                <span className="muted">{t('register.optionalSuffix')}</span>
              </label>
              <textarea
                rows={3}
                value={clinicForm.description}
                onChange={(e) => setClinicField('description', e.target.value)}
              />
              {fieldErrors.description && (
                <span className="field__error">{fieldErrors.description}</span>
              )}
            </div>

            <div className="form-row">
              <div className="field">
                <label>{t('register.clinicPhoneLabel')}</label>
                <input
                  required
                  placeholder={t('register.phonePlaceholder')}
                  value={clinicForm.clinicPhoneNumber}
                  onChange={(e) =>
                    setClinicField('clinicPhoneNumber', e.target.value)
                  }
                />
                {fieldErrors.clinicPhoneNumber && (
                  <span className="field__error">
                    {fieldErrors.clinicPhoneNumber}
                  </span>
                )}
              </div>

              <div className="field">
                <label>
                  {t('register.clinicEmailLabel')}{' '}
                  <span className="muted">{t('register.optionalSuffix')}</span>
                </label>
                <input
                  type="email"
                  value={clinicForm.clinicEmail}
                  onChange={(e) => setClinicField('clinicEmail', e.target.value)}
                />
                {fieldErrors.clinicEmail && (
                  <span className="field__error">{fieldErrors.clinicEmail}</span>
                )}
              </div>
            </div>

            <div className="field">
              <label>
                {t('register.websiteLabel')}{' '}
                <span className="muted">{t('register.optionalSuffix')}</span>
              </label>
              <input
                type="url"
                value={clinicForm.website}
                onChange={(e) => setClinicField('website', e.target.value)}
              />
              {fieldErrors.website && (
                <span className="field__error">{fieldErrors.website}</span>
              )}
            </div>

            <h2 className="auth-section-title">
              {t('register.clinicSectionBranches')}
            </h2>

            {branches.map((branch, index) => (
              <div className="auth-branch-card" key={index}>
                <div className="auth-branch-card__head">
                  <span className="auth-branch-card__title">
                    {t('register.branchNumberLabel', { number: index + 1 })}
                  </span>

                  {branches.length > 1 && (
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      aria-label={t('register.removeBranchAria', {
                        number: index + 1,
                      })}
                      onClick={() => removeBranch(index)}
                    >
                      <Trash2 size={14} strokeWidth={1.5} />
                    </button>
                  )}
                </div>

                <div className="field">
                  <label>{t('register.branchNameLabel')}</label>
                  <input
                    required
                    value={branch.name}
                    onChange={(e) =>
                      updateBranch(index, 'name', e.target.value)
                    }
                  />
                </div>

                <div className="form-row">
                  <div className="field">
                    <label>{t('register.branchAddressLabel')}</label>
                    <input
                      required
                      value={branch.address}
                      onChange={(e) =>
                        updateBranch(index, 'address', e.target.value)
                      }
                    />
                  </div>

                  <div className="field">
                    <label>{t('register.branchCityLabel')}</label>
                    <input
                      required
                      value={branch.city}
                      onChange={(e) =>
                        updateBranch(index, 'city', e.target.value)
                      }
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="field">
                    <label>
                      {t('register.branchMunicipalityLabel')}{' '}
                      <span className="muted">{t('register.optionalSuffix')}</span>
                    </label>
                    <input
                      value={branch.municipality}
                      onChange={(e) =>
                        updateBranch(index, 'municipality', e.target.value)
                      }
                    />
                  </div>

                  <div className="field">
                    <label>
                      {t('register.branchPhoneLabel')}{' '}
                      <span className="muted">{t('register.optionalSuffix')}</span>
                    </label>
                    <input
                      value={branch.phoneNumber}
                      onChange={(e) =>
                        updateBranch(index, 'phoneNumber', e.target.value)
                      }
                    />
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              className="btn btn--ghost btn--sm"
              style={{ marginBottom: 16 }}
              onClick={addBranch}
            >
              {t('register.addBranchCta')}
            </button>

            <button
              className="btn btn--primary btn--lg btn--block"
              disabled={loading || secondsLeft > 0}
            >
              {loading
                ? t('register.clinicSubmitting')
                : secondsLeft > 0
                  ? t('common.retryCountdown', { seconds: secondsLeft })
                  : t('register.clinicSubmit')}
            </button>
          </form>
        )}

        <p className="auth-alt">
          {t('register.haveAccount')}{' '}
          <Link to={`/hyr${authModeSearch(mode)}`}>{t('register.loginLink')}</Link>
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
