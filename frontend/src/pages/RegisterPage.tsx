import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ApiError } from '../lib/api'
import type { Gender } from '../lib/types'
import { ErrorBox } from '../components/ui'

const KOSOVO_CITIES = [
  'Prishtinë', 'Prizren', 'Pejë', 'Gjakovë', 'Gjilan',
  'Mitrovicë', 'Ferizaj', 'Vushtrri', 'Podujevë', 'Suharekë',
]

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()

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
  const [loading, setLoading] = useState(false)

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await register({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phoneNumber: form.phoneNumber,
        password: form.password,
        dateOfBirth: form.dateOfBirth,
        gender: form.gender,
        city: form.city || undefined,
      })
      navigate('/terminet', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Regjistrimi dështoi.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card auth-card--wide">
        <h1>Krijo llogari falas</h1>
        <p className="auth-sub">Menaxho terminet e tua në një vend.</p>

        <form onSubmit={handleSubmit} className="form">
          {error && <ErrorBox message={error} />}
          <div className="form-row">
            <div className="field">
              <label>Emri</label>
              <input required value={form.firstName} onChange={(e) => set('firstName', e.target.value)} />
            </div>
            <div className="field">
              <label>Mbiemri</label>
              <input required value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label>Email</label>
            <input type="email" required value={form.email} onChange={(e) => set('email', e.target.value)} />
          </div>

          <div className="form-row">
            <div className="field">
              <label>Numri i telefonit</label>
              <input
                required
                placeholder="+383 4x xxx xxx"
                value={form.phoneNumber}
                onChange={(e) => set('phoneNumber', e.target.value)}
              />
            </div>
            <div className="field">
              <label>Qyteti</label>
              <select value={form.city} onChange={(e) => set('city', e.target.value)}>
                <option value="">Zgjidh…</option>
                {KOSOVO_CITIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="field">
              <label>Datëlindja</label>
              <input
                type="date"
                required
                max={maxBirth()}
                value={form.dateOfBirth}
                onChange={(e) => set('dateOfBirth', e.target.value)}
              />
            </div>
            <div className="field">
              <label>Gjinia</label>
              <select value={form.gender} onChange={(e) => set('gender', Number(e.target.value) as Gender)}>
                <option value={1}>Mashkull</option>
                <option value={2}>Femër</option>
                <option value={3}>Tjetër</option>
              </select>
            </div>
          </div>

          <div className="field">
            <label>Fjalëkalimi</label>
            <input
              type="password"
              required
              minLength={6}
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
              placeholder="Të paktën 6 karaktere"
            />
          </div>

          <button className="btn btn--primary btn--lg btn--block" disabled={loading}>
            {loading ? 'Duke krijuar…' : 'Regjistrohu'}
          </button>
        </form>

        <p className="auth-alt">
          Ke llogari? <Link to="/hyr">Hyr këtu</Link>
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
