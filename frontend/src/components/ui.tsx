import type { ReactNode } from 'react'

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="loading">
      <div className="spinner" aria-hidden />
      {label && <p>{label}</p>}
    </div>
  )
}

export function EmptyState({ icon, title, hint }: { icon?: string; title: string; hint?: string }) {
  return (
    <div className="empty">
      <div className="empty__icon" aria-hidden>{icon ?? '🔍'}</div>
      <h3>{title}</h3>
      {hint && <p>{hint}</p>}
    </div>
  )
}

export function ErrorBox({ message }: { message: string }) {
  return <div className="errorbox" role="alert">⚠️ {message}</div>
}

export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge badge--${tone}`}>{children}</span>
}

const SPECIALTY_ICONS: Record<string, string> = {
  Dentist: '🦷',
  Pediatrician: '🧸',
  Ophthalmologist: '👁️',
  Dermatologist: '🧴',
  Cardiologist: '❤️',
  Gynecologist: '🌸',
  ENT: '👂',
  FamilyMedicine: '🩺',
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

export function specialtyIcon(name: string): string {
  return SPECIALTY_ICONS[name] ?? '🩺'
}

export function specialtyLabel(name: string): string {
  return SPECIALTY_LABELS[name] ?? name
}

export function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
}
