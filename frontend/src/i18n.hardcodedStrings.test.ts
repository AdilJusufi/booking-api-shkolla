import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Regression guard for the hardcoded-Albanian sweep: every user-facing
 * string in src/pages and src/components is supposed to route through
 * t()/<Trans>, with the only Albanian left being the *source* copy that
 * lives in locales/sq/*.json — never inlined in a .tsx file. Albanian is
 * distinctive enough among the app's three languages (sq/en/sr are all
 * Latin-script, but ë/ç are sq-only characters) that a diacritic surviving
 * comment-stripping in a component is almost always a string that was
 * never wired up to i18next.
 *
 * This is a heuristic (regex over stripped source, not a real parser), so
 * it can't tell a hardcoded label from a legitimate data-matching key. The
 * one known legitimate case is allowlisted below with a reason; a new hit
 * anywhere else should be fixed, not silenced.
 */

const ALLOWLIST = new Set([
  // Keys into SPECIALTY_ICONS, matched against the specialty *name* the
  // backend returns (specialties are seeded in Albanian) — this is a data
  // lookup key, not UI copy, the same category as KOSOVO_CITIES.
  'src/components/ui.tsx',
])

const DIACRITIC_PATTERN = /[ëçËÇ]/

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

interface Hit {
  file: string
  line: number
  text: string
}

function listTsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return listTsxFiles(full)
    return entry.isFile() && entry.name.endsWith('.tsx') ? [full] : []
  })
}

function findHardcodedAlbanian(): Hit[] {
  const projectRoot = resolve(__dirname, '..')
  const hits: Hit[] = []
  for (const dir of ['pages', 'components']) {
    for (const absPath of listTsxFiles(resolve(__dirname, dir))) {
      const relPath = relative(projectRoot, absPath)
      if (relPath.endsWith('.test.tsx') || ALLOWLIST.has(relPath)) continue
      const stripped = stripComments(readFileSync(absPath, 'utf-8'))
      stripped.split('\n').forEach((line, i) => {
        if (DIACRITIC_PATTERN.test(line)) {
          hits.push({ file: relPath, line: i + 1, text: line.trim() })
        }
      })
    }
  }
  return hits
}

describe('hardcoded-string sweep', () => {
  it('src/pages and src/components contain no un-migrated Albanian text (ë/ç outside comments)', () => {
    const hits = findHardcodedAlbanian()
    const report = hits.map((h) => `${h.file}:${h.line}  ${h.text}`).join('\n')
    expect(hits, `Found likely-hardcoded Albanian text:\n${report}`).toEqual([])
  })
})
