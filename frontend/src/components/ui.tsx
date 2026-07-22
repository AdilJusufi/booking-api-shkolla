import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
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
  type LucideProps,
} from 'lucide-react'

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="loading">
      <div className="spinner" aria-hidden />
      {label && <p>{label}</p>}
    </div>
  )
}

export function EmptyState({
  icon: Icon = Search,
  title,
  hint,
}: {
  icon?: ComponentType<LucideProps>
  title: string
  hint?: string
}) {
  return (
    <div className="empty">
      <div className="empty__icon" aria-hidden>
        <Icon size={32} strokeWidth={1.5} />
      </div>
      <h3>{title}</h3>
      {hint && <p>{hint}</p>}
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
