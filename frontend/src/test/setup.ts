import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest'
import { server } from './server'
import i18n, { i18nReady, NAMESPACES } from '../i18n'

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'error' })

  // i18n.ts defaults every page to Albanian (fallbackLng 'sq') regardless of
  // browser/system language — 'navigator' isn't even in the detection order.
  // This call just makes that explicit and deterministic for the suite, so
  // existing assertions against Albanian copy keep working regardless of
  // init timing. Tests that specifically exercise another language (the
  // switcher, locale-formatting tests) call i18n.changeLanguage() themselves.
  await i18nReady
  await i18n.changeLanguage('sq')

  // Production only loads a namespace when a page first needs it (that's the
  // whole point of the per-namespace split), which means the very first
  // render of e.g. LoginPage genuinely suspends until 'auth' arrives. Tests
  // render synchronously and query right after with the non-"find" RTL
  // queries, which don't wait — so without this, any test for a page using a
  // namespace beyond 'common' fails looking at an empty Suspense fallback,
  // not because anything is actually broken. Preloading every namespace here
  // removes that race for every test file, not just the ones that remember
  // to account for it.
  await i18n.loadNamespaces(NAMESPACES)
})

// Installed before *every* test, not once in beforeAll: a test that calls
// vi.restoreAllMocks() would otherwise strip these stand-ins for the rest of
// the file, and the next component render would fail on `matchMedia(...)
// .matches` of undefined — a confusing failure a long way from its cause.
beforeEach(async () => {
  // i18next is a module-level singleton, so a test that switches language
  // (the language-switcher test, locale-formatting tests) would otherwise
  // leak that choice into whatever test runs next in the same file.
  if (i18n.language !== 'sq') await i18n.changeLanguage('sq')

  // jsdom doesn't implement matchMedia — ThemeContext calls it on first render
  // to pick a light/dark default when nothing is stored yet, and
  // InstallPromptContext uses it to detect a standalone launch.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  })

  // Reveal-on-scroll relies on IntersectionObserver, which jsdom also lacks.
  class MockIntersectionObserver {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  }
  // @ts-expect-error — partial stand-in, tests only need the constructor to exist.
  window.IntersectionObserver = MockIntersectionObserver
})

afterEach(() => {
  cleanup()
  server.resetHandlers()
  localStorage.clear()
})

afterAll(() => {
  server.close()
})
