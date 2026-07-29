import { useState } from 'react'
import { AlertTriangle, Calendar, CalendarCheck, CalendarClock, CalendarX, Plus, Search } from 'lucide-react'
import { useToast } from '../context/ToastContext'
import { EmptyState } from '../components/ui'

/**
 * `GET /api/admin/appointments` does not exist server-side — confirmed by
 * reading AdminAppointmentsController.cs, which only has POST (create),
 * PUT {id}, POST {id}/cancel and POST {id}/reschedule. There is no list or
 * single-item GET at all. Composing a list from per-doctor calendars
 * (GET /api/doctor/appointments only returns the *calling* doctor's own
 * appointments, scoped by JWT — there is no admin-facing "as doctor X"
 * variant) would mean N sequential/parallel calls per clinic doctor just to
 * approximate a table the backend should serve directly — the prompt's own
 * "avoid if possible" case. Shipping the header, stat-card layout, filter
 * bar and empty state; the actual table is a TODO until the endpoint exists.
 */
export default function AdminAppointmentsPage() {
  const { notify } = useToast()
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')

  return (
    <div className="admin-appts-page">
      <div className="admin-header">
        <div>
          <h1>Terminet</h1>
          <p className="admin-header__sub">Të gjitha terminet e klinikës tuaj në një vend.</p>
        </div>
        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={() => notify('Funksion në zhvillim.', 'info')}
        >
          <Plus size={15} strokeWidth={1.5} /> Rezervo Termin
        </button>
      </div>

      <div className="schedule-info-banner schedule-info-banner--warn">
        <AlertTriangle size={16} strokeWidth={1.5} color="var(--warn)" />
        <span>
          <code>GET /api/admin/appointments</code> nuk ekziston ende në backend — kërkohet një endpoint i ri
          administrativ për listën e termineve të klinikës. Deri sa të shtohet, statistikat më poshtë dhe
          tabela e termineve nuk mund të mbushen me të dhëna reale.
        </span>
      </div>

      <div className="stats-row">
        <StatCard icon={Calendar} label="Sot" />
        <StatCard icon={CalendarClock} label="Në Pritje" />
        <StatCard icon={CalendarCheck} label="Konfirmuar" />
        <StatCard icon={CalendarCheck} label="Përfunduar" />
        <StatCard icon={CalendarX} label="Anuluar" />
      </div>

      <div className="filters">
        <div className="status-tabs">
          {['all', 'pending', 'confirmed', 'today', 'cancelled'].map((s) => (
            <button
              key={s}
              type="button"
              className={`status-tab ${statusFilter === s ? 'is-active' : ''}`}
              onClick={() => setStatusFilter(s)}
            >
              {s === 'all' ? 'Të gjitha' : s === 'pending' ? 'Në pritje' : s === 'confirmed' ? 'Konfirmuar' : s === 'today' ? 'Sot' : 'Anuluar'}
            </button>
          ))}
        </div>
        <div className="filters__field filters__field--grow">
          <label>Kërko</label>
          <div className="appts-search">
            <Search size={14} strokeWidth={1.5} color="var(--muted)" />
            <input
              placeholder="Kërko pacientin ose ID e terminit..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="filters">
        <div className="filters__field">
          <label>Mjeku</label>
          <select disabled>
            <option>Të gjithë mjekët</option>
          </select>
        </div>
        <div className="filters__field">
          <label>Dega</label>
          <select disabled>
            <option>Të gjitha degët</option>
          </select>
        </div>
        <div className="filters__field">
          <label>Prej</label>
          <input type="date" disabled />
        </div>
        <div className="filters__field">
          <label>Deri</label>
          <input type="date" disabled />
        </div>
      </div>

      {/* TODO: wire GET api/admin/appointments when available — render the
          table (Data & Ora / Pacienti / Mjeku-Shërbimi / Dega / Statusi /
          Veprimet) and pagination footer here. */}
      <EmptyState
        icon={Calendar}
        title="Lista e termineve nuk është ende e disponueshme."
        hint="Ky funksion pret shtimin e endpoint-it GET /api/admin/appointments nga backend-i."
      />
    </div>
  )
}

function StatCard({ icon: Icon, label }: { icon: typeof Calendar; label: string }) {
  return (
    <div className="stat-card">
      <div className="stat-card__icon">
        <Icon size={18} strokeWidth={1.5} color="var(--primary)" />
      </div>
      <div>
        <div className="stat-card__count">—</div>
        <div className="stat-card__label">{label}</div>
      </div>
    </div>
  )
}
