import { useCallback, useEffect, useMemo, useState } from 'react'
import { Calendar, Info, Plus, Trash2 } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import type { CreateUnavailabilityRequest, UnavailabilityDto } from '../lib/types'
import { useToast } from '../context/ToastContext'
import { EmptyState, ErrorBox, Modal, SkeletonRows } from '../components/ui'
import { toDateInput } from '../lib/format'

const DAYS_SQ = ['E Diel', 'E Hënë', 'E Martë', 'E Mërkurë', 'E Enjte', 'E Premte', 'E Shtunë']
const MONTHS_SQ = ['Janar', 'Shkurt', 'Mars', 'Prill', 'Maj', 'Qershor', 'Korrik', 'Gusht', 'Shtator', 'Tetor', 'Nëntor', 'Dhjetor']

// GET /api/doctor/unavailability defaults to a 30-day forward window when no
// from/to is passed — nowhere near enough to populate an "Aktive / të
// Ardhshme" + "të Kaluara" grouped view. Pull a wide, explicit range instead.
const RANGE_PAST_DAYS = 90
const RANGE_FUTURE_DAYS = 365

function toLocalDate(iso: string): Date {
  return new Date(iso)
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function formatDateLabel(d: Date): string {
  return `${DAYS_SQ[d.getDay()]}, ${d.getDate()} ${MONTHS_SQ[d.getMonth()]} ${d.getFullYear()}`
}

function formatTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatRange(u: UnavailabilityDto): string {
  const start = toLocalDate(u.startDateTime)
  const end = toLocalDate(u.endDateTime)
  if (sameDay(start, end)) {
    return `${formatDateLabel(start)} · ${formatTime(start)} - ${formatTime(end)}`
  }
  const startShort = `${start.getDate()} ${MONTHS_SQ[start.getMonth()]}`
  const endShort = `${end.getDate()} ${MONTHS_SQ[end.getMonth()]} ${end.getFullYear()}`
  return `${startShort} – ${endShort} · Gjithë ditën`
}

function formatDuration(u: UnavailabilityDto): string {
  const ms = toLocalDate(u.endDateTime).getTime() - toLocalDate(u.startDateTime).getTime()
  const minutes = Math.round(ms / 60000)
  if (minutes < 60) return `${minutes} minuta`
  const hours = minutes / 60
  if (hours < 24) return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} orë`
  const days = Math.round(hours / 24)
  return `${days} ditë`
}

const EMPTY_FORM = { clinicBranchId: '', startDateTime: '', endDateTime: '', reason: '' }

export default function UnavailabilityPage() {
  const { notify } = useToast()

  const [items, setItems] = useState<UnavailabilityDto[]>([])
  const [branchNames, setBranchNames] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<UnavailabilityDto | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    const today = new Date()
    const from = toDateInput(new Date(today.getFullYear(), today.getMonth(), today.getDate() - RANGE_PAST_DAYS))
    const to = toDateInput(new Date(today.getFullYear(), today.getMonth(), today.getDate() + RANGE_FUTURE_DAYS))

    Promise.all([api.getUnavailability(from, to), api.getWorkingSchedules()])
      .then(([unavailabilities, schedules]) => {
        setItems(unavailabilities)
        const names = new Map<string, string>()
        for (const s of schedules) names.set(s.clinicBranchId, s.branchName)
        setBranchNames(names)
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Ndodhi një gabim.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  const branchOptions = useMemo(() => Array.from(branchNames.entries()).map(([id, name]) => ({ id, name })), [branchNames])

  const { upcoming, past } = useMemo(() => {
    const now = Date.now()
    const upcoming: UnavailabilityDto[] = []
    const past: UnavailabilityDto[] = []
    for (const u of items) {
      ;(toLocalDate(u.endDateTime).getTime() >= now ? upcoming : past).push(u)
    }
    upcoming.sort((a, b) => toLocalDate(a.startDateTime).getTime() - toLocalDate(b.startDateTime).getTime())
    past.sort((a, b) => toLocalDate(b.startDateTime).getTime() - toLocalDate(a.startDateTime).getTime())
    return { upcoming, past }
  }, [items])

  async function confirmDelete() {
    if (!deleteTarget) return
    const target = deleteTarget
    setRemovingId(target.id)
    try {
      await api.deleteUnavailability(target.id)
      setTimeout(() => {
        setItems((prev) => prev.filter((u) => u.id !== target.id))
        setRemovingId(null)
      }, 220)
      setDeleteTarget(null)
      notify('Mungesa u fshi.', 'ok')
    } catch (e) {
      setRemovingId(null)
      notify(e instanceof ApiError ? e.message : 'Gabim. Provoni përsëri.', 'error')
    }
  }

  return (
    <div className="unavail-page">
      <div className="admin-header">
        <div>
          <h1>Mungesat &amp; Pushimet</h1>
          <p className="admin-header__sub">Bllokoni periudha kur nuk jeni të disponueshëm për termine.</p>
        </div>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => setModalOpen(true)}>
          <Plus size={15} strokeWidth={1.5} /> Shto Mungesë
        </button>
      </div>

      <div className="schedule-info-banner">
        <Info size={16} strokeWidth={1.5} color="var(--primary)" />
        <span>Gjatë periudhave të bllokuara, pacientët nuk do të mund të rezervojnë termine me ju.</span>
      </div>

      {error && <ErrorBox message={error} />}

      {loading ? (
        <SkeletonRows count={3} label="Duke ngarkuar mungesat" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="Nuk keni asnjë mungesë të planifikuar."
          hint="Shtoni mungesat tuaja që pacientët të mos rezervojnë në ato periudha."
          action={
            <button type="button" className="btn btn--primary btn--sm" onClick={() => setModalOpen(true)}>
              <Plus size={15} strokeWidth={1.5} /> Shto Mungesën e Parë
            </button>
          }
        />
      ) : (
        <>
          {upcoming.length > 0 && (
            <div className="schedule-day-group">
              <div className="schedule-day-group__head">
                <h2>Aktive / të Ardhshme</h2>
                <span className="schedule-day-group__badge">{upcoming.length}</span>
              </div>
              {upcoming.map((u) => (
                <UnavailabilityCard
                  key={u.id}
                  item={u}
                  branchName={u.clinicBranchId ? branchNames.get(u.clinicBranchId) : undefined}
                  isPast={false}
                  removing={removingId === u.id}
                  onDelete={() => setDeleteTarget(u)}
                />
              ))}
            </div>
          )}

          {past.length > 0 && (
            <div className="schedule-day-group" style={{ opacity: 0.7 }}>
              <div className="schedule-day-group__head">
                <h2>Të Kaluara</h2>
                <span className="schedule-day-group__badge">{past.length}</span>
              </div>
              {past.map((u) => (
                <UnavailabilityCard
                  key={u.id}
                  item={u}
                  branchName={u.clinicBranchId ? branchNames.get(u.clinicBranchId) : undefined}
                  isPast
                  removing={removingId === u.id}
                  onDelete={() => setDeleteTarget(u)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {modalOpen && (
        <UnavailabilityFormModal
          branchOptions={branchOptions}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false)
            load()
          }}
        />
      )}

      {deleteTarget && (
        <Modal title="Fshi Mungesën" onClose={() => setDeleteTarget(null)}>
          <p className="schedule-delete__text">A jeni të sigurt që dëshironi ta fshini këtë mungesë?</p>
          <div className="schedule-delete__actions">
            <button type="button" className="btn btn--ghost btn--sm" style={{ flex: 1 }} onClick={() => setDeleteTarget(null)}>
              Anulo
            </button>
            <button
              type="button"
              className="btn btn--sm"
              style={{ flex: 1, background: 'var(--danger)', color: '#fff' }}
              disabled={removingId === deleteTarget.id}
              onClick={confirmDelete}
            >
              Fshi
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function UnavailabilityCard({
  item,
  branchName,
  isPast,
  removing,
  onDelete,
}: {
  item: UnavailabilityDto
  branchName?: string
  isPast: boolean
  removing: boolean
  onDelete: () => void
}) {
  return (
    <div className={`schedule-card ${removing ? 'is-removing' : ''}`}>
      <div className="schedule-card__time" style={{ width: 'auto', flexShrink: 0 }}>
        <Calendar size={18} strokeWidth={1.5} color="var(--primary)" />
      </div>
      <div className="schedule-card__main">
        <div className="schedule-card__branch">{formatRange(item)}</div>
        <div className="schedule-card__meta">
          <span>{branchName ?? (item.clinicBranchId ? 'Degë e panjohur' : 'Të gjitha degët')}</span>
          <span className={item.reason ? '' : 'muted'}>{item.reason || 'Pa arsye të specifikuar'}</span>
        </div>
        <span className="schedule-day-group__badge" style={{ marginTop: 8, display: 'inline-block' }}>
          {formatDuration(item)}
        </span>
      </div>
      <div className="schedule-card__actions">
        <span className={`schedule-card__status ${!isPast ? 'is-active' : ''}`}>{isPast ? 'E KALUAR' : 'AKTIVE'}</span>
        <button type="button" className="schedule-card__delete" onClick={onDelete} aria-label="Fshi mungesën">
          <Trash2 size={16} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  )
}

function UnavailabilityFormModal({
  branchOptions,
  onClose,
  onSaved,
}: {
  branchOptions: { id: string; name: string }[]
  onClose: () => void
  onSaved: () => void
}) {
  const { notify } = useToast()
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  function update<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit() {
    if (!form.startDateTime || !form.endDateTime) return setFormError('Ora e fillimit dhe mbarimit janë të detyrueshme.')
    const start = new Date(form.startDateTime)
    const end = new Date(form.endDateTime)
    if (end <= start) return setFormError('Koha e mbarimit duhet të jetë pas fillimit.')
    if (start < new Date()) return setFormError('Nuk mund të shtoni mungesë në të kaluarën.')

    setFormError('')
    setSaving(true)
    try {
      const payload: CreateUnavailabilityRequest = {
        clinicBranchId: form.clinicBranchId || undefined,
        startDateTime: start.toISOString(),
        endDateTime: end.toISOString(),
        reason: form.reason.trim() || undefined,
      }
      await api.createUnavailability(payload)
      notify('Mungesa u shtua me sukses.', 'ok')
      onSaved()
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        notify('Keni termine të konfirmuara në këtë periudhë. Ju lutem ricaktoni ato fillimisht.', 'error')
      } else {
        setFormError(e instanceof ApiError ? e.message : 'Gabim. Provoni përsëri.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Shto Mungesë" onClose={onClose}>
      {formError && <ErrorBox message={formError} />}

      <div className="field">
        <label>Dega</label>
        <select value={form.clinicBranchId} onChange={(e) => update('clinicBranchId', e.target.value)}>
          <option value="">Të gjitha degët</option>
          {branchOptions.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>

      <div className="form-row">
        <div className="field">
          <label>Data &amp; Ora e Fillimit</label>
          <input type="datetime-local" value={form.startDateTime} onChange={(e) => update('startDateTime', e.target.value)} />
        </div>
        <div className="field">
          <label>Data &amp; Ora e Mbarimit</label>
          <input type="datetime-local" value={form.endDateTime} onChange={(e) => update('endDateTime', e.target.value)} />
        </div>
      </div>

      <div className="field">
        <label>Arsyeja <span className="muted">(opsionale)</span></label>
        <input
          type="text"
          value={form.reason}
          onChange={(e) => update('reason', e.target.value)}
          placeholder="p.sh. Pushime, Konferencë, Sëmundje..."
        />
      </div>

      <div className="clinic-settings__actions">
        <button type="button" className="btn btn--primary btn--sm" disabled={saving} onClick={handleSubmit}>
          {saving ? 'Duke ruajtur…' : 'Shto Mungesën'}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>Anulo</button>
      </div>
    </Modal>
  )
}
