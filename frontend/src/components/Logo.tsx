type LogoTone = 'brand' | 'inverted' | 'mono'

interface LogoProps {
  size?: number
  tone?: LogoTone
  className?: string
}

const TONE_COLORS: Record<LogoTone, { base: string; accent: string }> = {
  brand: { base: 'var(--primary)', accent: 'var(--gold)' },
  inverted: { base: '#ffffff', accent: 'var(--gold)' },
  mono: { base: 'currentColor', accent: 'currentColor' },
}

/** Rrjeti mark: four rounded squares from the availability grid; the gap between
 * them reads as the medical cross. Gold marks the "booked" quadrant. */
export default function Logo({ size = 22, tone = 'brand', className }: LogoProps) {
  const { base, accent } = TONE_COLORS[tone]
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <rect x="3" y="3" width="26" height="26" rx="8" fill={base} />
      <rect x="3" y="35" width="26" height="26" rx="8" fill={base} />
      <rect x="35" y="35" width="26" height="26" rx="8" fill={base} />
      <rect x="35" y="3" width="26" height="26" rx="8" fill={accent} />
    </svg>
  )
}
