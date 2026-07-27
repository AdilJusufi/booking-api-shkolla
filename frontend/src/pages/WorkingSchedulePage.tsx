import { useEffect, useMemo, useState } from 'react'
import { Calendar, Clock, Info, Plus, Trash2 } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import type { CreateWorkingScheduleRequest, DoctorWorkingSchedule } from '../lib/types'
import { useToast } from '../context/ToastContext'
import { EmptyState, ErrorBox, Modal, SkeletonRows } from '../components/ui'

const DAYS_SQ = ['E Diel', 'E Hënë', 'E Martë', 'E Mërkurë', 'E Enjte', 'E Premte', 'E Shtunë']
const MONTHS_ABBR_SQ = ['Jan', 'Shk', 'Mar', 'Pri', 'Maj', 'Qer', 'Kor', 'Gus', 'Sht', 'Tet', 'Nën', 'Dhj']
// Display order Monday-first while the backend's DayOfWeek stays Sunday(0)..Saturday(6).
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

const DAY_OPTIONS = DAY_ORDER.map((d) => ({ value: String(d), label: DAYS_SQ[d] }))

function formatDatePill(iso?: string): string {
  if (!iso) return ''
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return iso
  return `${Number(m[3])} ${MONTHS_ABBR_SQ[Number(m[2]) - 1]}`
}

function validityLabel(s: DoctorWorkingSchedule): string {
  if (!s.validUntil) return 'Pa skadim'
  if (s.validFrom) return `${formatDatePill(s.validFrom)} – ${formatDatePill(s.validUntil)}`
  return `Deri më ${formatDatePill(s.validUntil)}`
}

interface FormState {
  clinicBranchId: string
  dayOfWeek: string
  startTime: string
  endTime: string
  slotDurationMinutes: string
  validFrom: string
  validUntil: string
}

const EMPTY_FORM: FormState = {
  clinicBranchId: '',
  dayOfWeek: '1',
  startTime: '09:00',
  endTime: '17:00',
  slotDurationMinutes: '30',
  validFrom: '',
  validUntil: '',
}

export default function WorkingSchedulePage() {
  const { notify } = useToast()

  const [schedules, setSchedules] = useState<DoctorWorkingSchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showAddModal, setShowAddModal] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<DoctorWorkingSchedule | null>(null)
  const [actingId, setActingId] = useState('')

  function load() {
    setLoading(true)
    setError('')
    api
      .getWorkingSchedules()
      .then(setSchedules)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Ndodhi një gabim.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const branchOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const s of schedules) {
      if (!seen.has(s.clinicBranchId)) seen.set(s.clinicBranchId, s.branchName)
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }))
  }, [schedules])

  const grouped = useMemo(() => {
    const map = new Map<number, DoctorWorkingSchedule[]>()
    for (const s of schedules) {
      const arr = map.get(s.dayOfWeek) ?? []
      arr.push(s)
      map.set(s.dayOfWeek, arr)
    }
    for (const arr of map.values()) arr.sort((a, b) => a.startTime.localeCompare(b.startTime))
    return DAY_ORDER.filter((d) => map.has(d)).map((d) => ({ day: d, items: map.get(d)! }))
  }, [schedules])

  function openAddModal() {
    setForm({ ...EMPTY_FORM, clinicBranchId: branchOptions[0]?.id ?? '' })
    setFormError('')
    setShowAddModal(true)
  }

  function updateField(key: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleCreate() {
    setFormError('')
    if (!form.clinicBranchId) {
      setFormError('Zgjidhni një degë.')
      return
    }
    if (form.endTime <= form.startTime) {
      setFormError('Ora e mbarimit duhet të jetë pas orës së fillimit.')
      return
    }
    const duration = Number(form.slotDurationMinutes)
    if (!duration || duration < 5 || duration > 240) {
      setFormError('Kohëzgjatja e sllotit duhet të jetë mes 5 dhe 240 minuta.')
      return
    }
    if (form.validFrom && form.validUntil && form.validUntil < form.validFrom) {
      setFormError('Data e skadimit duhet të jetë pas datës së fillimit.')
      return
    }

    const payload: CreateWorkingScheduleRequest = {
      clinicBranchId: form.clinicBranchId,
      dayOfWeek: Number(form.dayOfWeek),
      startTime: `${form.startTime}:00`,
      endTime: `${form.endTime}:00`,
      slotDurationMinutes: duration,
      validFrom: form.validFrom || undefined,
      validUntil: form.validUntil || undefined,
    }

    setSaving(true)
    try {
      await api.createWorkingSchedule(payload)
      setShowAddModal(false)
      notify('Orari u shtua.', 'ok')
      load()
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Gabim. Provoni përsëri.')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(schedule: DoctorWorkingSchedule) {
    if (!schedule.isActive) return // no reactivate endpoint exists
    setActingId(schedule.id)
    setSchedules((prev) => prev.map((s) => (s.id === schedule.id ? { ...s, isActive: false } : s)))
    try {
      await api.deleteWorkingSchedule(schedule.id)
      notify('Orari u çaktivizua.', 'ok')
    } catch (e) {
      setSchedules((prev) => prev.map((s) => (s.id === schedule.id ? { ...s, isActive: true } : s)))
      notify(e instanceof ApiError ? e.message : 'Gabim. Provoni përsëri.', 'error')
    } finally {
      setActingId('')
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return
    setActingId(deleteTarget.id)
    try {
      await api.deleteWorkingSchedule(deleteTarget.id)
      notify('Orari u fshi.', 'ok')
      setDeleteTarget(null)
      load()
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Gabim. Provoni përsëri.', 'error')
    } finally {
      setActingId('')
    }
  }

  return (
    <>
      <div className="doctor-cal-header">
        <div>
          <h1>Orari i punës</h1>
          <p className="doctor-cal-header__sub">Menaxhoni oraret javore të punës dhe kohën e sloteve për çdo degë.</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={openAddModal}>
          <Plus size={16} strokeWidth={1.5} /> Shto orar të ri
        </button>
      </div>

      <div className="schedule-info-banner">
        <Info size={16} strokeWidth={1.5} color="var(--primary)" />
        <span>
          Këto orare janë shabllone javore që përsëriten automatikisht. Mund të caktoni vlefshmëri specifike për periudha të caktuara kohore.
        </span>
      </div>

      {loading ? (
        <SkeletonRows count={4} label="Duke ngarkuar oraret" />
      ) : error ? (
        <ErrorBox message={error} />
      ) : schedules.length === 0 ? (
        <div className="schedule-empty">
          <EmptyState icon={Calendar} title="Nuk keni asnjë orar të shtuar ende." />
          <button type="button" className="btn btn--primary" onClick={openAddModal}>
            <Plus size={16} strokeWidth={1.5} /> Shto orar të ri
          </button>
        </div>
      ) : (
        grouped.map(({ day, items }) => (
          <div key={day} className="schedule-day-group">
            <div className="schedule-day-group__head">
              <h2>{DAYS_SQ[day]}</h2>
              <span className="schedule-day-group__badge">
                {items.length} {items.length === 1 ? 'Sesion' : 'Sesione'}
              </span>
            </div>

            {items.map((s) => (
              <div className="schedule-card" key={s.id}>
                <div className="schedule-card__time">
                  <span className="schedule-card__time-label">KOHA</span>
                  <span className="schedule-card__time-start">{s.startTime.slice(0, 5)}</span>
                  <span className="schedule-card__time-end">deri {s.endTime.slice(0, 5)}</span>
                </div>

                <div className="schedule-card__main">
                  <div className="schedule-card__branch">{s.branchName}</div>
                  <div className="schedule-card__meta">
                    <span><Clock size={13} strokeWidth={1.5} /> {s.slotDurationMinutes} min / termin</span>
                    <span><Calendar size={13} strokeWidth={1.5} /> {validityLabel(s)}</span>
                  </div>
                </div>

                <div className="schedule-card__actions">
                  <span className={`schedule-card__status ${s.isActive ? 'is-active' : ''}`}>
                    {s.isActive ? 'AKTIV' : 'JOAKTIV'}
                  </span>
                  <button
                    type="button"
                    className={`schedule-toggle ${s.isActive ? 'is-on' : ''}`}
                    role="switch"
                    aria-checked={s.isActive}
                    disabled={actingId === s.id || !s.isActive}
                    onClick={() => handleToggle(s)}
                  >
                    <span className="schedule-toggle__knob" />
                  </button>
                  <button
                    type="button"
                    className="schedule-card__delete"
                    onClick={() => setDeleteTarget(s)}
                    aria-label="Fshi orarin"
                  >
                    <Trash2 size={16} strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))
      )}

      {showAddModal && (
        <Modal title="Shto orar të ri" onClose={() => setShowAddModal(false)}>
          {formError && <ErrorBox message={formError} />}
          <div className="field">
            <label>Dega</label>
            {branchOptions.length === 0 ? (
              <p className="field__note">
                Nuk ka degë të disponueshme. Shtoni një orar për një degë me anë të stafit administrativ së pari,
                ose kontaktoni administratorin e klinikës.
              </p>
            ) : (
              <select value={form.clinicBranchId} onChange={(e) => updateField('clinicBranchId', e.target.value)}>
                {branchOptions.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            )}
          </div>

          <div className="field">
            <label>Dita e javës</label>
            <select value={form.dayOfWeek} onChange={(e) => updateField('dayOfWeek', e.target.value)}>
              {DAY_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <div className="field">
              <label>Ora e fillimit</label>
              <input type="time" value={form.startTime} onChange={(e) => updateField('startTime', e.target.value)} />
            </div>
            <div className="field">
              <label>Ora e mbarimit</label>
              <input type="time" value={form.endTime} onChange={(e) => updateField('endTime', e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label>Kohëzgjatja e sllotit (minuta)</label>
            <input
              type="number"
              min={5}
              max={240}
              value={form.slotDurationMinutes}
              onChange={(e) => updateField('slotDurationMinutes', e.target.value)}
            />
          </div>

          <div className="form-row">
            <div className="field">
              <label>Vlefshëm nga <span className="muted">(opsional)</span></label>
              <input type="date" value={form.validFrom} onChange={(e) => updateField('validFrom', e.target.value)} />
            </div>
            <div className="field">
              <label>Vlefshëm deri <span className="muted">(opsional)</span></label>
              <input type="date" value={form.validUntil} onChange={(e) => updateField('validUntil', e.target.value)} />
            </div>
          </div>

          <button
            type="button"
            className="btn btn--primary btn--block"
            disabled={saving || branchOptions.length === 0}
            onClick={handleCreate}
          >
            {saving ? 'Duke ruajtur…' : 'Shto orarin'}
          </button>
        </Modal>
      )}

      {deleteTarget && (
        <Modal title="Fshi orarin" onClose={() => setDeleteTarget(null)}>
          <p className="schedule-delete__text">
            Jeni i sigurt që dëshironi të fshini orarin për <strong>{DAYS_SQ[deleteTarget.dayOfWeek]}</strong> në{' '}
            <strong>{deleteTarget.branchName}</strong>?
          </p>
          <div className="schedule-delete__actions">
            <button type="button" className="btn btn--ghost btn--sm" style={{ flex: 1 }} onClick={() => setDeleteTarget(null)}>
              Anulo
            </button>
            <button
              type="button"
              className="doctor-btn-danger"
              style={{ flex: 1 }}
              disabled={actingId === deleteTarget.id}
              onClick={handleConfirmDelete}
            >
              {actingId === deleteTarget.id ? 'Duke fshirë…' : 'Po, fshije'}
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
