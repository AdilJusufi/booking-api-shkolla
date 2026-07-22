import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ApiError } from '../lib/api'
import { ErrorBox } from '../components/ui'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string })?.from ?? '/terminet'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Hyrja dështoi.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Mirë se u ktheve 👋</h1>
        <p className="auth-sub">Kyçu për të menaxhuar terminet e tua.</p>

        <form onSubmit={handleSubmit} className="form">
          {error && <ErrorBox message={error} />}
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ju@example.com"
            />
          </div>
          <div className="field">
            <label>Fjalëkalimi</label>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <button className="btn btn--primary btn--lg btn--block" disabled={loading}>
            {loading ? 'Duke u kyçur…' : 'Hyr'}
          </button>
        </form>

        <p className="auth-alt">
          S'ke llogari? <Link to="/regjistrohu">Regjistrohu falas</Link>
        </p>

        <div className="auth-demo">
          <span>Llogari demo:</span>
          <code>pacienti@booking.dev</code> · <code>Dev123!Booking</code>
        </div>
      </div>
    </div>
  )
}
