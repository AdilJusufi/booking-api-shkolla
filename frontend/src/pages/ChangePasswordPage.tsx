import { useState } from 'react'
import { Eye, EyeOff, Lock, RotateCcw, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api, ApiError } from '../lib/api'
import { getChangePasswordWrongCurrentMessage, getErrorMessage, isWrongCurrentPasswordError } from '../lib/errors'
import { useCooldown } from '../lib/useCooldown'
import { useToast } from '../context/ToastContext'
import { ErrorBox, Pending } from '../components/ui'

// Same palette as ResetPasswordPage's strength meter — danger -> warn -> accent -> ok.
const STRENGTH_COLORS = ['#a83226', '#8a6212', '#0f6e62', '#14795a']

function strengthScore(password: string): number {
  let score = 0
  if (password.length >= 8) score++
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  return score
}

function meetsPolicy(password: string): boolean {
  return password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password)
}

const EMPTY_FORM = { currentPassword: '', newPassword: '', confirmPassword: '' }

export default function ChangePasswordPage() {
  const { t } = useTranslation('auth')
  const STRENGTH_LABELS = t('passwordStrength.labels', { returnObjects: true }) as string[]
  const { notify } = useToast()

  const [form, setForm] = useState(EMPTY_FORM)
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [touchedConfirm, setTouchedConfirm] = useState(false)
  const [currentPasswordError, setCurrentPasswordError] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const { secondsLeft, startCooldown } = useCooldown()

  const score = strengthScore(form.newPassword)
  const mismatch = form.confirmPassword.length > 0 && form.confirmPassword !== form.newPassword

  function updateField(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
    if (key === 'currentPassword') setCurrentPasswordError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setTouchedConfirm(true)
    setFormError('')
    setCurrentPasswordError('')

    if (!form.currentPassword) return setFormError(t('changePassword.missingCurrent'))
    if (form.confirmPassword !== form.newPassword) return setFormError(t('fields.passwordMismatch'))
    if (!meetsPolicy(form.newPassword)) return setFormError(t('changePassword.doesNotMeetPolicy'))
    if (form.newPassword === form.currentPassword) {
      return setFormError(t('changePassword.samePassword'))
    }

    setSaving(true)
    try {
      await api.changePassword(form.currentPassword, form.newPassword)
      notify(t('changePassword.successToast'), 'ok')
      setForm(EMPTY_FORM)
      setTouchedConfirm(false)
    } catch (err) {
      if (isWrongCurrentPasswordError(err)) {
        setCurrentPasswordError(getChangePasswordWrongCurrentMessage())
        return
      }
      if (err instanceof ApiError && err.status === 429) startCooldown()
      setFormError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="profile-page">
      <div className="card profile-form" style={{ maxWidth: 480 }}>
        <div className="profile-form__header">
          <h2 className="profile-form__title">{t('changePassword.title')}</h2>
        </div>
        <p className="auth-sub" style={{ marginTop: -8, marginBottom: 20 }}>
          {t('changePassword.subtitle')}
        </p>

        <form onSubmit={handleSubmit} className="form">
          {formError && <ErrorBox message={formError} />}

          <div className="field field--icon">
            <label>{t('changePassword.currentLabel')}</label>
            <span className="field__icon" aria-hidden><Lock size={16} strokeWidth={1.5} /></span>
            <input
              type={showCurrent ? 'text' : 'password'}
              autoComplete="current-password"
              value={form.currentPassword}
              onChange={(e) => updateField('currentPassword', e.target.value)}
            />
            <button
              type="button"
              className="field__toggle"
              aria-label={showCurrent ? t('passwordToggle.hide') : t('passwordToggle.show')}
              onClick={() => setShowCurrent((v) => !v)}
            >
              {showCurrent ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
            </button>
            {currentPasswordError && <span className="field__error">{currentPasswordError}</span>}
          </div>

          <div className="field field--icon">
            <label>{t('fields.newPassword.label')}</label>
            <span className="field__icon" aria-hidden><ShieldCheck size={16} strokeWidth={1.5} /></span>
            <input
              type={showNew ? 'text' : 'password'}
              autoComplete="new-password"
              value={form.newPassword}
              onChange={(e) => updateField('newPassword', e.target.value)}
            />
            <button
              type="button"
              className="field__toggle"
              aria-label={showNew ? t('passwordToggle.hide') : t('passwordToggle.show')}
              onClick={() => setShowNew((v) => !v)}
            >
              {showNew ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
            </button>

            {form.newPassword.length > 0 && (
              <>
                <div className="pw-strength">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="pw-strength__seg"
                      style={{ background: score === 1 || i < score ? STRENGTH_COLORS[score - 1] : 'var(--line)' }}
                    />
                  ))}
                </div>
                <span className="pw-strength__label" style={{ color: STRENGTH_COLORS[score - 1] ?? 'var(--muted)' }}>
                  {STRENGTH_LABELS[score - 1] ?? ''}
                </span>
              </>
            )}
          </div>

          <div className="field field--icon">
            <label>{t('fields.confirmPassword.label')}</label>
            <span className="field__icon" aria-hidden><RotateCcw size={16} strokeWidth={1.5} /></span>
            <input
              type={showConfirm ? 'text' : 'password'}
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={(e) => updateField('confirmPassword', e.target.value)}
              onBlur={() => setTouchedConfirm(true)}
            />
            <button
              type="button"
              className="field__toggle"
              aria-label={showConfirm ? t('passwordToggle.hide') : t('passwordToggle.show')}
              onClick={() => setShowConfirm((v) => !v)}
            >
              {showConfirm ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
            </button>
            {touchedConfirm && mismatch && <span className="field__error">{t('fields.passwordMismatch')}</span>}
          </div>

          <span className="field__note">
            {t('changePassword.policyNote')}
          </span>

          <button className="btn btn--primary" style={{ marginTop: 16, alignSelf: 'flex-start' }} disabled={saving || secondsLeft > 0}>
            {saving ? (
              <>
                <Pending /> {t('changePassword.submitting')}
              </>
            ) : secondsLeft > 0 ? (
              t('common.retryCountdown', { seconds: secondsLeft })
            ) : (
              t('changePassword.title')
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
