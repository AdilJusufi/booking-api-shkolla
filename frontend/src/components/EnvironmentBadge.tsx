const rawEnvironment = import.meta.env.VITE_ENVIRONMENT
const isProduction = rawEnvironment === 'production'
const label = rawEnvironment === 'development' ? 'DEV' : 'TESTING'

/**
 * Persistent corner marker for every non-production build. An unset
 * VITE_ENVIRONMENT also shows it (defaults to "not production") — a missing
 * env var should never be mistaken for the real site. Deliberately not
 * routed through i18n: it's a build-config indicator for whoever is testing,
 * not product copy, and should read the same regardless of the viewer's
 * language so nobody skims past it.
 */
export default function EnvironmentBadge() {
  if (isProduction) return null

  return (
    <div className="environment-badge" title={`VITE_ENVIRONMENT=${rawEnvironment ?? '(unset)'}`}>
      {label}
    </div>
  )
}
