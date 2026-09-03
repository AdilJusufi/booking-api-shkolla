import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * index.html carries three inline <script> blocks that must run before anything
 * else (storage-key migration, theme, language — each is there to avoid a flash
 * of the wrong state on first paint). A CSP cannot allow those with a nonce,
 * because Vercel serves the file statically and there is no request-time render
 * to inject one — so vercel.json pins their SHA-256 hashes instead.
 *
 * Hashes are exact-byte: reindenting a script, or adding a fourth one, silently
 * invalidates the CSP. In report-only mode that costs a console warning; once the
 * policy is enforced it means the app does not boot at all. This test is the
 * tripwire — edit index.html and it fails here, in CI, rather than in production.
 *
 * To update after an intentional change: run this test, take the hash from the
 * failure message, and replace the stale one in vercel.json's script-src.
 */
describe('CSP script-src hashes match the inline scripts in index.html', () => {
  const root = resolve(__dirname, '..')
  const html = readFileSync(resolve(root, 'index.html'), 'utf-8')
  const vercelConfig = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf-8')) as {
    headers: { headers: { key: string; value: string }[] }[]
  }

  const csp = vercelConfig.headers
    .flatMap((entry) => entry.headers)
    .find((h) => h.key.toLowerCase().startsWith('content-security-policy'))

  // Inline only — a <script src="..."> is covered by 'self', not by a hash.
  const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
    (m) => m[1],
  )

  it('finds a CSP header and the expected number of inline scripts', () => {
    expect(csp, 'no Content-Security-Policy header in vercel.json').toBeDefined()
    expect(inlineScripts.length).toBe(3)
  })

  it.each(inlineScripts.map((body, i) => [i + 1, body] as const))(
    'inline script %i has its hash allowlisted',
    (_index, body) => {
      const hash = `sha256-${createHash('sha256').update(body, 'utf-8').digest('base64')}`
      expect(
        csp!.value,
        `index.html changed — add '${hash}' to script-src in vercel.json and drop the stale one`,
      ).toContain(hash)
    },
  )

  it('does not weaken script-src with unsafe-inline or unsafe-eval', () => {
    const scriptSrc = csp!.value.split(';').find((d) => d.trim().startsWith('script-src')) ?? ''
    expect(scriptSrc).not.toContain("'unsafe-inline'")
    expect(scriptSrc).not.toContain("'unsafe-eval'")
  })
})
