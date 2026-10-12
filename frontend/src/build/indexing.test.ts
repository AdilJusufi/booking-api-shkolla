import { describe, expect, it } from 'vitest'
import { NOINDEX_META, injectNoindex, isIndexable, robotsTxtFor } from './indexing'

const HTML = '<!doctype html><html><head><title>x</title></head><body></body></html>'
const PROD_ROBOTS = 'User-agent: *\nAllow: /\nSitemap: https://www.rezervomjekun.com/sitemap.xml\n'

describe('indexing policy', () => {
  it('is indexable only for the exact value "production"', () => {
    expect(isIndexable('production')).toBe(true)
    for (const value of ['development', 'preview', 'staging', 'Production', '', undefined]) {
      expect(isIndexable(value), String(value)).toBe(false)
    }
  })

  it('serves the real robots.txt in production, untouched', () => {
    expect(robotsTxtFor('production', PROD_ROBOTS)).toBe(PROD_ROBOTS)
  })

  it.each(['development', 'preview', undefined])('disallows everything when the environment is %s', (env) => {
    const body = robotsTxtFor(env, PROD_ROBOTS)
    expect(body).toContain('User-agent: *')
    expect(body).toMatch(/^Disallow: \/$/m)
    expect(body).not.toMatch(/^Allow:/m)
    expect(body).not.toContain('Sitemap:')
  })

  it('leaves index.html untouched in production', () => {
    expect(injectNoindex(HTML, 'production')).toBe(HTML)
  })

  it.each(['development', undefined])('adds exactly one noindex tag inside <head> when the environment is %s', (env) => {
    const out = injectNoindex(HTML, env)
    expect(out).toContain(NOINDEX_META)
    expect(out.indexOf(NOINDEX_META)).toBeLessThan(out.indexOf('</head>'))
    expect(out.split('name="robots"').length - 1).toBe(1)
    expect(injectNoindex(out, env)).toBe(out) // idempotent
  })
})
