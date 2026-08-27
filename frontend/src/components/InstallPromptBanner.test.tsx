import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import InstallPromptBanner from './InstallPromptBanner'
import { renderWithProviders } from '../test/render'

const DISMISSED_KEY = 'rezervo.pwa.installDismissedThisSession'
const FIXED_TEXT = 'Instaloni Rezervo Mjekun për qasje më të shpejtë'
const INSTALL_LABEL = 'Instalo'

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
const ANDROID_CHROME_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/119.0.0.0 Mobile Safari/537.36'

/** Stands in for Chromium's beforeinstallprompt event. */
function fireBeforeInstallPrompt(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt') as Event & {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
  }
  event.prompt = vi.fn(() => Promise.resolve())
  event.userChoice = Promise.resolve({ outcome })
  act(() => {
    window.dispatchEvent(event)
  })
  return event
}

function renderBanner(route = '/kerko') {
  return renderWithProviders(<InstallPromptBanner />, { route })
}

afterEach(() => {
  vi.restoreAllMocks()
  sessionStorage.clear()
})

describe('InstallPromptBanner — installed state', () => {
  it('renders nothing when the app is already running standalone', () => {
    mockMatchMedia('(display-mode: standalone)')
    renderBanner()
    expect(screen.queryByText(FIXED_TEXT)).not.toBeInTheDocument()
  })
})

describe('InstallPromptBanner — every visit, immediately', () => {
  it('shows on arrival with no delay or engagement trigger needed, on an ordinary route', () => {
    mockMatchMedia(null)
    renderBanner('/kerko')
    expect(screen.getByText(FIXED_TEXT)).toBeInTheDocument()
  })

  it('shows the same fixed message regardless of platform — only the click behavior differs', () => {
    mockMatchMedia(null)
    mockUserAgent(IPHONE_SAFARI_UA)
    renderBanner('/kerko')
    expect(screen.getByText(FIXED_TEXT)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: INSTALL_LABEL })).toBeInTheDocument()
  })
})

describe('InstallPromptBanner — Android/desktop native path', () => {
  it('wires the install button to the captured beforeinstallprompt event', async () => {
    mockMatchMedia(null)
    mockUserAgent(ANDROID_CHROME_UA)
    renderBanner('/kerko')

    const event = fireBeforeInstallPrompt('accepted')
    expect(event.prompt).not.toHaveBeenCalled()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: INSTALL_LABEL }))

    expect(event.prompt).toHaveBeenCalledTimes(1)
  })

  it('hides the bar for the session once the native dialog is accepted', async () => {
    mockMatchMedia(null)
    mockUserAgent(ANDROID_CHROME_UA)
    renderBanner('/kerko')
    fireBeforeInstallPrompt('accepted')

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: INSTALL_LABEL }))

    expect(screen.queryByText(FIXED_TEXT)).not.toBeInTheDocument()
  })

  it('keeps the bar visible after the native dialog is dismissed, and falls through to instructions on the next click instead of doing nothing', async () => {
    mockMatchMedia(null)
    mockUserAgent(ANDROID_CHROME_UA)
    renderBanner('/kerko')
    const event = fireBeforeInstallPrompt('dismissed')

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: INSTALL_LABEL }))
    expect(event.prompt).toHaveBeenCalledTimes(1)
    expect(screen.getByText(FIXED_TEXT)).toBeInTheDocument()

    // deferredEvent is now spent — the same click target should open the
    // instructions modal rather than silently doing nothing.
    await user.click(screen.getByRole('button', { name: INSTALL_LABEL }))
    expect(screen.getByText('Instaloni aplikacionin')).toBeInTheDocument()
  })
})

describe('InstallPromptBanner — no native prompt available', () => {
  it('opens the instructions modal when beforeinstallprompt never fires (Firefox, or a suppressed re-fire)', async () => {
    mockMatchMedia(null)
    mockUserAgent(ANDROID_CHROME_UA)
    renderBanner('/kerko')
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: INSTALL_LABEL }))

    expect(screen.getByText('Instaloni aplikacionin')).toBeInTheDocument()
    expect(screen.getByText(/Hapni menynë e shfletuesit tuaj/)).toBeInTheDocument()
  })
})

describe('InstallPromptBanner — iOS', () => {
  it('shows the same bar as everywhere else, with no native path possible', () => {
    mockMatchMedia(null)
    mockUserAgent(IPHONE_SAFARI_UA)
    renderBanner('/kerko')

    expect(screen.getByText(FIXED_TEXT)).toBeInTheDocument()
  })

  it('opens the iOS-specific instructions modal on click, with the numbered Share-sheet steps', async () => {
    mockMatchMedia(null)
    mockUserAgent(IPHONE_SAFARI_UA)
    renderBanner('/kerko')
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: INSTALL_LABEL }))

    expect(screen.getByText('Instaloni në iPhone')).toBeInTheDocument()
    expect(screen.getByText('Prekni ikonën e ndarjes')).toBeInTheDocument()
    expect(screen.getByText('Zgjidhni "Shto në Ekranin Kryesor"')).toBeInTheDocument()
    expect(screen.getByText('Prekni "Shto"')).toBeInTheDocument()
  })

  it('stays on the iOS bar even if beforeinstallprompt somehow fires — Apple never actually sends it, but the banner should not contradict itself', () => {
    mockMatchMedia(null)
    mockUserAgent(IPHONE_SAFARI_UA)
    renderBanner('/kerko')
    fireBeforeInstallPrompt()

    expect(screen.getByText(FIXED_TEXT)).toBeInTheDocument()
  })
})

describe('InstallPromptBanner — excluded routes', () => {
  it.each([
    ['/hyr', 'login'],
    ['/regjistrohu', 'register'],
    ['/rezervo/konfirmo', 'booking confirmation'],
    ['/mjeku/doctor-1', 'doctor profile / slot selection'],
    ['/llogaria/fjalekalimi', 'change password form'],
  ])('does not render on %s (%s)', (route) => {
    mockMatchMedia(null)
    renderBanner(route)
    expect(screen.queryByText(FIXED_TEXT)).not.toBeInTheDocument()
  })

  it('does render on an ordinary route, for contrast', () => {
    mockMatchMedia(null)
    renderBanner('/terminet')
    expect(screen.getByText(FIXED_TEXT)).toBeInTheDocument()
  })
})

describe('InstallPromptBanner — dismissal is session-scoped, not permanent', () => {
  it('hides after dismissal and does not reappear on a later render within the same session', async () => {
    mockMatchMedia(null)
    const user = userEvent.setup()
    const first = renderBanner('/kerko')

    await user.click(screen.getByRole('button', { name: 'Mbyll njoftimin e instalimit' }))
    expect(screen.queryByText(FIXED_TEXT)).not.toBeInTheDocument()
    expect(sessionStorage.getItem(DISMISSED_KEY)).toBe('1')

    // A route change within the same visit — a fresh mount of the banner,
    // as happens on every navigation since it sits outside <Routes>.
    first.unmount()
    renderBanner('/klinika/clinic-1')
    expect(screen.queryByText(FIXED_TEXT)).not.toBeInTheDocument()
  })

  it('reappears on the next visit (a new session) after being dismissed', () => {
    mockMatchMedia(null)
    sessionStorage.setItem(DISMISSED_KEY, '1')
    const dismissedRender = renderBanner('/kerko')
    expect(screen.queryByText(FIXED_TEXT)).not.toBeInTheDocument()
    dismissedRender.unmount()

    // sessionStorage clearing is what a browser does when the tab/session
    // ends — simulated directly here rather than relying on jsdom teardown.
    sessionStorage.clear()
    renderBanner('/kerko')
    expect(screen.getByText(FIXED_TEXT)).toBeInTheDocument()
  })
})
