import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle, ChevronLeft, Mail, Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../context/ThemeContext'
import { api, ApiError } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import { useCooldown } from '../lib/useCooldown'
import { ErrorBox, Pending } from '../components/ui'
import Logo from '../components/Logo'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ResendConfirmationPage() {
  const { t: tCommon } = useTranslation('common')
  const { t } = useTranslation('auth')
  const { theme, toggleTheme } = useTheme()

  const [email, setEmail] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  // "email-send" policy: dritare 5-minutëshe, jo 1 minutë si "auth" — shih Program.cs.
  const { secondsLeft: cooldown, startCooldown } = useCooldown(300)

  // Endpoint-i kthen 204 pavarësisht nëse adresa ekziston, është e pakonfirmuar,
  // apo u kufizua — asnjë prej tyre s'duhet të prodhojë një gjendje të dukshme
  // ndryshe nga suksesi. Vetëm një dështim i vërtetë (rrjet, 429, 500) prodhon gabim.
  async function submit() {
    setError('')
    setLoading(true)
    try {
      await api.resendConfirmation(email)
      setSent(true)
      startCooldown()
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) startCooldown()
      setError(getErrorMessage(err, { default: t('resendConfirmation.sendFailure') }))
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFieldError('')
    if (!email.trim() || !EMAIL_RE.test(email)) {
      setFieldError(t('resendConfirmation.invalidEmail'))
      return
    }
    submit()
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
                {t('resendConfirmation.title')}
              </h1>
              <p className="auth-sub" style={{ maxWidth: '34ch' }}>
                {t('resendConfirmation.subtitle')}
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
                      <Pending /> {t('resendConfirmation.submitting')}
                    </>
                  ) : cooldown > 0 ? (
                    t('resendConfirmation.resendCountdown', { seconds: cooldown })
                  ) : (
                    <>
                      {t('resendConfirmation.submit')} <ArrowRight size={16} strokeWidth={1.5} />
                    </>
                  )}
                </button>

                <p style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', marginTop: 10 }}>
                  {t('resendConfirmation.spamHint')}
                </p>
              </form>
            </>
          ) : (
            <>
              <div className="icon-circle icon-circle--primary">
                <Mail size={28} strokeWidth={1.5} />
              </div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--ink)', textAlign: 'center' }}>
                {t('resendConfirmation.checkEmailTitle')}
              </h1>
              <p
                className="auth-sub"
                style={{ maxWidth: '34ch', textAlign: 'center', marginInline: 'auto' }}
              >
                {t('resendConfirmation.checkEmailBody')}
              </p>

              {error && <ErrorBox message={error} />}

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
