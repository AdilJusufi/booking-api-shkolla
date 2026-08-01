import { useState } from 'react'
import { AlertTriangle, UserCog } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useToast } from '../context/ToastContext'
import { ErrorBox } from '../components/ui'

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * There is no `GET /api/admin/users` endpoint — only
 * `POST /api/admin/users/{id}/deactivate` and `.../activate` exist server-side.
 * The filter row, search, and table this page is supposed to have cannot be
 * built without a real user backing them; showing one would mean displaying
 * fabricated rows. This page ships as an honest shell: the by-ID actions that
 * do exist, wired up, plus a visible note about the missing list endpoint.
 */
export default function UsersPage() {
  const { notify } = useToast()
  const [userId, setUserId] = useState('')
  const [acting, setActing] = useState<'activate' | 'deactivate' | null>(null)
  const [error, setError] = useState('')

  async function runAction(action: 'activate' | 'deactivate') {
    setError('')
    if (!GUID_RE.test(userId.trim())) {
      setError('Shkruani një ID të vlefshme përdoruesi (GUID).')
      return
    }
    setActing(action)
    try {
      if (action === 'activate') await api.activateUser(userId.trim())
      else await api.deactivateUser(userId.trim())
      notify(action === 'activate' ? 'Përdoruesi u aktivizua.' : 'Përdoruesi u çaktivizua.', 'ok')
      setUserId('')
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Gabim. Provoni përsëri.', 'error')
    } finally {
      setActing(null)
    }
  }

  return (
    <div className="sa-users-page">
      <div className="admin-header">
        <div>
          <h1>Menaxhimi i Përdoruesve</h1>
          <p className="admin-header__sub">Aktivizoni ose çaktivizoni llogaritë e përdoruesve në platformë.</p>
        </div>
      </div>

      <div className="schedule-info-banner schedule-info-banner--warn">
        <AlertTriangle size={16} strokeWidth={1.5} color="var(--warn)" />
        <span>
          <code>GET /api/admin/users</code> nuk ekziston ende në backend — vetëm veprimet
          <code> activate</code>/<code>deactivate</code> janë të disponueshme, të dyja pranojnë vetëm një ID
          përdoruesi. Tabela e listës, filtrat sipas rolit/statusit dhe kërkimi sipas emrit/email-it kërkojnë
          këtë endpoint dhe nuk mund të ndërtohen deri sa të shtohet.
        </span>
      </div>

      <div className="admin-card" style={{ maxWidth: 480 }}>
        <div className="clinic-settings__card-head">
          <h2><UserCog size={16} strokeWidth={1.5} style={{ verticalAlign: -3, marginRight: 8 }} />Veprim me ID Përdoruesi</h2>
        </div>

        {error && <ErrorBox message={error} />}

        <div className="field">
          <label>ID e Përdoruesit</label>
          <input
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="p.sh. 3fa85f64-5717-4562-b3fc-2c963f66afa6"
          />
        </div>

        <div className="clinic-settings__actions">
          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={acting !== null}
            onClick={() => runAction('activate')}
          >
            {acting === 'activate' ? 'Duke aktivizuar…' : 'Aktivizo'}
          </button>
          <button
            type="button"
            className="btn btn--sm"
            style={{ background: 'var(--danger)', color: '#fff' }}
            disabled={acting !== null}
            onClick={() => runAction('deactivate')}
          >
            {acting === 'deactivate' ? 'Duke çaktivizuar…' : 'Çaktivizo'}
          </button>
        </div>
      </div>
    </div>
  )
}
