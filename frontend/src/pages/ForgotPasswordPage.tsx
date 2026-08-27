import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle, ChevronLeft, Mail, Moon, Sun } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import { useTheme } from '../context/ThemeContext'
import { useToast } from '../context/ToastContext'
import { api, ApiError } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import { useCooldown } from '../lib/useCooldown'
import { ErrorBox, Pending } from '../components/ui'
import Logo from '../components/Logo'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ForgotPasswordPage() {
  const { t: tCommon } = useTranslation('common')
  const { t } = useTranslation('auth')
  const { theme, toggleTheme } = useTheme()
  const { notify } = useToast()

  const [email, setEmail] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  // "email-send" policy (forgot-password/resend-confirmation), jo "auth" — dritarja
  // është 5 minuta, jo 1, shih Program.cs.
  const { secondsLeft: cooldown, startCooldown } = useCooldown(300)

  // The endpoint returns 204 regardless of whether the email exists (by
  // design, so the response never reveals which). Only a genuine failure —
  // network, 429, 500 — should ever produce an error state here; success
  // is the *only* thing that should ever set `sent`.
  async function submit() {
    setError('')
    setLoading(true)
    try {
      await api.forgotPassword(email)
      setSent(true)
      startCooldown()
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) startCooldown()
      setError(getErrorMessage(err, { default: t('forgotPassword.sendFailure') }))
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFieldError('')
    if (!email.trim() || !EMAIL_RE.test(email)) {
      setFieldError(t('forgotPassword.invalidEmail'))
      return
    }
    submit()
  }

  async function handleResend() {
    if (cooldown > 0) return
    setError('')
    try {
      await api.forgotPassword(email)
      notify(t('forgotPassword.resentToast'), 'ok')
      startCooldown()
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) startCooldown()
      setError(getErrorMessage(err, { default: t('forgotPassword.resendFailure') }))
    }
  }

  const topRow = (
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
  )

  return (
    <div className="split-auth">
      <div className="split-auth__brand">
        <span className="split-auth__brand-mark">
          <Logo variant="stacked" tone="inverted" size={56} />
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
          <Logo variant="horizontal" tone="inverted" size={24} />
        </Link>
      </div>

      <div className="split-auth__form">
        <div className="split-auth__form-inner">
          {topRow}

          {!sent ? (
            <>
              <h1 style={{ fontSize: '1.7rem', fontWeight: 800, color: 'var(--ink)' }}>
                {t('forgotPassword.title')}
              </h1>
              <p className="auth-sub" style={{ maxWidth: '34ch' }}>
                {t('forgotPassword.subtitle')}
              </p>

              <form onSubmit={handleSubmit} className="form">
                {error && <ErrorBox message={error} />}
                <div className="field field--icon">
                  <label>{t('fields.email.label')}</label>
                  <span className="field__icon" aria-hidden><Mail size={16} strokeWidth={1.5} /></span>
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('fields.email.placeholder')}
                  />
                  {fieldError && <span className="field__error">{fieldError}</span>}
                </div>

                <button className="btn btn--primary btn--block" disabled={loading || cooldown > 0}>
                  {loading ? (
                    <>
                      <Pending /> {t('forgotPassword.submitting')}
                    </>
                  ) : cooldown > 0 ? (
                    t('forgotPassword.resendCountdown', { seconds: cooldown })
                  ) : (
                    <>
                      {t('forgotPassword.submit')} <ArrowRight size={16} strokeWidth={1.5} />
                    </>
                  )}
                </button>

                <p style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', marginTop: 10 }}>
                  {t('forgotPassword.spamHint')}
                </p>
              </form>
            </>
          ) : (
            <>
              <div className="icon-circle icon-circle--primary">
                <Mail size={28} strokeWidth={1.5} />
              </div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--ink)', textAlign: 'center' }}>
                {t('forgotPassword.checkEmailTitle')}
              </h1>
              <p
                className="auth-sub"
                style={{ maxWidth: '34ch', textAlign: 'center', marginInline: 'auto' }}
              >
                <Trans
                  i18nKey="forgotPassword.checkEmailBody"
                  ns="auth"
                  values={{ email }}
                  components={[<strong key="0" />]}
                />
              </p>

              {error && <ErrorBox message={error} />}

              <div className="auth-resend">
                <span>{t('forgotPassword.notReceived')}</span>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={cooldown > 0}
                  onClick={handleResend}
                >
                  {cooldown > 0 ? t('forgotPassword.resendCountdown', { seconds: cooldown }) : t('forgotPassword.resend')}
                </button>
              </div>

              <p className="auth-alt" style={{ marginTop: 16 }}>
                <Link to="/hyr" className="link-icon">
                  <ChevronLeft size={16} strokeWidth={1.5} /> {t('common.backToLogin')}
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
