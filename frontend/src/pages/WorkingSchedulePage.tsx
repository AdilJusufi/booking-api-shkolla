import { useEffect, useMemo, useState } from 'react'
import { Calendar, Clock, Info, Plus, Trash2 } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import type { CreateWorkingScheduleRequest, DoctorBranch, DoctorWorkingSchedule } from '../lib/types'
import { useToast } from '../context/ToastContext'
import { CustomSelect, EmptyState, ErrorBox, Modal, SkeletonRows, TimeField, WeekdayMultiSelect } from '../components/ui'
import { DAY_ORDER, monthName, weekdayName } from '../lib/format'

function formatDatePill(iso?: string): string {
  if (!iso) return ''
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return iso
  return `${Number(m[3])} ${monthName(Number(m[2]) - 1, 'short')}`
}

function validityLabel(s: DoctorWorkingSchedule, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (!s.validUntil) return t('workingSchedule.noExpiry')
  if (s.validFrom) return t('workingSchedule.validRange', { from: formatDatePill(s.validFrom), to: formatDatePill(s.validUntil) })
  return t('workingSchedule.validUntilOnly', { date: formatDatePill(s.validUntil) })
}

type ScheduleFormMode = 'single' | 'range'

interface FormState {
  clinicBranchId: string
  dayOfWeek: string
  selectedDays: number[]
  startTime: string
  endTime: string
  slotDurationMinutes: string
  validFrom: string
  validUntil: string
}

const EMPTY_FORM: FormState = {
  clinicBranchId: '',
  dayOfWeek: '1',
  selectedDays: [],
  startTime: '09:00',
  endTime: '17:00',
  slotDurationMinutes: '30',
  validFrom: '',
  validUntil: '',
}

/** Per-day outcome of a range submission — kept visible until the user dismisses it, not a transient toast, since it can list several failures at once. */
interface RangeSubmitResult {
  succeededDays: number[]
  failedDays: { day: number; message: string }[]
}

export default function WorkingSchedulePage() {
  const { t } = useTranslation('doctor')
  const { t: tCommon } = useTranslation('common')
  const { notify } = useToast()

  const [schedules, setSchedules] = useState<DoctorWorkingSchedule[]>([])
  const [branches, setBranches] = useState<DoctorBranch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showAddModal, setShowAddModal] = useState(false)
  const [scheduleMode, setScheduleMode] = useState<ScheduleFormMode>('single')
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [openField, setOpenField] = useState<'branch' | 'day' | null>(null)
  const [rangeResult, setRangeResult] = useState<RangeSubmitResult | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<DoctorWorkingSchedule | null>(null)
  const [actingId, setActingId] = useState('')

  // Recomputed on every render (not module-level) so a language switch
  // relabels these immediately — weekdayName() reads the active i18n
  // language at call time.
  const dayOptions = DAY_ORDER.map((d) => ({ value: String(d), label: weekdayName(d) }))

  function load() {
    setLoading(true)
    setError('')
    Promise.all([api.getWorkingSchedules(), api.getMyBranches()])
      .then(([scheduleList, branchList]) => {
        setSchedules(scheduleList)
        setBranches(branchList)
      })
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  // Branches come from the doctor's own DoctorClinicBranch assignments
  // (getMyBranches), NOT derived from existing schedules — a doctor with
  // branches but zero schedules yet (exactly the case this form exists for)
  // would otherwise always see "no branches available".
  const branchOptions = useMemo(
    () => branches.map((b) => ({ id: b.branchId, name: b.branchName })),
    [branches],
  )

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
    setScheduleMode('single')
    setRangeResult(null)
    setShowAddModal(true)
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  /** Shared per-day validation — same rules for single-day and every day in range mode. */
  function validateCommonFields(): string | null {
    if (!form.clinicBranchId) return t('workingSchedule.validation.branchRequired')
    if (form.endTime <= form.startTime) return t('workingSchedule.validation.endAfterStart')
    const duration = Number(form.slotDurationMinutes)
    if (!duration || duration < 5 || duration > 240) return t('workingSchedule.validation.durationRange')
    if (form.validFrom && form.validUntil && form.validUntil < form.validFrom) {
      return t('workingSchedule.validation.validUntilAfterFrom')
    }
    return null
  }

  function buildPayload(dayOfWeek: number): CreateWorkingScheduleRequest {
    return {
      clinicBranchId: form.clinicBranchId,
      dayOfWeek,
      startTime: `${form.startTime}:00`,
      endTime: `${form.endTime}:00`,
      slotDurationMinutes: Number(form.slotDurationMinutes),
      validFrom: form.validFrom || undefined,
      validUntil: form.validUntil || undefined,
    }
  }

  async function handleCreate() {
    setFormError('')
    setRangeResult(null)
    const validationError = validateCommonFields()
    if (validationError) return setFormError(validationError)

    if (scheduleMode === 'single') {
      setSaving(true)
      try {
        await api.createWorkingSchedule(buildPayload(Number(form.dayOfWeek)))
        setShowAddModal(false)
        notify(t('workingSchedule.createdToast'), 'ok')
        load()
      } catch (e) {
        setFormError(getErrorMessage(e))
      } finally {
        setSaving(false)
      }
      return
    }

    // Range mode: each day is its own independent request, not a new bulk
    // endpoint — the backend's overlap check is already scoped per (doctor,
    // branch, dayOfWeek), so different days structurally can't conflict with
    // each other in one submission, and the desired UX (partial success, no
    // rollback) is exactly what N independent calls give for free. Fired in
    // parallel via allSettled rather than sequentially — same round trips
    // either way, but faster and simpler than threading an abort-on-first-
    // failure loop.
    if (form.selectedDays.length === 0) return setFormError(t('workingSchedule.validation.daysRequired'))

    setSaving(true)
    const results = await Promise.allSettled(
      form.selectedDays.map((day) => api.createWorkingSchedule(buildPayload(day))),
    )
    setSaving(false)

    const succeededDays: number[] = []
    const failedDays: { day: number; message: string }[] = []
    results.forEach((r, i) => {
      const day = form.selectedDays[i]
      if (r.status === 'fulfilled') succeededDays.push(day)
      else failedDays.push({ day, message: getErrorMessage(r.reason) })
    })

    load() // whatever succeeded should show up behind the modal even if some failed

    if (failedDays.length === 0) {
      setShowAddModal(false)
      notify(t('workingSchedule.rangeCreatedToast', { count: succeededDays.length }), 'ok')
    } else {
      // Kept in the modal (not a toast) — a toast disappears in 4s, and a
      // partial-failure result with per-day reasons deserves to stay visible
      // until the user has actually read it and decided what to do next.
      setRangeResult({ succeededDays, failedDays })
    }
  }

  async function handleToggle(schedule: DoctorWorkingSchedule) {
    if (!schedule.isActive) return // no reactivate endpoint exists
    setActingId(schedule.id)
    setSchedules((prev) => prev.map((s) => (s.id === schedule.id ? { ...s, isActive: false } : s)))
    try {
      await api.deleteWorkingSchedule(schedule.id)
      notify(t('workingSchedule.deactivatedToast'), 'ok')
    } catch (e) {
      setSchedules((prev) => prev.map((s) => (s.id === schedule.id ? { ...s, isActive: true } : s)))
      notify(getErrorMessage(e), 'error')
    } finally {
      setActingId('')
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return
    setActingId(deleteTarget.id)
    try {
      await api.deleteWorkingSchedule(deleteTarget.id)
      notify(t('workingSchedule.deletedToast'), 'ok')
      setDeleteTarget(null)
      load()
    } catch (e) {
      notify(getErrorMessage(e), 'error')
    } finally {
      setActingId('')
    }
  }

  return (
    <>
      <div className="doctor-cal-header">
        <div>
          <h1>{t('workingSchedule.title')}</h1>
          <p className="doctor-cal-header__sub">{t('workingSchedule.subtitle')}</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={openAddModal}>
          <Plus size={16} strokeWidth={1.5} /> {t('workingSchedule.addScheduleCta')}
        </button>
      </div>

      <div className="schedule-info-banner">
        <Info size={16} strokeWidth={1.5} color="var(--primary)" />
        <span>
          {t('workingSchedule.infoBanner')}
        </span>
      </div>

      {loading ? (
        <SkeletonRows count={4} label={t('workingSchedule.loadingLabel')} />
      ) : error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : schedules.length === 0 ? (
        <div className="schedule-empty">
          <EmptyState icon={Calendar} title={t('workingSchedule.emptyTitle')} />
          <button type="button" className="btn btn--primary" onClick={openAddModal}>
            <Plus size={16} strokeWidth={1.5} /> {t('workingSchedule.addScheduleCta')}
          </button>
        </div>
      ) : (
        grouped.map(({ day, items }) => (
          <div key={day} className="schedule-day-group">
            <div className="schedule-day-group__head">
              <h2>{weekdayName(day)}</h2>
              <span className="schedule-day-group__badge">
                {t('workingSchedule.sessionCount', { count: items.length })}
              </span>
            </div>

            {items.map((s) => (
              <div className="schedule-card" key={s.id}>
                <div className="schedule-card__time">
                  <span className="schedule-card__time-label">{t('workingSchedule.timeLabel')}</span>
                  <span className="schedule-card__time-start">{s.startTime.slice(0, 5)}</span>
                  <span className="schedule-card__time-end">{t('workingSchedule.until', { time: s.endTime.slice(0, 5) })}</span>
                </div>

                <div className="schedule-card__main">
                  <div className="schedule-card__branch">{s.branchName}</div>
                  <div className="schedule-card__meta">
                    <span><Clock size={13} strokeWidth={1.5} /> {t('workingSchedule.perAppointment', { count: s.slotDurationMinutes })}</span>
                    <span><Calendar size={13} strokeWidth={1.5} /> {validityLabel(s, t)}</span>
                  </div>
                </div>

                <div className="schedule-card__actions">
                  <span className={`schedule-card__status ${s.isActive ? 'is-active' : ''}`}>
                    {s.isActive ? t('workingSchedule.statusActive') : t('workingSchedule.statusInactive')}
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
                    aria-label={t('workingSchedule.deleteAria')}
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
        <Modal title={t('workingSchedule.addModalTitle')} onClose={() => setShowAddModal(false)}>
          {formError && <ErrorBox message={formError} />}

          {rangeResult && (
            <div className="range-result">
              {rangeResult.succeededDays.length > 0 && (
                <p className="range-result__success">
                  <Trans
                    i18nKey="workingSchedule.rangePartialSuccess"
                    ns="doctor"
                    values={{
                      count: rangeResult.succeededDays.length,
                      total: rangeResult.succeededDays.length + rangeResult.failedDays.length,
                    }}
                    components={[<strong key="0" />]}
                  />
                </p>
              )}
              <ul className="range-result__failures">
                {rangeResult.failedDays.map(({ day, message }) => (
                  <li key={day}>
                    <strong>{weekdayName(day)}</strong>: {message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="tabs" role="tablist" aria-label={t('workingSchedule.modeLabel')}>
            <button
              type="button"
              role="tab"
              aria-selected={scheduleMode === 'single'}
              className={`tab ${scheduleMode === 'single' ? 'is-active' : ''}`}
              onClick={() => { setScheduleMode('single'); setRangeResult(null) }}
            >
              {t('workingSchedule.modeSingle')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={scheduleMode === 'range'}
              className={`tab ${scheduleMode === 'range' ? 'is-active' : ''}`}
              onClick={() => { setScheduleMode('range'); setRangeResult(null) }}
            >
              {t('workingSchedule.modeRange')}
            </button>
          </div>

          {branchOptions.length === 0 ? (
            <div className="field">
              <label>{t('workingSchedule.branchLabel')}</label>
              <p className="field__note">
                {t('workingSchedule.noBranchesAvailable')}
              </p>
            </div>
          ) : (
            <div className="field">
              <CustomSelect
                label={t('workingSchedule.branchLabel')}
                options={branchOptions.map((b) => ({ value: b.id, label: b.name }))}
                value={form.clinicBranchId}
                onChange={(v) => updateField('clinicBranchId', v)}
                open={openField === 'branch'}
                onOpenChange={(isOpen) => setOpenField(isOpen ? 'branch' : null)}
              />
            </div>
          )}

          {scheduleMode === 'single' ? (
            <div className="field">
              <CustomSelect
                label={t('workingSchedule.dayOfWeekLabel')}
                options={dayOptions}
                value={form.dayOfWeek}
                onChange={(v) => updateField('dayOfWeek', v)}
                open={openField === 'day'}
                onOpenChange={(isOpen) => setOpenField(isOpen ? 'day' : null)}
              />
            </div>
          ) : (
            <div className="field">
              <label>{t('workingSchedule.daysLabel')}</label>
              <WeekdayMultiSelect
                selectedDays={form.selectedDays}
                onChange={(days) => updateField('selectedDays', days)}
                fromLabel={t('workingSchedule.rangeFromLabel')}
                toLabel={t('workingSchedule.rangeToLabel')}
                applyRangeCta={t('workingSchedule.rangeApplyCta')}
              />
            </div>
          )}

          <div className="form-row">
            <TimeField label={t('workingSchedule.startTimeLabel')} value={form.startTime} onChange={(v) => updateField('startTime', v)} />
            <TimeField label={t('workingSchedule.endTimeLabel')} value={form.endTime} onChange={(v) => updateField('endTime', v)} />
          </div>

          <div className="field">
            <label>{t('workingSchedule.slotDurationLabel')}</label>
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
              <label>{t('workingSchedule.validFromLabel')} <span className="muted">{t('workingSchedule.optional')}</span></label>
              <input type="date" value={form.validFrom} onChange={(e) => updateField('validFrom', e.target.value)} />
            </div>
            <div className="field">
              <label>{t('workingSchedule.validUntilLabel')} <span className="muted">{t('workingSchedule.optional')}</span></label>
              <input type="date" value={form.validUntil} onChange={(e) => updateField('validUntil', e.target.value)} />
            </div>
          </div>

          <button
            type="button"
            className="btn btn--primary btn--block"
            disabled={saving || branchOptions.length === 0}
            onClick={handleCreate}
          >
            {saving
              ? t('workingSchedule.saving')
              : scheduleMode === 'single'
                ? t('workingSchedule.addScheduleSubmit')
                : t('workingSchedule.addRangeSubmit')}
          </button>
        </Modal>
      )}

      {deleteTarget && (
        <Modal title={t('workingSchedule.deleteModalTitle')} onClose={() => setDeleteTarget(null)}>
          <p className="schedule-delete__text">
            <Trans
              i18nKey="workingSchedule.deleteConfirmText"
              ns="doctor"
              values={{ day: weekdayName(deleteTarget.dayOfWeek), branch: deleteTarget.branchName }}
              components={[<strong key="0" />, <strong key="1" />]}
            />
          </p>
          <div className="schedule-delete__actions">
            <button type="button" className="btn btn--ghost btn--sm" style={{ flex: 1 }} onClick={() => setDeleteTarget(null)}>
              {tCommon('buttons.cancel')}
            </button>
            <button
              type="button"
              className="doctor-btn-danger"
              style={{ flex: 1 }}
              disabled={actingId === deleteTarget.id}
              onClick={handleConfirmDelete}
            >
              {actingId === deleteTarget.id ? t('workingSchedule.deleting') : t('workingSchedule.confirmDeleteCta')}
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
