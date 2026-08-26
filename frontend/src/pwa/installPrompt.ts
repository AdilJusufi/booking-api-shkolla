/** Chromium's install event. Not in lib.dom, so it is declared here. */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * True once the app is actually running as an installed PWA — standalone
 * display mode (the general case), `navigator.standalone` (iOS Safari's own
 * legacy flag, still the only signal it exposes for a home-screen launch),
 * or launched from an Android TWA/app shell (which sets this referrer
 * scheme; there is no `navigator` flag for it). Once any of these is true,
 * install messaging has nothing left to offer.
 */
export function isInstalled(): boolean {
  if (typeof window === 'undefined') return false
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  const fromAndroidApp = typeof document !== 'undefined' && document.referrer.startsWith('android-app://')
  return standalone || fromAndroidApp
}

/**
 * True on iOS, regardless of which browser chrome the user picked. Apple's
 * rules require every iOS browser to run on WebKit, so Chrome-for-iOS and
 * Firefox-for-iOS have exactly the same install limitation as Safari itself —
 * no `beforeinstallprompt`, ever — and the same Share-sheet "Add to Home
 * Screen" path is how all of them install. Narrowing this to Safari's UA
 * specifically would leave iOS Chrome/Firefox users on the generic fallback
 * banner, which offers an "Install" button that cannot do anything on iOS.
 * iPadOS 13+ reports its UA as a desktop Mac, so a touch-point check catches
 * it too — Mac desktops don't have touch points.
 */
export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const iosDevice = /iphone|ipad|ipod/i.test(ua)
  const iPadOS = /macintosh/i.test(ua) && navigator.maxTouchPoints > 1
  return iosDevice || iPadOS
}

/**
 * Routes where an install banner would land on top of something the user is
 * actively in the middle of — a booking about to be lost, or credentials
 * about to be typed. A missed install opportunity here is a far smaller cost
 * than interrupting either. `/mjeku/:id` is included because slot selection
 * happens inline on the doctor profile page, not on a separate route.
 */
const SUPPRESSED_ROUTE_PATTERNS: RegExp[] = [
  /^\/hyr\/?$/,
  /^\/regjistrohu\/?$/,
  /^\/harrova-fjalekalimin\/?$/,
  /^\/rivendos-fjalekalimin\/?$/,
  /^\/konfirmo-email\/?$/,
  /^\/llogaria\/fjalekalimi\/?$/,
  /^\/mjeku\/[^/]+\/?$/,
  /^\/rezervo\/konfirmo\/?$/,
]

export function isInstallPromptSuppressed(pathname: string): boolean {
  return SUPPRESSED_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname))
}
