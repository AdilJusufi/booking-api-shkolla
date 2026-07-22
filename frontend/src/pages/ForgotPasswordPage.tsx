import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle, ChevronLeft, Mail, Moon, Sun } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import { useToast } from '../context/ToastContext'
import { api, ApiError } from '../lib/api'
import { ErrorBox } from '../components/ui'

const RESEND_SECONDS = 60
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ForgotPasswordPage() {
  const { theme, toggleTheme } = useTheme()
  const { notify } = useToast()

  const [email, setEmail] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  function startCooldown() {
    setCooldown(RESEND_SECONDS)
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  async function submit() {
    setError('')
    setLoading(true)
    try {
      await api.forgotPassword(email)
      setSent(true)
      startCooldown()
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        startCooldown()
      } else if (err instanceof ApiError && err.status === 500) {
        setError('Gabim i serverit. Provoni përsëri.')
      } else {
        setSent(true)
        startCooldown()
      }
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFieldError('')
    if (!email.trim() || !EMAIL_RE.test(email)) {
      setFieldError('Shkruani një email adresë të vlefshme.')
      return
    }
    submit()
  }

  async function handleResend() {
    if (cooldown > 0) return
    try {
      await api.forgotPassword(email)
      notify('Email u ridërgua.', 'ok')
      startCooldown()
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        startCooldown()
      } else if (!(err instanceof ApiError && err.status === 500)) {
        notify('Email u ridërgua.', 'ok')
        startCooldown()
      }
    }
  }

  const topRow = (
    <div className="split-auth__top">
      <button
        type="button"
        className="theme-toggle"
        aria-label={theme === 'dark' ? 'Kalo në temën e çelët' : 'Kalo në temën e errët'}
        onClick={toggleTheme}
      >
        {theme === 'dark' ? <Sun size={18} strokeWidth={1.5} /> : <Moon size={18} strokeWidth={1.5} />}
      </button>
      <Link to="/hyr" className="link-icon">
        <ChevronLeft size={16} strokeWidth={1.5} /> Kthehu te hyrja
      </Link>
    </div>
  )

  return (
    <div className="split-auth">
      <div className="split-auth__brand">
        <span className="split-auth__brand-mark">
          <span className="split-auth__brand-icon" aria-hidden>＋</span>
          Termini.ks
        </span>
        <h1>Shëndetësia juaj, e rezervuar me lehtësi.</h1>
        <div className="split-auth__brand-trust">
          <span className="split-auth__trust-item">
            <CheckCircle size={16} strokeWidth={1.5} /> 500+ Mjekë të verifikuar
          </span>
          <span className="split-auth__trust-item">
            <CheckCircle size={16} strokeWidth={1.5} /> 80+ Klinika në Kosovë
          </span>
          <span className="split-auth__trust-item">
            <CheckCircle size={16} strokeWidth={1.5} /> Rezervim në 60 sekonda
          </span>
        </div>
        <div className="split-auth__brand-copyright">© 2026 Termini.ks</div>
      </div>

      <div className="split-auth__mobile-bar">
        <Link to="/" className="brand">
          <span className="brand__mark" aria-hidden>＋</span>
          <span className="brand__name">Termini<span className="brand__tld">.ks</span></span>
        </Link>
      </div>

      <div className="split-auth__form">
        <div className="split-auth__form-inner">
          {topRow}

          {!sent ? (
            <>
              <h1 style={{ fontSize: '1.7rem', fontWeight: 800, color: 'var(--ink)' }}>
                Keni harruar fjalëkalimin?
              </h1>
              <p className="auth-sub" style={{ maxWidth: '34ch' }}>
                Shkruani emailin tuaj dhe do t'ju dërgojmë udhëzime për rivendosje.
              </p>

              <form onSubmit={handleSubmit} className="form">
                {error && <ErrorBox message={error} />}
                <div className="field field--icon">
                  <label>Email adresa</label>
                  <span className="field__icon" aria-hidden><Mail size={16} strokeWidth={1.5} /></span>
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="emri@shembull.com"
                  />
                  {fieldError && <span className="field__error">{fieldError}</span>}
                </div>

                <button className="btn btn--primary btn--block" disabled={loading || cooldown > 0}>
                  {loading ? (
                    <>
                      <span className="spinner spinner--sm" /> Duke dërguar…
                    </>
                  ) : cooldown > 0 ? (
                    `Ridërgoni (${cooldown}s)`
                  ) : (
                    <>
                      Dërgoni udhëzimet <ArrowRight size={16} strokeWidth={1.5} />
                    </>
                  )}
                </button>

                <p style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', marginTop: 10 }}>
                  Nëse nuk e shihni emailin, kontrolloni dosjen tuaj spam.
                </p>
              </form>
            </>
          ) : (
            <>
              <div className="icon-circle icon-circle--primary">
                <Mail size={28} strokeWidth={1.5} />
              </div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--ink)', textAlign: 'center' }}>
                Kontrolloni emailin tuaj
              </h1>
              <p
                className="auth-sub"
                style={{ maxWidth: '34ch', textAlign: 'center', marginInline: 'auto' }}
              >
                Kemi dërguar udhëzime te <strong>{email}</strong> nëse ky adresë është e regjistruar.
              </p>

              <div className="auth-resend">
                <span>Nuk morët emailin?</span>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={cooldown > 0}
                  onClick={handleResend}
                >
                  {cooldown > 0 ? `Ridërgoni (${cooldown}s)` : 'Ridërgoni'}
                </button>
              </div>

              <p className="auth-alt" style={{ marginTop: 16 }}>
                <Link to="/hyr" className="link-icon">
                  <ChevronLeft size={16} strokeWidth={1.5} /> Kthehu te hyrja
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
