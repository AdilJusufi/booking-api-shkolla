import { useRef } from 'react'
import { Building2, User } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AUTH_MODES, type AuthMode } from '../lib/authMode'

const MODE_ICONS = { patient: User, clinic: Building2 } as const

/** Segmented Pacient/Klinikë switch shared by the login and register pages.
 * A real tablist rather than two buttons: the panel below genuinely changes
 * with the selection, so arrow-key navigation and aria-selected are what a
 * screen reader needs to describe it. */
export default function AuthModeTabs({
  value,
  onChange,
  idPrefix,
}: {
  value: AuthMode
  onChange: (mode: AuthMode) => void
  /** Distinguishes the tab/panel ids when both pages are mounted in one test. */
  idPrefix: string
}) {
  const { t } = useTranslation('auth')
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const step = e.key === 'ArrowRight' ? 1 : -1
    const next = AUTH_MODES[(AUTH_MODES.indexOf(value) + step + AUTH_MODES.length) % AUTH_MODES.length]
    onChange(next)
    refs.current[next]?.focus()
  }

  return (
    <div className="auth-mode" role="tablist" aria-label={t('mode.tablistLabel')} onKeyDown={handleKeyDown}>
      {AUTH_MODES.map((mode) => {
        const Icon = MODE_ICONS[mode]
        const selected = mode === value
        return (
          <button
            key={mode}
            ref={(el) => { refs.current[mode] = el }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${mode}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${mode}`}
            tabIndex={selected ? 0 : -1}
            className={`auth-mode__tab${selected ? ' auth-mode__tab--active' : ''}`}
            onClick={() => onChange(mode)}
          >
            <Icon size={16} strokeWidth={1.5} aria-hidden />
            {t(`mode.${mode}`)}
          </button>
        )
      })}
    </div>
  )
}
