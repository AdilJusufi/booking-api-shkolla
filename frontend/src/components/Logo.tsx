import { useTranslation } from 'react-i18next'
import { useTheme } from '../context/ThemeContext'

export type LogoVariant = 'icon' | 'horizontal' | 'stacked'
export type LogoTone = 'auto' | 'inverted' | 'mono'

interface LogoProps {
  /** icon = mark alone. horizontal/stacked = mark + wordmark lockups. */
  variant?: LogoVariant
  /** auto (default) follows the light/dark theme toggle. inverted/mono pin a
   * fixed treatment for surfaces that don't follow the toggle, such as the
   * always-dark auth brand column. */
  tone?: LogoTone
  /** Height in px. Width follows the asset's own aspect ratio. */
  size?: number
  className?: string
}

const LOGO_SOURCES: Record<LogoVariant, Record<'light' | 'dark' | 'inverted' | 'mono', string>> = {
  icon: {
    light: '/icon/icon-teal.svg',
    dark: '/icon/icon-dark-theme.svg',
    inverted: '/icon/icon-mono-white.svg',
    mono: '/icon/icon-mono-ink.svg',
  },
  horizontal: {
    light: '/lockup-horizontal/lockup-h-teal.svg',
    dark: '/lockup-horizontal/lockup-h-dark-theme.svg',
    inverted: '/lockup-horizontal/lockup-h-mono-white.svg',
    mono: '/lockup-horizontal/lockup-h-mono-ink.svg',
  },
  stacked: {
    light: '/lockup-stacked/lockup-stacked-teal.svg',
    dark: '/lockup-stacked/lockup-stacked-dark-theme.svg',
    inverted: '/lockup-stacked/lockup-stacked-mono-white.svg',
    mono: '/lockup-stacked/lockup-stacked-mono-ink.svg',
  },
}

export default function Logo({ variant = 'icon', tone = 'auto', size = 22, className }: LogoProps) {
  const { theme } = useTheme()
  const { t } = useTranslation('common')
  const sources = LOGO_SOURCES[variant]
  const src = tone === 'inverted' ? sources.inverted : tone === 'mono' ? sources.mono : sources[theme]

  return (
    <img
      src={src}
      alt={`${t('brand.name')}${t('brand.tld')}`}
      height={size}
      className={className}
      style={{ width: 'auto', height: size, display: 'block' }}
    />
  )
}
