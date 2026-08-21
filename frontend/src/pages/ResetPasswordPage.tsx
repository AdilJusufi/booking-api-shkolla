import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, CheckCircle, ChevronLeft, Eye, EyeOff, Lock, Moon, RotateCcw, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../context/ThemeContext'
import { api, ApiError } from '../lib/api'
import { getAuthTokenInvalidMessage, getErrorMessage } from '../lib/errors'
import { useCooldown } from '../lib/useCooldown'
import { ErrorBox, Pending } from '../components/ui'
import Logo from '../components/Logo'

// Danger -> warn -> accent -> ok, drawn from the design tokens rather than
// an off-palette traffic-light ramp.
const STRENGTH_COLORS = ['#a83226', '#8a6212', '#0f6e62', '#14795a']

function strengthScore(password: string): number {
  let score = 0
  if (password.length >= 8) score++
  if (/[A-Z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  return score
}

export default function ResetPasswordPage() {
  const { t: tCommon } = useTranslation('common')
  const { t } = useTranslation('auth')
  const STRENGTH_LABELS = t('passwordStrength.labels', { returnObjects: true }) as string[]
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const token = searchParams.get('token') ?? ''
  const email = searchParams.get('email') ?? ''

  useEffect(() => {
    if (!token) navigate('/harrova-fjalekalimin', { replace: true })
  }, [token, navigate])

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [touchedConfirm, setTouchedConfirm] = useState(false)
  const [error, setError] = useState('')
  const [expired, setExpired] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [countdown, setCountdown] = useState(3)
  const { secondsLeft, startCooldown } = useCooldown()

  const score = strengthScore(newPassword)
  const mismatch = confirmPassword.length > 0 && confirmPassword !== newPassword
  const canSubmit = newPassword.length > 0 && confirmPassword.length > 0 && !mismatch && score >= 2

  useEffect(() => {
    if (!done) return
    if (countdown <= 0) {
      navigate('/hyr')
      return
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [done, countdown, navigate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setTouchedConfirm(true)
    if (!canSubmit) return

    setError('')
    setExpired(false)
    setLoading(true)
    try {
      await api.resetPassword(token, email, newPassword)
      setDone(true)
    } catch (err) {
      // The backend actually throws AuthenticationFailedException (401) for
      // an invalid/expired token — 400/404 are kept as a defensive fallback
      // but are not what's observed from AuthService.ResetPasswordAsync.
      if (err instanceof ApiError && (err.status === 401 || err.status === 400 || err.status === 404)) {
        setExpired(true)
        return
      }
      if (err instanceof ApiError && err.status === 429) startCooldown()
      setError(getErrorMessage(err, { default: t('resetPassword.genericFailure') }))
    } finally {
      setLoading(false)
    }
  }

  if (!token) return null

  return (
    <div className="split-auth">
      <div className="split-auth__brand">
        <span className="brand">
          <span className="brand__mark" aria-hidden><Logo size={22} tone="inverted" /></span>
          <span className="brand__name">{tCommon('brand.name')}<span className="brand__tld">{tCommon('brand.tld')}</span></span>
        </span>
        <h1>{t('brand.taglineVariant')}</h1>
        <div className="split-auth__brand-trust">
          <span className="split-auth__trust-item">
            <CheckCircle size={16} strokeWidth={1.5} /> {t('brand.trustDoctors')}
          </span>
          <span className="split-auth__trust-item">
            <CheckCircle size={16} strokeWidth={1.5} /> {t('brand.trustClinics')}
          </span>
          <span className="split-auth__trust-item">
            <CheckCircle size={16} strokeWidth={1.5} /> {t('brand.trustBooking')}
          </span>
        </div>
        <div className="split-auth__brand-copyright">{t('brand.copyright', { year: new Date().getFullYear() })}</div>
      </div>

      <div className="split-auth__mobile-bar">
        <Link to="/" className="brand">
          <span className="brand__mark" aria-hidden><Logo size={22} tone="inverted" /></span>
          <span className="brand__name">{tCommon('brand.name')}<span className="brand__tld">{tCommon('brand.tld')}</span></span>
        </Link>
      </div>

      <div className="split-auth__form">
        <div className="split-auth__form-inner">
          <div className="split-auth__top">
            <button
              type="button"
              className="theme-toggle"
              aria-label={theme === 'dark' ? tCommon('theme.switchToLight') : tCommon('theme.switchToDark')}
              onClick={toggleTheme}
            >
              {theme === 'dark' ? <Sun size={18} strokeWidth={1.5} /> : <Moon size={18} strokeWidth={1.5} />}
            </button>
            <Link to="/hyr" className="link-icon">
              <ChevronLeft size={16} strokeWidth={1.5} /> {t('common.backToLogin')}
            </Link>
          </div>

          {!done ? (
            <>
              <h1 style={{ fontSize: '1.7rem', fontWeight: 800, color: 'var(--ink)' }}>
                {t('resetPassword.title')}
              </h1>
              <p className="auth-sub">
                {t('resetPassword.subtitle')} {email && <strong style={{ color: 'var(--ink)' }}>{email}</strong>}
              </p>

              <form onSubmit={handleSubmit} className="form">
                {error && <ErrorBox message={error} />}
                {expired && (
                  <ErrorBox
                    message={
                      <>
                        {getAuthTokenInvalidMessage()}{' '}
                        <Link to="/harrova-fjalekalimin" className="link-icon">
                          {t('resetPassword.requestNewLink')} <ArrowRight size={14} strokeWidth={1.5} />
                        </Link>
                      </>
                    }
                  />
                )}

                <div className="field field--icon">
                  <label>{t('fields.newPassword.label')}</label>
                  <span className="field__icon" aria-hidden><Lock size={16} strokeWidth={1.5} /></span>
                  <input
                    type={showNew ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t('resetPassword.newPasswordPlaceholder')}
                  />
                  <button
                    type="button"
                    className="field__toggle"
                    aria-label={showNew ? t('passwordToggle.hide') : t('passwordToggle.show')}
                    onClick={() => setShowNew((v) => !v)}
                  >
                    {showNew ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
                  </button>

                  {newPassword.length > 0 && (
                    <>
                      <div className="pw-strength">
                        {[0, 1, 2, 3].map((i) => (
                          <div
                            key={i}
                            className="pw-strength__seg"
                            style={{
                              background:
                                score === 1 || i < score ? STRENGTH_COLORS[score - 1] : 'var(--line)',
                            }}
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
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onBlur={() => setTouchedConfirm(true)}
                    placeholder={t('resetPassword.confirmPasswordPlaceholder')}
                  />
                  <button
                    type="button"
                    className="field__toggle"
                    aria-label={showConfirm ? t('passwordToggle.hide') : t('passwordToggle.show')}
                    onClick={() => setShowConfirm((v) => !v)}
                  >
                    {showConfirm ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
                  </button>
                  {touchedConfirm && mismatch && (
                    <span className="field__error" style={{ fontSize: 12 }}>{t('fields.passwordMismatch')}</span>
                  )}
                </div>

                <button className="btn btn--primary btn--block" disabled={loading || !canSubmit || secondsLeft > 0}>
                  {loading ? (
                    <>
                      <Pending /> {t('resetPassword.submitting')}
                    </>
                  ) : secondsLeft > 0 ? (
                    t('common.retryCountdown', { seconds: secondsLeft })
                  ) : (
                    <>
                      {t('resetPassword.submit')} <ArrowRight size={16} strokeWidth={1.5} />
                    </>
                  )}
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="icon-circle icon-circle--ok">
                <CheckCircle size={28} strokeWidth={1.5} />
              </div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--ink)', textAlign: 'center' }}>
                {t('resetPassword.successTitle')}
              </h1>
              <p className="auth-sub" style={{ textAlign: 'center' }}>
                {t('resetPassword.successBody')}
              </p>
              <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginBottom: 16 }}>
                {t('resetPassword.redirectCountdown', { seconds: countdown })}
              </p>
              <Link to="/hyr" className="btn btn--primary btn--block">
                {t('resetPassword.goToLogin')} <ArrowRight size={16} strokeWidth={1.5} />
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
