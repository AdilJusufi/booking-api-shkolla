import { Check, Globe } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import i18n, { SUPPORTED_LANGUAGES, LANGUAGE_NAMES, type SupportedLanguage } from '../i18n'

interface LanguageSwitcherProps {
  /** 'menu' renders as a section inside UserMenu's open panel (menuitemradio
   *  buttons matching .user-menu__item styling). 'footer' renders as a
   *  standalone footer column for logged-out visitors, who have no user menu. */
  variant: 'menu' | 'footer'
  /** Called after a language is picked, so the host can close its own panel. */
  onSelect?: () => void
}

export default function LanguageSwitcher({ variant, onSelect }: LanguageSwitcherProps) {
  const { t } = useTranslation('common')
  const current = i18n.resolvedLanguage as SupportedLanguage

  function select(lang: SupportedLanguage) {
    if (lang !== current) void i18n.changeLanguage(lang)
    onSelect?.()
  }

  const itemClass = variant === 'menu' ? 'user-menu__item user-menu__lang-item' : 'footer__lang-item'

  return (
    <div
      className={variant === 'menu' ? 'user-menu__lang' : 'footer__col footer__col--lang'}
      role={variant === 'menu' ? 'group' : undefined}
      aria-label={variant === 'menu' ? t('language.label') : undefined}
    >
      <span className={variant === 'menu' ? 'user-menu__lang-title' : 'footer__title'}>
        <Globe size={13} strokeWidth={1.75} aria-hidden />
        {t('language.label')}
      </span>
      {SUPPORTED_LANGUAGES.map((lang) => {
        const isActive = lang === current
        return (
          <button
            key={lang}
            type="button"
            role={variant === 'menu' ? 'menuitemradio' : undefined}
            aria-checked={variant === 'menu' ? isActive : undefined}
            aria-pressed={variant === 'footer' ? isActive : undefined}
            className={`${itemClass} ${isActive ? 'is-active' : ''}`}
            onClick={() => select(lang)}
          >
            <span>{LANGUAGE_NAMES[lang]}</span>
            {isActive && <Check size={14} strokeWidth={1.75} aria-hidden />}
          </button>
        )
      })}
    </div>
  )
}
