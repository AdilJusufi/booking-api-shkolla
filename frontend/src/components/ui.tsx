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

/** A shimmering block sized to the thing it stands in for. */
export function Skeleton({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <div className={`sk ${className}`} style={style} aria-hidden />
}

/**
 * Loading placeholders mirror the layout they replace rather than covering it
 * with a spinner, so the page does not reflow once the data lands.
 */
export function SkeletonRows({ count = 4, label = 'Duke ngarkuar' }: { count?: number; label?: string }) {
  return (
    <div className="sk-rows" role="status" aria-label={label}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="sk-row" />
      ))}
    </div>
  )
}

/** Matches the detail-page shape: hero row, then a content / panel split. */
export function SkeletonDetail({ label = 'Duke ngarkuar' }: { label?: string }) {
  return (
    <div className="sk-detail" role="status" aria-label={label}>
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

export function ErrorBox({ message }: { message: ReactNode }) {
  return (
    <div className="errorbox" role="alert">
      <AlertCircle size={16} strokeWidth={1.5} style={{ flexShrink: 0 }} />
      {message}
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
          <button type="button" className="modal__close" onClick={onClose} aria-label="Mbyll">
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
}: {
  label: string
  options: CustomSelectOption[]
  value: string
  onChange: (value: string) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  loading?: boolean
  placeholder?: string
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()
  const selected = options.find((o) => o.value === value)
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, options.findIndex((o) => o.value === value)))

  useEffect(() => {
    if (!open) return
    setActiveIndex(Math.max(0, options.findIndex((o) => o.value === value)))
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
    if (!opt) return
    onChange(opt.value)
    onOpenChange(false)
  }

  function handleTriggerKeyDown(e: React.KeyboardEvent) {
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
      setActiveIndex((i) => Math.min(options.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      commit(activeIndex)
    } else if (e.key === 'Tab') {
      onOpenChange(false)
    }
  }

  return (
    <div className="cselect" ref={rootRef}>
      <label className="cselect__label" id={`${listboxId}-label`}>{label}</label>
      <button
        type="button"
        className="cselect__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${listboxId}-label ${listboxId}-value`}
        onClick={() => onOpenChange(!open)}
        onKeyDown={handleTriggerKeyDown}
      >
        {loading ? (
          <Pending />
        ) : (
          <span className="cselect__value" id={`${listboxId}-value`}>
            {selected?.label ?? placeholder ?? ''}
          </span>
        )}
        <ChevronDown size={15} strokeWidth={1.75} className={`cselect__chevron ${open ? 'is-open' : ''}`} />
      </button>

      {open && (
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
              className={`cselect__option ${o.value === value ? 'is-selected' : ''} ${i === activeIndex ? 'is-active' : ''}`}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => commit(i)}
            >
              <span>{o.label}</span>
              {o.value === value && <Check size={14} strokeWidth={1.75} />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const SPECIALTY_ICONS: Record<string, ComponentType<LucideProps>> = {
  Dentist: SmilePlus,
  Pediatrician: Baby,
  Ophthalmologist: Eye,
  Dermatologist: Scan,
  Cardiologist: Heart,
  Gynecologist: Venus,
  ENT: Ear,
  FamilyMedicine: Stethoscope,
}

const SPECIALTY_LABELS: Record<string, string> = {
  Dentist: 'Stomatologji',
  Pediatrician: 'Pediatri',
  Ophthalmologist: 'Oftalmologji',
  Dermatologist: 'Dermatologji',
  Cardiologist: 'Kardiologji',
  Gynecologist: 'Gjinekologji',
  ENT: 'ORL (Veshë-Fyt-Hundë)',
  FamilyMedicine: 'Mjekësi familjare',
}

export function specialtyIcon(name: string): ComponentType<LucideProps> {
  return SPECIALTY_ICONS[name] ?? Stethoscope
}

export function specialtyLabel(name: string): string {
  return SPECIALTY_LABELS[name] ?? name
}

export function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
}
