import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NAMESPACES, SUPPORTED_LANGUAGES } from './i18n'

/**
 * Guards against a namespace drifting out of sync across languages — a key
 * added to sq/*.json (the source of truth, per UNREVIEWED.md) and forgotten
 * in en/sr silently falls back to Albanian instead of failing loudly, and a
 * key removed from sq but left behind in en/sr is dead weight nobody notices.
 * Reads the JSON files directly (not through i18next) so it exercises what's
 * actually on disk, independent of any runtime fallback behaviour.
 */

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

const PLURAL_SUFFIXES = ['zero', 'one', 'two', 'few', 'many', 'other']
const pluralSuffixPattern = new RegExp(`_(${PLURAL_SUFFIXES.join('|')})$`)

function loadNamespace(lang: string, ns: string): JsonValue {
  const raw = readFileSync(resolve(__dirname, `locales/${lang}/${ns}.json`), 'utf-8')
  return JSON.parse(raw) as JsonValue
}

/** Flattens to dot/bracket paths, e.g. { a: { b: [1] } } -> "a.b[0]". */
function flattenKeys(value: JsonValue, prefix = ''): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => flattenKeys(item, `${prefix}[${i}]`))
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => flattenKeys(v, prefix ? `${prefix}.${k}` : k))
  }
  return [prefix]
}

/** Strips a trailing _one/_few/_other/etc. suffix so pluralised keys compare
 * as a single logical key — languages legitimately differ in how many
 * plural categories they need (sq/en: one/other; sr: one/few/other). */
function toBaseKey(key: string): string {
  return key.replace(pluralSuffixPattern, '')
}

describe('i18n key parity across sq/en/sr', () => {
  for (const ns of NAMESPACES) {
    it(`"${ns}" has the same set of keys in every language`, () => {
      const keysByLang = Object.fromEntries(
        SUPPORTED_LANGUAGES.map((lang) => [lang, new Set(flattenKeys(loadNamespace(lang, ns)).map(toBaseKey))]),
      ) as Record<string, Set<string>>

      const [firstLang, ...restLangs] = SUPPORTED_LANGUAGES
      const reference = keysByLang[firstLang]

      for (const lang of restLangs) {
        const current = keysByLang[lang]
        const missing = [...reference].filter((k) => !current.has(k))
        const extra = [...current].filter((k) => !reference.has(k))

        expect(missing, `${ns}/${lang}.json is missing keys present in ${ns}/${firstLang}.json`).toEqual([])
        expect(extra, `${ns}/${lang}.json has stale keys not present in ${ns}/${firstLang}.json`).toEqual([])
      }
    })
  }
})
