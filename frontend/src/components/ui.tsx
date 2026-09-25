import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import {
  AlertCircle,
  Baby,
  Calendar,
  Check,
  ChevronDown,
  Ear,
  Eye,
  Heart,
  Scan,
  Search,
  SmilePlus,
  Stethoscope,
  Venus,
  X,
  type LucideProps,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DAY_ORDER, monthName, weekdayName } from '../lib/format'

/** A shimmering block sized to the thing it stands in for. */
export function Skeleton({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <div className={`sk ${className}`} style={style} aria-hidden />
}

/**
 * Loading placeholders mirror the layout they replace rather than covering it
 * with a spinner, so the page does not reflow once the data lands.
 */
export function SkeletonRows({ count = 4, label }: { count?: number; label?: string }) {
  const { t } = useTranslation('common')
  return (
    <div className="sk-rows" role="status" aria-label={label ?? t('loading')}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="sk-row" />
      ))}
    </div>
  )
}

/** Matches the detail-page shape: hero row, then a content / panel split. */
export function SkeletonDetail({ label }: { label?: string }) {
  const { t } = useTranslation('common')
  return (
    <div className="sk-detail" role="status" aria-label={label ?? t('loading')}>
      <div className="sk-detail__hero">
        <Skeleton className="sk-detail__avatar" />
        <div className="sk-stack" style={{ flex: 1 }}>
          <Skeleton className="sk-line sk-line--lg" style={{ maxWidth: '18rem' }} />
          <Skeleton className="sk-line" style={{ maxWidth: '26rem' }} />
        </div>
      </div>
      <div className="sk-detail__body">
        <div className="sk-stack">
          <Skeleton className="sk-line sk-line--lg" style={{ maxWidth: '12rem' }} />
          <Skeleton className="sk-line" />
          <Skeleton className="sk-line" />
          <Skeleton className="sk-line" style={{ maxWidth: '70%' }} />
          <Skeleton className="sk-row" style={{ marginTop: 12 }} />
          <Skeleton className="sk-row" />
        </div>
        <Skeleton className="sk-detail__panel" />
      </div>
    </div>
  )
}

/** Inline "working on it" for buttons — a pulse loop, not a rotating ring. */
export function Pending({ children }: { children?: ReactNode }) {
  return (
    <>
      <span className="pending" aria-hidden>
        <i />
        <i />
        <i />
      </span>
      {children}
    </>
  )
}

export function EmptyState({
  icon: Icon = Search,
  title,
  hint,
  action,
}: {
  icon?: ComponentType<LucideProps>
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <div className="empty__icon" aria-hidden>
        <Icon size={26} strokeWidth={1.5} />
      </div>
      <h3>{title}</h3>
      {hint && <p>{hint}</p>}
      {action && <div className="empty__action">{action}</div>}
    </div>
  )
}

export function ErrorBox({ message, onRetry }: { message: ReactNode; onRetry?: () => void }) {
  const { t } = useTranslation('common')
  return (
    <div className="errorbox" role="alert">
      <AlertCircle size={16} strokeWidth={1.5} style={{ flexShrink: 0 }} />
      <span className="errorbox__message">{message}</span>
      {onRetry && (
        <button type="button" className="errorbox__retry" onClick={onRetry}>
          {t('buttons.retry')}
        </button>
      )}
    </div>
  )
}

export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge badge--${tone}`}>{children}</span>
}

export function Modal({
  title,
  onClose,
  children,
  size = 'md',
}: {
  title: string
  onClose: () => void
  children: ReactNode
  size?: 'md' | 'lg'
}) {
  const { t } = useTranslation('common')
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal ${size === 'lg' ? 'modal--lg' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h3>{title}</h3>
          <button type="button" className="modal__close" onClick={onClose} aria-label={t('modal.close')}>
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  )
}

export interface DropdownOption {
  value: string
  label: string
}

export function Dropdown({
  options,
  value,
  onChange,
  icon: Icon = Calendar,
}: {
  options: DropdownOption[]
  value: string
  onChange: (value: string) => void
  icon?: ComponentType<LucideProps>
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = options.find((o) => o.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div className="dropdown" ref={rootRef}>
      <button type="button" className="dropdown__trigger" onClick={() => setOpen((v) => !v)}>
        <Icon size={14} strokeWidth={1.5} />
        <span>{selected?.label}</span>
        <ChevronDown size={14} strokeWidth={1.5} />
      </button>
      {open && (
        <div className="dropdown__panel">
          {options.map((o) => (
            <div
              key={o.value}
              className={`dropdown__option ${o.value === value ? 'is-selected' : ''}`}
              onClick={() => {
                onChange(o.value)
                setOpen(false)
              }}
            >
              <span>{o.label}</span>
              {o.value === value && <Check size={14} strokeWidth={1.5} />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export interface CustomSelectOption {
  value: string
  label: string
  /** Placeholder-style option (e.g. "Zgjidhni specializimin") — shown muted, not selectable via click/keyboard. */
  disabled?: boolean
}

/**
 * Label-above-value styled dropdown for search bars and filter rows — a
 * "no visible border of its own" trigger that inherits the surrounding
 * container's background, unlike `Dropdown`'s own bordered pill trigger.
 *
 * Open state is controlled by the parent (`open` / `onOpenChange`) so a row
 * of several of these can enforce "only one open at a time" just by storing
 * which field id is open, rather than each instance tracking its own state
 * and coordinating via refs.
 */
export function CustomSelect({
  label,
  options,
  value,
  onChange,
  open,
  onOpenChange,
  loading = false,
  placeholder,
  disabled = false,
  hideLabel = false,
  panelVariant,
}: {
  label: string
  options: CustomSelectOption[]
  value: string
  onChange: (value: string) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  loading?: boolean
  placeholder?: string
  /** Disables the whole control (e.g. filters not wired to data yet). */
  disabled?: boolean
  /** Keeps the label for a11y (aria-labelledby) but hides it visually — for
   * contexts (like ProfileField) that already render their own label above. */
  hideLabel?: boolean
  /** Styling variant for the portaled panel. Because the panel renders into
   * `document.body` it is no longer a descendant of its trigger's container,
   * so context-specific looks (e.g. the landing hero's dark surface) must
   * travel as an explicit class rather than a descendant selector. */
  panelVariant?: 'hero'
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()
  const [coords, setCoords] = useState<CSSProperties | null>(null)
  const selected = options.find((o) => o.value === value)
  const firstSelectableIndex = options.findIndex((o) => !o.disabled)
  const [activeIndex, setActiveIndex] = useState(() => {
    const current = options.findIndex((o) => o.value === value && !o.disabled)
    return current >= 0 ? current : Math.max(0, firstSelectableIndex)
  })

  useEffect(() => {
    if (!open) return
    const current = options.findIndex((o) => o.value === value && !o.disabled)
    setActiveIndex(current >= 0 ? current : Math.max(0, firstSelectableIndex))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, options, value])

  const close = useCallback(() => onOpenChange(false), [onOpenChange])

  /* Position the portaled panel from the trigger's own box. Layout effect so
   * the panel never paints one frame at the wrong place. Height is clamped to
   * whichever side has more room, and the panel flips above the trigger when
   * below would be the tighter fit. Width is clamped to the viewport so a
   * trigger near the right edge on a narrow screen can't push the list
   * off-screen — `left` shifts back and `maxWidth` caps the overflow. */
  useLayoutEffect(() => {
    if (!open) return
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const GAP = panelVariant === 'hero' ? 14 : 10
    const MARGIN = 12
    const below = window.innerHeight - rect.bottom - GAP - MARGIN
    const above = rect.top - GAP - MARGIN
    const dropUp = below < 180 && above > below
    const usable = window.innerWidth - MARGIN * 2
    const width = Math.min(rect.width, usable)
    const left = Math.max(MARGIN, Math.min(rect.left, window.innerWidth - MARGIN - width))
    setCoords({
      position: 'fixed',
      left,
      minWidth: width,
      // Capped from `left`, so `left + maxWidth` can never cross the right edge
      // however wide the longest option happens to render.
      maxWidth: Math.min(280, window.innerWidth - MARGIN - left),
      maxHeight: Math.max(120, Math.min(320, dropUp ? above : below)),
      ...(dropUp
        ? { bottom: window.innerHeight - rect.top + GAP }
        : { top: rect.bottom + GAP }),
    })
  }, [open, panelVariant, options.length])

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return
      close()
    }
    // The panel is fixed-positioned in `document.body`, so it cannot track the
    // trigger as the page scrolls — close instead of letting it drift. Capture
    // phase so scrolling any ancestor container counts, not just the window.
    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open, close])

  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const el = panelRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])

  function commit(index: number) {
    const opt = options[index]
    if (!opt || opt.disabled) return
    onChange(opt.value)
    onOpenChange(false)
  }

  function step(delta: number) {
    setActiveIndex((i) => {
      let next = i
      for (let guard = 0; guard < options.length; guard++) {
        next = Math.min(options.length - 1, Math.max(0, next + delta))
        if (!options[next]?.disabled) return next
        if (next === i) break
      }
      return i
    })
  }

  function handleTriggerKeyDown(e: React.KeyboardEvent) {
    if (disabled) return
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault()
      onOpenChange(true)
    }
  }

  function handlePanelKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onOpenChange(false)
      rootRef.current?.querySelector('button')?.focus()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      step(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      step(-1)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      commit(activeIndex)
    } else if (e.key === 'Tab') {
      onOpenChange(false)
    }
  }

  return (
    <div className={`cselect ${disabled ? 'is-disabled' : ''}`} ref={rootRef}>
      <label className={`cselect__label ${hideLabel ? 'cselect__label--hidden' : ''}`} id={`${listboxId}-label`}>{label}</label>
      <button
        type="button"
        className="cselect__trigger"
        ref={triggerRef}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${listboxId}-label ${listboxId}-value`}
        onClick={() => !disabled && onOpenChange(!open)}
        onKeyDown={handleTriggerKeyDown}
      >
        {loading ? (
          <Pending />
        ) : (
          <span className={`cselect__value ${selected?.disabled ? 'cselect__value--placeholder' : ''}`} id={`${listboxId}-value`}>
            {selected?.label ?? placeholder ?? ''}
          </span>
        )}
        <ChevronDown size={15} strokeWidth={1.75} className={`cselect__chevron ${open ? 'is-open' : ''}`} />
      </button>

      {open &&
        !disabled &&
        coords &&
        createPortal(
          <div
            className={`cselect__panel ${panelVariant ? `cselect__panel--${panelVariant}` : ''}`}
            ref={panelRef}
            style={coords}
            role="listbox"
            aria-labelledby={`${listboxId}-label`}
            tabIndex={-1}
            onKeyDown={handlePanelKeyDown}
          >
            {options.map((o, i) => (
              <div
                key={o.value}
                data-index={i}
                role="option"
                aria-selected={o.value === value}
                aria-disabled={o.disabled}
                className={`cselect__option ${o.value === value ? 'is-selected' : ''} ${i === activeIndex ? 'is-active' : ''} ${o.disabled ? 'is-disabled' : ''}`}
                onMouseEnter={() => !o.disabled && setActiveIndex(i)}
                onClick={() => commit(i)}
              >
                <span>{o.label}</span>
                {o.value === value && !o.disabled && <Check size={14} strokeWidth={1.75} />}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
}

const DATE_FIELD_DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

/** "YYYY-MM-DD" → pjesë numerike; 0 do të thotë "ende e pazgjedhur". */
function splitIsoDate(iso: string): { day: number; month: number; year: number } {
  const [y, m, d] = iso ? iso.split('-') : ['', '', '']
  return { day: Number(d) || 0, month: Number(m) || 0, year: Number(y) || 0 }
}

/** Sa ditë ka muaji — viti kalohet që shkurti i vitit të brishtë të jetë 29. */
function daysInMonth(year: number, month: number): number {
  if (!year || !month) return 31
  return new Date(year, month, 0).getDate()
}

/**
 * Data e lindjes si tre <select> (ditë / muaj / vit) në vend të
 * `<input type="date">`.
 *
 * I njëjti problem si te TimeField: input-i vendas e formaton datën sipas
 * locale-it të shfletuesit/OS-it, jo sipas `lang`-ut të faqes — në Kosovë del
 * `mm/dd/yyyy` sa herë shfletuesi është në anglishten amerikane, dhe "03/04"
 * lexohet si dy data të ndryshme varësisht se kush e shikon. Me select-a,
 * muaji shkruhet me emër (`monthName`, i përkthyer), prandaj s'mbetet asnjë
 * pikë ku rendi ditë/muaj të jetë i dykuptimtë.
 *
 * Vlera hyrëse/dalëse mbetet ISO `YYYY-MM-DD`, që thirrësit dhe backend-i të
 * mos ndryshojnë fare.
 */
export function DateField({
  label,
  value,
  onChange,
  maxYear,
  minYear,
  required = false,
  error,
  hint,
}: {
  label: string
  /** ISO "YYYY-MM-DD", ose "" kur s'është zgjedhur ende. */
  value: string
  onChange: (value: string) => void
  /** Viti më i vonë i zgjedhshëm — p.sh. kufiri i moshës minimale. */
  maxYear: number
  minYear?: number
  required?: boolean
  error?: string
  hint?: string
}) {
  const { t } = useTranslation('common')

  // Zgjedhja e pjesshme mbahet lokalisht: `value` bëhet ISO vetëm kur të tria
  // fushat janë plot, dhe pa këtë gjendje "15" e zgjedhur para muajit do të
  // humbte menjëherë (data jo e plotë raportohet si "") dhe fusha s'do të
  // mbushej dot kurrë.
  const [parts, setParts] = useState(() => splitIsoDate(value))

  // Ndjek ndryshimet që vijnë nga jashtë (reset i formës, ngarkim i të dhënave),
  // pa e prekur gjendjen e pjesshme që po shkruan përdoruesi.
  const lastEmitted = useRef(value)
  useEffect(() => {
    if (value === lastEmitted.current) return
    lastEmitted.current = value
    setParts(splitIsoDate(value))
  }, [value])

  const { day, month, year } = parts

  const firstYear = minYear ?? maxYear - 119
  const years: number[] = []
  for (let y = maxYear; y >= firstYear; y--) years.push(y)

  const maxDay = daysInMonth(year, month)

  function emit(nextDay: number, nextMonth: number, nextYear: number) {
    // Ditë 31 + muaj me 30 ditë: kapet te fundi i muajit, që të mos dalë kurrë
    // një datë që s'ekziston (p.sh. 31 shkurt).
    const clampedDay =
      nextDay && nextMonth && nextYear ? Math.min(nextDay, daysInMonth(nextYear, nextMonth)) : nextDay
    setParts({ day: clampedDay, month: nextMonth, year: nextYear })
    const iso =
      clampedDay && nextMonth && nextYear
        ? `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`
        : ''
    lastEmitted.current = iso
    onChange(iso)
  }

  return (
    <div className="field">
      <label id={`${label}-date-label`}>{label}</label>
      <div className="date-field">
        <select
          value={day || ''}
          required={required}
          aria-label={t('dateField.day')}
          onChange={(e) => emit(Number(e.target.value), month, year)}
        >
          <option value="" disabled>{t('dateField.day')}</option>
          {DATE_FIELD_DAYS.filter((d) => d <= maxDay).map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select
          value={month || ''}
          required={required}
          aria-label={t('dateField.month')}
          onChange={(e) => emit(day, Number(e.target.value), year)}
        >
          <option value="" disabled>{t('dateField.month')}</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>{monthName(m - 1)}</option>
          ))}
        </select>
        <select
          value={year || ''}
          required={required}
          aria-label={t('dateField.year')}
          onChange={(e) => emit(day, month, Number(e.target.value))}
        >
          <option value="" disabled>{t('dateField.year')}</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>
      {hint && !error && <p className="field__hint">{hint}</p>}
      {error && <span className="field__error">{error}</span>}
    </div>
  )
}

const TIME_FIELD_HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const TIME_FIELD_MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))

/**
 * Always 24-hour HH:mm, regardless of the browser's or OS's locale settings.
 * Native <input type="time"> renders 12h/AM-PM or 24h depending on the
 * browser's locale resolution, which the `lang` attribute does NOT reliably
 * override across browser/OS combinations (confirmed inconsistent even in
 * recent Chromium). Kosovo/Europe expects 24h throughout, and this audience
 * should never have to parse "5:00 PM". Two plain <select>s side-step the
 * problem entirely — every option's text is authored right here, so there is
 * no locale-dependent time formatting left to go wrong.
 */
export function TimeField({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string
  /** "HH:mm", 5-minute granularity — matches the app's minimum slot duration. */
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const [hh, mm] = value ? value.split(':') : ['00', '00']
  return (
    <div className="field">
      <label>{label}</label>
      <div className={`time-field ${disabled ? 'is-disabled' : ''}`}>
        <select
          value={hh}
          disabled={disabled}
          aria-label={label}
          onChange={(e) => onChange(`${e.target.value}:${mm}`)}
        >
          {TIME_FIELD_HOURS.map((h) => (
            <option key={h} value={h}>{h}</option>
          ))}
        </select>
        <span className="time-field__sep" aria-hidden>:</span>
        <select
          value={mm}
          disabled={disabled}
          aria-label={label}
          onChange={(e) => onChange(`${hh}:${e.target.value}`)}
        >
          {TIME_FIELD_MINUTES.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

/**
 * Independently-toggleable day checkboxes (Mon/Wed/Fri without Tue/Thu is a
 * real schedule, not just a contiguous range) plus a Nga/Deri range shortcut
 * that checks a contiguous block in one click. Used by any "add schedule for
 * several days at once" form — see WorkingSchedulePage / ClinicDoctorsPage.
 * Manages its own two range-picker dropdowns' open state internally so
 * callers don't need to thread extra state through their own openField union.
 */
export function WeekdayMultiSelect({
  selectedDays,
  onChange,
  fromLabel,
  toLabel,
  applyRangeCta,
  showRange = true,
}: {
  selectedDays: number[]
  onChange: (days: number[]) => void
  fromLabel: string
  toLabel: string
  applyRangeCta: string
  /** Hide the "from–to" range helper — e.g. when editing a single-day schedule. */
  showRange?: boolean
}) {
  const [fromDay, setFromDay] = useState('1')
  const [toDay, setToDay] = useState('5')
  const [openField, setOpenField] = useState<'from' | 'to' | null>(null)

  const dayOptions: CustomSelectOption[] = DAY_ORDER.map((d) => ({ value: String(d), label: weekdayName(d) }))

  function toggleDay(day: number) {
    const next = selectedDays.includes(day)
      ? selectedDays.filter((d) => d !== day)
      : [...selectedDays, day]
    // Kept in Monday-first order regardless of click order — callers that
    // render selectedDays as a summary ("Hën, Mër, Pre") don't need to sort it themselves.
    next.sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b))
    onChange(next)
  }

  function applyRange() {
    const fromIndex = DAY_ORDER.indexOf(Number(fromDay))
    const toIndex = DAY_ORDER.indexOf(Number(toDay))
    if (fromIndex === -1 || toIndex === -1) return
    const [start, end] = fromIndex <= toIndex ? [fromIndex, toIndex] : [toIndex, fromIndex]
    onChange(DAY_ORDER.slice(start, end + 1))
  }

  return (
    <div className="weekday-multiselect">
      {showRange && (
        <div className="weekday-multiselect__range">
          <CustomSelect
            label={fromLabel}
            options={dayOptions}
            value={fromDay}
            onChange={setFromDay}
            open={openField === 'from'}
            onOpenChange={(o) => setOpenField(o ? 'from' : null)}
          />
          <CustomSelect
            label={toLabel}
            options={dayOptions}
            value={toDay}
            onChange={setToDay}
            open={openField === 'to'}
            onOpenChange={(o) => setOpenField(o ? 'to' : null)}
          />
          <button type="button" className="btn btn--ghost btn--sm weekday-multiselect__apply" onClick={applyRange}>
            {applyRangeCta}
          </button>
        </div>
      )}
      <div className="multiselect-pills">
        {DAY_ORDER.map((d) => {
          const isOn = selectedDays.includes(d)
          return (
            <button
              key={d}
              type="button"
              className={`multiselect-pill ${isOn ? 'is-selected' : ''}`}
              aria-pressed={isOn}
              onClick={() => toggleDay(d)}
            >
              {weekdayName(d, 'short')}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const SPECIALTY_ICONS: Record<string, ComponentType<LucideProps>> = {
  Stomatologji: SmilePlus,
  Pediatri: Baby,
  Oftalmologji: Eye,
  Dermatologji: Scan,
  Kardiologji: Heart,
  Gjinekologji: Venus,
  Otorinolaringologji: Ear,
  'Mjekësi Familjare': Stethoscope,
}

export function specialtyIcon(name: string): ComponentType<LucideProps> {
  return SPECIALTY_ICONS[name] ?? Stethoscope
}

/**
 * Emri i papërkthyer — fallback-u kanonik shqip.
 *
 * Përdoret vetëm aty ku një hook s'është i mundur. Komponentët duhet të marrin
 * `useSpecialtyLabel()` nga `context/SpecialtyNamesContext`, që e përkthen
 * emrin sipas gjuhës aktive duke u mbështetur te të dhënat e bazës (specializimet
 * shtohen nga SuperAdmin, prandaj s'ka hartë të ngurtë në klient).
 */
export function specialtyLabel(name: string): string {
  return name
}

export function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
}
