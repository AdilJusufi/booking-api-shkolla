import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, CheckCircle, ChevronLeft, Eye, EyeOff, Lock, Moon, RotateCcw, Sun } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import { api, ApiError } from '../lib/api'
import { ErrorBox } from '../components/ui'

const STRENGTH_COLORS = ['#ef4444', '#f59e0b', '#2563eb', '#10b981']
const STRENGTH_LABELS = ['Dobët', 'Mesatar', 'Mirë', 'Shumë mirë']

function strengthScore(password: string): number {
  let score = 0
  if (password.length >= 8) score++
  if (/[A-Z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  return score
}

export default function ResetPasswordPage() {
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
      if (err instanceof ApiError && (err.status === 400 || err.status === 404)) {
        setExpired(true)
      } else {
        setError('Gabim i serverit. Provoni përsëri.')
      }
    } finally {
      setLoading(false)
    }
  }

  if (!token) return null

  return (
    <div className="split-auth">
      <div className="split-auth__brand">
        <span className="brand">
          <span className="brand__mark" aria-hidden>＋</span>
          <span className="brand__name">Termini<span className="brand__tld">.ks</span></span>
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

          {!done ? (
            <>
              <h1 style={{ fontSize: '1.7rem', fontWeight: 800, color: 'var(--ink)' }}>
                Vendosni fjalëkalimin e ri
              </h1>
              <p className="auth-sub">
                Zgjidhni një fjalëkalim të fortë për llogarinë tuaj {email && <strong style={{ color: 'var(--ink)' }}>{email}</strong>}
              </p>

              <form onSubmit={handleSubmit} className="form">
                {error && <ErrorBox message={error} />}
                {expired && (
                  <ErrorBox
                    message={
                      <>
                        Ky link ka skaduar.{' '}
                        <Link to="/harrova-fjalekalimin" className="link-icon">
                          Kërkoni link të ri <ArrowRight size={14} strokeWidth={1.5} />
                        </Link>
                      </>
                    }
                  />
                )}

                <div className="field field--icon">
                  <label>Fjalëkalimi i ri</label>
                  <span className="field__icon" aria-hidden><Lock size={16} strokeWidth={1.5} /></span>
                  <input
                    type={showNew ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Shkruani fjalëkalimin e ri"
                  />
                  <button
                    type="button"
                    className="field__toggle"
                    aria-label={showNew ? 'Fshih fjalëkalimin' : 'Shfaq fjalëkalimin'}
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
                  <label>Konfirmo fjalëkalimin e ri</label>
                  <span className="field__icon" aria-hidden><RotateCcw size={16} strokeWidth={1.5} /></span>
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onBlur={() => setTouchedConfirm(true)}
                    placeholder="Përsërisni fjalëkalimin"
                  />
                  <button
                    type="button"
                    className="field__toggle"
                    aria-label={showConfirm ? 'Fshih fjalëkalimin' : 'Shfaq fjalëkalimin'}
                    onClick={() => setShowConfirm((v) => !v)}
                  >
                    {showConfirm ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
                  </button>
                  {touchedConfirm && mismatch && (
                    <span className="field__error" style={{ fontSize: 12 }}>Fjalëkalimet nuk përputhen.</span>
                  )}
                </div>

                <button className="btn btn--primary btn--block" disabled={loading || !canSubmit}>
                  {loading ? (
                    <>
                      <span className="spinner spinner--sm" /> Duke rivendosur…
                    </>
                  ) : (
                    <>
                      Rivendos fjalëkalimin <ArrowRight size={16} strokeWidth={1.5} />
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
                Fjalëkalimi u ndryshua!
              </h1>
              <p className="auth-sub" style={{ textAlign: 'center' }}>
                Fjalëkalimi juaj është përditësuar me sukses. Tani mund të hyni me fjalëkalimin e ri.
              </p>
              <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginBottom: 16 }}>
                Po ju ridrejtojmë te hyrja për {countdown}...
              </p>
              <Link to="/hyr" className="btn btn--primary btn--block">
                Shkoni te hyrja <ArrowRight size={16} strokeWidth={1.5} />
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
