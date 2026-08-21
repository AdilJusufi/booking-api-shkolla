import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import resourcesToBackend from 'i18next-resources-to-backend'

/**
 * Albanian is first and is both the default and the fallback: a key missing
 * from en/sr renders the Albanian text instead of a raw key, and a browser
 * whose language none of the three cover (e.g. French) also lands here.
 */
export const SUPPORTED_LANGUAGES = ['sq', 'en', 'sr'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

/** Own-language names for the switcher — never translated into the current UI language. */
export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  sq: 'Shqip',
  en: 'English',
  sr: 'Srpski',
}

/**
 * One file per portal rather than one giant file per language, so a patient
 * session never pulls in admin copy. Namespaces load lazily via the dynamic
 * import() below — Vite code-splits each locale/namespace pair into its own
 * chunk, and react-i18next's Suspense integration (see main.tsx) waits for
 * the chunk instead of flashing raw keys.
 */
export const NAMESPACES = ['common', 'auth', 'patient', 'doctor', 'admin', 'legal'] as const
export type Namespace = (typeof NAMESPACES)[number]

/** Same 'rezervo.' prefix as the other persisted preferences (theme, auth tokens). */
export const LANGUAGE_STORAGE_KEY = 'rezervo.language'

/**
 * The init promise, exported so non-React code (errors.ts, format.ts — plain
 * modules with no hook access) and tests can await readiness before calling
 * i18next.t() directly. React components never need this: the Suspense
 * boundary in main.tsx already blocks first render on the same promise.
 */
export const i18nReady = i18next
  .use(LanguageDetector)
  .use(
    resourcesToBackend(
      (language: string, namespace: string) => import(`./locales/${language}/${namespace}.json`),
    ),
  )
  .use(initReactI18next)
  .init({
    fallbackLng: 'sq',
    supportedLngs: SUPPORTED_LANGUAGES,
    // Detected locales like "en-US" or "sr-Latn-RS" are truncated to their
    // primary subtag, which conveniently also sidesteps ever detecting
    // Serbian's Cyrillic variant — the app only ships Latin sr copy.
    load: 'languageOnly',
    ns: ['common'],
    defaultNS: 'common',
    fallbackNS: 'common',
    interpolation: {
      // React already escapes interpolated values when rendering.
      escapeValue: false,
    },
    detection: {
      // Browser/navigator detection deliberately isn't in this list: every
      // page defaults to Albanian (fallbackLng) unless the visitor has
      // explicitly picked a language via the switcher, regardless of their
      // system locale. Only that explicit prior choice overrides the default.
      order: ['localStorage'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ['localStorage'],
    },
    react: {
      useSuspense: true,
    },
  })

// Kept in sync with the active language for screen readers and for the
// browser's own "translate this page?" prompt, which both key off <html
// lang>. Registered before init() resolves so it also catches the very
// first language pick, not just later switches.
i18next.on('languageChanged', (language) => {
  document.documentElement.setAttribute('lang', language)
})

export default i18next
