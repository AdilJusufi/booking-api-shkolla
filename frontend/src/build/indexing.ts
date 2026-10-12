/**
 * Search-engine indexing policy, decided at BUILD time from VITE_ENVIRONMENT.
 *
 * Only `production` is indexable. Anything else — `development`, a Vercel preview, or an
 * UNSET value (same default as EnvironmentBadge: a missing variable must never be mistaken
 * for the real site) — is closed to crawlers. Pure functions, no Vite imports, so the policy
 * is unit-tested (indexing.test.ts) and shared by the build plugin in vite.config.ts.
 */

export const NOINDEX_META = '<meta name="robots" content="noindex, nofollow" />'

const DISALLOW_ALL_ROBOTS = `# Mjedis jo-prodhim: asnjë faqe s'duhet të indeksohet.
User-agent: *
Disallow: /
`

export function isIndexable(environment: string | undefined): boolean {
  return environment === 'production'
}

/** robots.txt body: the real (production) rules, or "disallow everything". */
export function robotsTxtFor(environment: string | undefined, productionRobotsTxt: string): string {
  return isIndexable(environment) ? productionRobotsTxt : DISALLOW_ALL_ROBOTS
}

/**
 * Adds the noindex tag to index.html for non-production builds. Static in the HTML, not injected
 * by JavaScript, so crawlers that don't run JS (and link-preview bots) see it too. Because every
 * route is served from this one HTML file, this is "every page".
 */
export function injectNoindex(html: string, environment: string | undefined): string {
  if (isIndexable(environment) || html.includes('name="robots"')) return html
  return html.replace('</head>', `    ${NOINDEX_META}\n  </head>`)
}
