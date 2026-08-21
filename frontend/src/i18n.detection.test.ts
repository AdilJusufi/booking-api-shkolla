import i18next from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { afterEach, describe, expect, it } from 'vitest'
import { LANGUAGE_STORAGE_KEY, SUPPORTED_LANGUAGES } from './i18n'

// A separate i18next instance (not the app's shared singleton — that one
// boots once for the whole test run in test/setup.ts and can't be re-booted
// per test) configured identically to i18n.ts's detection/fallback options,
// so this exercises the real order and fallback behaviour rather than a
// re-description of it.
async function bootInstance() {
  const instance = i18next.createInstance()
  await instance.use(LanguageDetector).init({
    fallbackLng: 'sq',
    supportedLngs: SUPPORTED_LANGUAGES,
    load: 'languageOnly',
    // resolvedLanguage is only populated once resources for it exist — an
    // empty resource bundle per language is enough, since these tests only
    // assert on which language got picked, not on any translated string.
    resources: Object.fromEntries(SUPPORTED_LANGUAGES.map((lng) => [lng, { common: {} }])),
    detection: {
      order: ['localStorage'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ['localStorage'],
    },
  })
  return instance
}

function setNavigatorLanguage(language: string) {
  // The detector's navigator lookup checks navigator.languages (plural)
  // before navigator.language, so both need overriding — jsdom's default
  // navigator.languages otherwise wins regardless of what .language is set to.
  Object.defineProperty(window.navigator, 'language', {
    value: language,
    configurable: true,
  })
  Object.defineProperty(window.navigator, 'languages', {
    value: [language],
    configurable: true,
  })
}

describe('i18n language detection (Albanian by default everywhere, as configured in i18n.ts)', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('defaults to Albanian on a first visit, ignoring the browser/system language entirely', async () => {
    // The shared app-wide i18n singleton also writes to this same real
    // localStorage key from its own test/setup.ts beforeEach hook — clear it
    // here so that write isn't mistaken for a user's prior explicit choice.
    localStorage.clear()
    // A browser set to English (or anything else) must NOT change the
    // default — 'navigator' is deliberately absent from the detection
    // order in i18n.ts, so this has no effect on the resolved language.
    setNavigatorLanguage('en-US')

    const instance = await bootInstance()

    expect(instance.languages[0]).toBe('sq')
  })

  it('an explicit prior choice in localStorage overrides the Albanian default on a later visit', async () => {
    setNavigatorLanguage('en-US')
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en')

    const instance = await bootInstance()

    expect(instance.languages[0]).toBe('en')
  })

  it('an explicit sq choice in localStorage still resolves to sq (not just the unset default)', async () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'sq')

    const instance = await bootInstance()

    expect(instance.languages[0]).toBe('sq')
  })
})
