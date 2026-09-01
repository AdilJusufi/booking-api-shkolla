import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
} from 'react'
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
import { DAY_ORDER, weekdayName } from '../lib/format'

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
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()
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

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onOpenChange(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

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

      {open && !disabled && (
        <div
          className="cselect__panel"
          ref={panelRef}
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
        </div>
      )}
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
}: {
  selectedDays: number[]
  onChange: (days: number[]) => void
  fromLabel: string
  toLabel: string
  applyRangeCta: string
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

// Specialty names now come pre-translated from the backend (seed data is
// Albanian); this stays as a passthrough so call sites don't need to change.
export function specialtyLabel(name: string): string {
  return name
}

export function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
}
