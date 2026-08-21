import { Loader2 } from 'lucide-react'

/**
 * Suspense fallback for the app-level boundary in main.tsx. Fixed-position so
 * it never affects document flow: on the very first paint there is nothing
 * under it to jump, and on a later suspend (e.g. the language switcher
 * fetching a namespace chunk for a language never loaded before) it covers
 * the still-mounted-but-suspended page in place rather than unmounting it to
 * a blank, height-0 tree — which is what a `null` fallback would do here.
 */
export default function SuspenseOverlay() {
  return (
    <div className="suspense-overlay" role="status" aria-live="polite">
      <Loader2 size={28} strokeWidth={1.75} className="clinic-upload__spin" aria-hidden />
    </div>
  )
}
