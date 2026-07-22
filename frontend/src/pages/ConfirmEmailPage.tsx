import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertCircle, ArrowRight, CheckCircle } from 'lucide-react'
import { api } from '../lib/api'

type ConfirmState = 'loading' | 'success' | 'error'

export default function ConfirmEmailPage() {
  const [searchParams] = useSearchParams()
  const [state, setState] = useState<ConfirmState>('loading')

  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) {
      setState('error')
      return
    }
    api
      .confirmEmail(token)
      .then(() => setState('success'))
      .catch(() => setState('error'))
  }, [searchParams])

  return (
    <div className="confirm-email-page">
      <div className="auth-card">
        <span className="brand">
          <span className="brand__mark" aria-hidden>＋</span>
          <span className="brand__name">Termini<span className="brand__tld">.ks</span></span>
        </span>

        {state === 'loading' && (
          <div className="loading">
            <div className="spinner" />
            <p>Duke konfirmuar emailin tuaj...</p>
          </div>
        )}

        {state === 'success' && (
          <>
            <div className="icon-circle icon-circle--ok">
              <CheckCircle size={28} strokeWidth={1.5} />
            </div>
            <h1>Email-i u konfirmua!</h1>
            <p className="auth-sub">Llogaria juaj është aktivizuar. Tani mund të hyni.</p>
            <Link to="/hyr" className="btn btn--primary btn--block">
              Hyni në llogari <ArrowRight size={16} strokeWidth={1.5} />
            </Link>
          </>
        )}

        {state === 'error' && (
          <>
            <div className="icon-circle icon-circle--danger">
              <AlertCircle size={24} strokeWidth={1.5} />
            </div>
            <h1>Linku është i pavlefshëm</h1>
            <p className="auth-sub">Linku i konfirmimit mund të ketë skaduar ose është përdorur tashmë.</p>
            <Link to="/harrova-fjalekalimin" className="btn btn--ghost btn--block">
              Kërkoni link të ri <ArrowRight size={16} strokeWidth={1.5} />
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
