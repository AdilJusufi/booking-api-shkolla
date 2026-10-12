import { AlertTriangle } from 'lucide-react'
import Logo from './Logo'

/**
 * Shown instead of the app when a deployed build has no VITE_API_URL baked
 * in. Only reachable in a `vite build` output (see main.tsx) — never in
 * `vite dev`/tests, which always have it via .env.development or a fallback.
 * A silent fallback here would mean a broken deployment quietly trying to
 * reach a URL nobody configured; this fails loudly instead. Not routed
 * through i18n on purpose: this is a deploy-config diagnostic for whoever
 * set up the environment, not a screen a real user should ever see.
 */
export default function ConfigErrorPage() {
  return (
    <div className="offline-page">
      <span className="offline-page__brand">
        <Logo variant="stacked" size={48} />
      </span>

      <div className="icon-circle icon-circle--danger">
        <AlertTriangle size={26} strokeWidth={1.5} />
      </div>

      <h1>Configuration error</h1>
      <p className="auth-sub">
        This deployment is missing VITE_API_URL, so it has no backend to talk to. Set it in the
        deployment's environment variables and redeploy.
      </p>
    </div>
  )
}
