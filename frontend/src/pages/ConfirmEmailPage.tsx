import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertCircle, ArrowRight, CheckCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api, ApiError } from '../lib/api'
import { getAuthTokenInvalidMessage, getErrorMessage } from '../lib/errors'
import { ErrorBox, Pending } from '../components/ui'
import Logo from '../components/Logo'

type ConfirmState = 'loading' | 'success' | 'invalid' | 'error'

export default function ConfirmEmailPage() {
  const { t: tCommon } = useTranslation('common')
  const { t } = useTranslation('auth')
  const [searchParams] = useSearchParams()
  const [state, setState] = useState<ConfirmState>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [retryToken, setRetryToken] = useState(0)

  useEffect(() => {
    const token = searchParams.get('token')
    const email = searchParams.get('email')
    if (!token || !email) {
      setState('invalid')
      return
    }
    setState('loading')
    api
      .confirmEmail(token, email)
      .then(() => setState('success'))
      .catch((err) => {
        // A genuine network/server failure is not the same state as "this
        // link is invalid" — the former is worth retrying, the latter isn't.
        if (err instanceof ApiError && (err.status === 0 || err.status >= 500)) {
          setErrorMessage(getErrorMessage(err))
          setState('error')
        } else {
          setState('invalid')
        }
      })
  }, [searchParams, retryToken])

  return (
    <div className="confirm-email-page">
      <div className="auth-card">
        <span className="brand">
          <span className="brand__mark" aria-hidden><Logo size={22} /></span>
          <span className="brand__name">{tCommon('brand.name')}<span className="brand__tld">{tCommon('brand.tld')}</span></span>
        </span>

        {state === 'loading' && (
          <div className="confirm-email-page__pending">
            <Pending />
            <p>{t('confirmEmail.pending')}</p>
          </div>
        )}

        {state === 'success' && (
          <>
            <div className="icon-circle icon-circle--ok">
              <CheckCircle size={28} strokeWidth={1.5} />
            </div>
            <h1>{t('confirmEmail.successTitle')}</h1>
            <p className="auth-sub">{t('confirmEmail.successBody')}</p>
            <Link to="/hyr" className="btn btn--primary btn--block">
              {t('login.submit')} <ArrowRight size={16} strokeWidth={1.5} />
            </Link>
          </>
        )}

        {state === 'invalid' && (
          <>
            <div className="icon-circle icon-circle--danger">
              <AlertCircle size={24} strokeWidth={1.5} />
            </div>
            <h1>{t('confirmEmail.invalidTitle')}</h1>
            <p className="auth-sub">{getAuthTokenInvalidMessage()}</p>
            <Link to="/" className="btn btn--ghost btn--block">
              {tCommon('buttons.backHome')} <ArrowRight size={16} strokeWidth={1.5} />
            </Link>
          </>
        )}

        {state === 'error' && (
          <>
            <ErrorBox message={errorMessage} onRetry={() => setRetryToken((n) => n + 1)} />
          </>
        )}
      </div>
    </div>
  )
}
