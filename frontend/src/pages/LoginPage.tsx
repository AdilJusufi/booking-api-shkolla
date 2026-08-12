import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { CheckCircle, Eye, EyeOff, Lock, Mail, Moon, Sun } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { ApiError } from '../lib/api'
import { ErrorBox } from '../components/ui'
import { ROLE_HOME } from '../components/ProtectedRoute'
import Logo from '../components/Logo'

export default function LoginPage() {
  const { login } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string })?.from

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const authUser = await login(email, password)
      // Honor an explicit redirect (e.g. bounced here from a protected page)
      // over the role default, but only if it's not the generic patient home
      // some other role would otherwise be wrongly sent to.
      const ownRole = authUser.roles.find((r) => ROLE_HOME[r])
      const destination = from ?? (ownRole && ROLE_HOME[ownRole]) ?? '/'
      navigate(destination, { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Hyrja dështoi.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="split-auth">
      <div className="split-auth__brand">
        <span className="split-auth__brand-mark">
          <span className="split-auth__brand-icon" aria-hidden><Logo size={20} tone="inverted" /></span>
          Termini.ks
        </span>
        <h1>Shëndeti juaj, e rezervuar me lehtësi.</h1>
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
      </div>

      <div className="split-auth__mobile-bar">
        <Link to="/" className="brand">
          <span className="brand__mark" aria-hidden><Logo size={22} tone="inverted" /></span>
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
            <span>Nuk keni llogari?</span>
            <Link to="/regjistrohu">Regjistrohu</Link>
          </div>

          <h1>Mirë se vini</h1>
          <p className="auth-sub">Hyni në llogarinë tuaj</p>

          <form onSubmit={handleSubmit} className="form">
            {error && <ErrorBox message={error} />}
            <div className="field field--icon">
              <label>Email adresa</label>
              <span className="field__icon" aria-hidden><Mail size={16} strokeWidth={1.5} /></span>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="emri@shembull.com"
              />
            </div>
            <div className="field field--icon">
              <label>Fjalëkalimi</label>
              <span className="field__icon" aria-hidden><Lock size={16} strokeWidth={1.5} /></span>
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
              <button
                type="button"
                className="field__toggle"
                aria-label={showPassword ? 'Fshih fjalëkalimin' : 'Shfaq fjalëkalimin'}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
              </button>
            </div>

            <label className="field-check">
              <input type="checkbox" /> Më mbaj të kyçur
            </label>

            <button className="btn btn--primary btn--lg btn--block" disabled={loading}>
              {loading ? 'Duke u kyçur…' : 'Hyni në llogari'}
            </button>
          </form>

          <p className="auth-alt" style={{ marginTop: 16 }}>
            <Link to="/harrova-fjalekalimin">Keni harruar fjalëkalimin?</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
