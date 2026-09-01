import { useCallback, useEffect, useMemo, useState } from 'react'
import { Calendar, Info, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api, ApiError } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import type { CreateUnavailabilityRequest, UnavailabilityDto } from '../lib/types'
import { useToast } from '../context/ToastContext'
import { CustomSelect, EmptyState, ErrorBox, Modal, SkeletonRows, TimeField } from '../components/ui'
import { monthName, toDateInput, weekdayName } from '../lib/format'

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
  return `${weekdayName(d.getDay())}, ${d.getDate()} ${monthName(d.getMonth())} ${d.getFullYear()}`
}

function formatTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatRange(u: UnavailabilityDto, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const start = toLocalDate(u.startDateTime)
  const end = toLocalDate(u.endDateTime)
  if (sameDay(start, end)) {
    return `${formatDateLabel(start)} · ${formatTime(start)} - ${formatTime(end)}`
  }
  const startShort = `${start.getDate()} ${monthName(start.getMonth())}`
  const endShort = `${end.getDate()} ${monthName(end.getMonth())} ${end.getFullYear()}`
  return `${startShort} – ${endShort} · ${t('unavailability.allDaySuffix')}`
}

function formatDuration(u: UnavailabilityDto, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const ms = toLocalDate(u.endDateTime).getTime() - toLocalDate(u.startDateTime).getTime()
  const minutes = Math.round(ms / 60000)
  if (minutes < 60) return t('unavailability.durationMinutes', { count: minutes })
  const hours = minutes / 60
  if (hours < 24) return t('unavailability.durationHours', { count: Number.isInteger(hours) ? hours : Number(hours.toFixed(1)) })
  const days = Math.round(hours / 24)
  return t('unavailability.durationDays', { count: days })
}

// Split date + time (rather than a single datetime-local value) so the time
// portion can go through TimeField — see TimeField in ui.tsx for why
// datetime-local's native time picker isn't used.
const EMPTY_FORM = { clinicBranchId: '', startDate: '', startTime: '09:00', endDate: '', endTime: '17:00', reason: '' }

export default function UnavailabilityPage() {
  const { t } = useTranslation('doctor')
  const { t: tCommon } = useTranslation('common')
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
      .catch((e) => setError(getErrorMessage(e)))
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
      notify(t('unavailability.deletedToast'), 'ok')
    } catch (e) {
      setRemovingId(null)
      notify(getErrorMessage(e), 'error')
    }
  }

  return (
    <div className="unavail-page">
      <div className="admin-header">
        <div>
          <h1>{t('unavailability.title')}</h1>
          <p className="admin-header__sub">{t('unavailability.subtitle')}</p>
        </div>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => setModalOpen(true)}>
          <Plus size={15} strokeWidth={1.5} /> {t('unavailability.addAbsenceCta')}
        </button>
      </div>

      <div className="schedule-info-banner">
        <Info size={16} strokeWidth={1.5} color="var(--primary)" />
        <span>{t('unavailability.infoBanner')}</span>
      </div>

      {loading ? (
        <SkeletonRows count={3} label={t('unavailability.loadingLabel')} />
      ) : error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title={t('unavailability.emptyTitle')}
          hint={t('unavailability.emptyHint')}
          action={
            <button type="button" className="btn btn--primary btn--sm" onClick={() => setModalOpen(true)}>
              <Plus size={15} strokeWidth={1.5} /> {t('unavailability.addFirstAbsence')}
            </button>
          }
        />
      ) : (
        <>
          {upcoming.length > 0 && (
            <div className="schedule-day-group">
              <div className="schedule-day-group__head">
                <h2>{t('unavailability.activeUpcomingTitle')}</h2>
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
                <h2>{t('unavailability.pastTitle')}</h2>
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
        <Modal title={t('unavailability.deleteModalTitle')} onClose={() => setDeleteTarget(null)}>
          <p className="schedule-delete__text">{t('unavailability.deleteConfirmText')}</p>
          <div className="schedule-delete__actions">
            <button type="button" className="btn btn--ghost btn--sm" style={{ flex: 1 }} onClick={() => setDeleteTarget(null)}>
              {tCommon('buttons.cancel')}
            </button>
            <button
              type="button"
              className="btn btn--sm"
              style={{ flex: 1, background: 'var(--danger)', color: '#fff' }}
              disabled={removingId === deleteTarget.id}
              onClick={confirmDelete}
            >
              {t('unavailability.deleteCta')}
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
  const { t } = useTranslation('doctor')
  return (
    <div className={`schedule-card ${removing ? 'is-removing' : ''}`}>
      <div className="schedule-card__time" style={{ width: 'auto', flexShrink: 0 }}>
        <Calendar size={18} strokeWidth={1.5} color="var(--primary)" />
      </div>
      <div className="schedule-card__main">
        <div className="schedule-card__branch">{formatRange(item, t)}</div>
        <div className="schedule-card__meta">
          <span>{branchName ?? (item.clinicBranchId ? t('unavailability.unknownBranch') : t('unavailability.allBranches'))}</span>
          <span className={item.reason ? '' : 'muted'}>{item.reason || t('unavailability.noReasonSpecified')}</span>
        </div>
        <span className="schedule-day-group__badge" style={{ marginTop: 8, display: 'inline-block' }}>
          {formatDuration(item, t)}
        </span>
      </div>
      <div className="schedule-card__actions">
        <span className={`schedule-card__status ${!isPast ? 'is-active' : ''}`}>{isPast ? t('unavailability.statusPast') : t('unavailability.statusActive')}</span>
        <button type="button" className="schedule-card__delete" onClick={onDelete} aria-label={t('unavailability.deleteAria')}>
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
  const { t } = useTranslation('doctor')
  const { t: tCommon } = useTranslation('common')
  const { notify } = useToast()
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [branchSelectOpen, setBranchSelectOpen] = useState(false)

  function update<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit() {
    if (!form.startDate || !form.endDate) return setFormError(t('unavailability.validation.timesRequired'))
    const start = new Date(`${form.startDate}T${form.startTime}`)
    const end = new Date(`${form.endDate}T${form.endTime}`)
    if (end <= start) return setFormError(t('unavailability.validation.endAfterStart'))
    if (start < new Date()) return setFormError(t('unavailability.validation.notInPast'))

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
      notify(t('unavailability.createdToast'), 'ok')
      onSaved()
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        notify(t('unavailability.conflictToast'), 'error')
      } else {
        setFormError(getErrorMessage(e))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={t('unavailability.addModalTitle')} onClose={onClose}>
      {formError && <ErrorBox message={formError} />}

      <div className="field">
        <CustomSelect
          label={t('unavailability.branchLabel')}
          options={[{ value: '', label: t('unavailability.allBranches') }, ...branchOptions.map((b) => ({ value: b.id, label: b.name }))]}
          value={form.clinicBranchId}
          onChange={(v) => update('clinicBranchId', v)}
          open={branchSelectOpen}
          onOpenChange={setBranchSelectOpen}
        />
      </div>

      <div className="form-row">
        <div className="field">
          <label>{t('unavailability.startLabel')}</label>
          <input type="date" value={form.startDate} onChange={(e) => update('startDate', e.target.value)} />
        </div>
        <TimeField label={t('unavailability.startTimeLabel')} value={form.startTime} onChange={(v) => update('startTime', v)} />
      </div>
      <div className="form-row">
        <div className="field">
          <label>{t('unavailability.endLabel')}</label>
          <input type="date" value={form.endDate} onChange={(e) => update('endDate', e.target.value)} />
        </div>
        <TimeField label={t('unavailability.endTimeLabel')} value={form.endTime} onChange={(v) => update('endTime', v)} />
      </div>

      <div className="field">
        <label>{t('unavailability.reasonLabel')} <span className="muted">{t('unavailability.optional')}</span></label>
        <input
          type="text"
          value={form.reason}
          onChange={(e) => update('reason', e.target.value)}
          placeholder={t('unavailability.reasonPlaceholder')}
        />
      </div>

      <div className="clinic-settings__actions">
        <button type="button" className="btn btn--primary btn--sm" disabled={saving} onClick={handleSubmit}>
          {saving ? t('unavailability.saving') : t('unavailability.addAbsenceSubmit')}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>{tCommon('buttons.cancel')}</button>
      </div>
    </Modal>
  )
}
