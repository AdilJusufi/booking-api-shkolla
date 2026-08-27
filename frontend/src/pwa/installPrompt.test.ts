import { afterEach, describe, expect, it, vi } from 'vitest'
import { isInstallPromptSuppressed, isInstalled, isIosDevice } from './installPrompt'

function mockMatchMedia(matchesQuery: string | null) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) => ({ matches: query === matchesQuery, media: query }) as MediaQueryList,
  )
}

function mockUserAgent(ua: string) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua)
}

const IPHONE_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'
const IPHONE_CHROME_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/119.0 Mobile/15E148 Safari/604.1'
const ANDROID_CHROME_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/119.0.0.0 Mobile Safari/537.36'
const DESKTOP_CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/119.0.0.0 Safari/537.36'

afterEach(() => {
  vi.restoreAllMocks()
  // jsdom doesn't define maxTouchPoints itself, so the iPadOS tests below set
  // it with Object.defineProperty rather than vi.spyOn — undo that by hand so
  // it doesn't leak into other test files sharing this jsdom environment.
  delete (navigator as { maxTouchPoints?: number }).maxTouchPoints
})

describe('isInstalled', () => {
  it('detects standalone display-mode via matchMedia', () => {
    mockMatchMedia('(display-mode: standalone)')
    expect(isInstalled()).toBe(true)
  })

  it('returns false when nothing signals an installed launch', () => {
    mockMatchMedia(null)
    expect(isInstalled()).toBe(false)
  })

  it('detects iOS Safari\'s legacy navigator.standalone flag', () => {
    mockMatchMedia(null)
    Object.defineProperty(window.navigator, 'standalone', { configurable: true, value: true })
    expect(isInstalled()).toBe(true)
    // @ts-expect-error test-only cleanup of a non-standard property
    delete window.navigator.standalone
  })

  it('detects an Android TWA/app-shell launch via the referrer scheme', () => {
    mockMatchMedia(null)
    vi.spyOn(document, 'referrer', 'get').mockReturnValue('android-app://com.rezervomjekun.twa')
    expect(isInstalled()).toBe(true)
  })
})

describe('isIosDevice', () => {
  it('is true for iOS Safari', () => {
    mockUserAgent(IPHONE_SAFARI_UA)
    expect(isIosDevice()).toBe(true)
  })

  it('is true for Chrome on iOS too — same WebKit engine, same install limitation', () => {
    mockUserAgent(IPHONE_CHROME_UA)
    expect(isIosDevice()).toBe(true)
  })

  it('is false for Android Chrome', () => {
    mockUserAgent(ANDROID_CHROME_UA)
    expect(isIosDevice()).toBe(false)
  })

  it('is false for desktop Chrome', () => {
    mockUserAgent(DESKTOP_CHROME_UA)
    expect(isIosDevice()).toBe(false)
  })

  it('is true for iPadOS 13+, which reports its UA as a desktop Mac but has touch points', () => {
    mockUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
    )
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 5 })
    expect(isIosDevice()).toBe(true)
  })

  it('is false for an actual Mac desktop with the same "Macintosh" UA token but no touch points', () => {
    mockUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
    )
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 0 })
    expect(isIosDevice()).toBe(false)
  })
})

describe('isInstallPromptSuppressed', () => {
  it.each([
    ['/hyr', true],
    ['/regjistrohu', true],
    ['/harrova-fjalekalimin', true],
    ['/rivendos-fjalekalimin', true],
    ['/konfirmo-email', true],
    ['/llogaria/fjalekalimi', true],
    ['/mjeku/doctor-123', true],
    ['/rezervo/konfirmo', true],
    ['/', false],
    ['/kerko', false],
    ['/terminet', false],
    ['/klinika/clinic-1', false],
    ['/llogaria', false],
  ])('%s → suppressed: %s', (pathname, expected) => {
    expect(isInstallPromptSuppressed(pathname)).toBe(expected)
  })
})
