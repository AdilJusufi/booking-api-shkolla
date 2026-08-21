import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NAMESPACES, SUPPORTED_LANGUAGES, type SupportedLanguage } from './i18n'

/**
 * Checks that every pluralised key (a `_one`/`_few`/`_other`/etc. family)
 * uses exactly the plural categories that language actually needs — no more,
 * no less. Two failure modes this catches:
 *  - a missing `_other`, i18next's required fallback category — a count that
 *    doesn't match any other suffix would render the raw key.
 *  - a stale category that CLDR doesn't define for that language, e.g. a
 *    `_many` suffix on a Serbian key. Serbian's real plural rule has only
 *    one/few/other (confirmed via Intl.PluralRules('sr') below) — a `_many`
 *    entry like that is dead JSON: i18next's PluralResolver will never
 *    select it, so it just silently never appears in the UI.
 * This is exactly the kind of mistake UNREVIEWED.md flags Serbian
 * pluralisation for: "generated from CLDR plural rules, not confirmed
 * against real usage per string."
 */

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

const PLURAL_SUFFIXES = ['zero', 'one', 'two', 'few', 'many', 'other'] as const
const pluralKeyPattern = new RegExp(`^(.*)_(${PLURAL_SUFFIXES.join('|')})$`)

const INTL_LOCALES: Record<SupportedLanguage, string> = { sq: 'sq', en: 'en', sr: 'sr' }

function loadNamespace(lang: string, ns: string): JsonValue {
  const raw = readFileSync(resolve(__dirname, `locales/${lang}/${ns}.json`), 'utf-8')
  return JSON.parse(raw) as JsonValue
}

function flattenKeys(value: JsonValue, prefix = ''): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => flattenKeys(item, `${prefix}[${i}]`))
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => flattenKeys(v, prefix ? `${prefix}.${k}` : k))
  }
  return [prefix]
}

/** Groups keys like "foo_one"/"foo_other" under base key "foo" -> Set{"one","other"}. */
function groupPluralFamilies(keys: string[]): Map<string, Set<string>> {
  const families = new Map<string, Set<string>>()
  for (const key of keys) {
    const m = pluralKeyPattern.exec(key)
    if (!m) continue
    const [, base, suffix] = m
    if (!families.has(base)) families.set(base, new Set())
    families.get(base)!.add(suffix)
  }
  return families
}

describe('i18n plural categories match each language\'s real CLDR rules', () => {
  for (const lang of SUPPORTED_LANGUAGES) {
    const validCategories: Set<string> = new Set(new Intl.PluralRules(INTL_LOCALES[lang]).resolvedOptions().pluralCategories)

    for (const ns of NAMESPACES) {
      const families = groupPluralFamilies(flattenKeys(loadNamespace(lang, ns)))
      if (families.size === 0) continue

      it(`${ns}/${lang}.json's plural keys use exactly ${lang}'s valid categories (${[...validCategories].sort().join('/')})`, () => {
        for (const [base, suffixes] of families) {
          expect([...suffixes], `${ns}/${lang}.json: "${base}" is missing the required "_other" fallback`).toContain('other')

          const invalid = [...suffixes].filter((s) => !validCategories.has(s))
          expect(invalid, `${ns}/${lang}.json: "${base}" has suffixes ${lang} doesn't use: ${invalid.join(', ')}`).toEqual([])
        }
      })
    }
  }
})
