// Offline behaviour that is observable from the app: the connectivity banner
// and the cold-launch fallback.
//
// The service worker itself is not exercised here — jsdom has no
// ServiceWorkerContainer, no Cache Storage and no fetch interception, so
// precaching, navigation fallback and cache expiry are verified manually
// against a real build (see the report). What *is* covered here is everything
// the app renders in response to being offline, which is where the user-facing
// behaviour lives.
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../test/render'
import OfflineBanner from '../components/OfflineBanner'
import App from '../App'

// Restored individually rather than with vi.restoreAllMocks(): setup.ts
// installs the jsdom matchMedia stand-in once in beforeAll, and a blanket
// restore would strip its implementation for every later test in this file.
let onLineSpy: ReturnType<typeof vi.spyOn> | null = null
let originalLocation: PropertyDescriptor | undefined

/** Overrides navigator.onLine, which jsdom exposes as a read-only getter. */
function setOnline(value: boolean) {
  onLineSpy ??= vi.spyOn(navigator, 'onLine', 'get')
  onLineSpy.mockReturnValue(value)
}

/** Fires the connectivity event the browser would emit for this transition. */
function fireConnectivity(value: boolean) {
  setOnline(value)
  act(() => {
    window.dispatchEvent(new Event(value ? 'online' : 'offline'))
  })
}

afterEach(() => {
  onLineSpy?.mockRestore()
  onLineSpy = null
  if (originalLocation) {
    Object.defineProperty(window, 'location', originalLocation)
    originalLocation = undefined
  }
})

describe('OfflineBanner', () => {
  it('renders nothing while the browser reports a connection', () => {
    setOnline(true)
    render(<OfflineBanner />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('appears when the connection drops and clears when it returns', () => {
    setOnline(true)
    render(<OfflineBanner />)
    expect(screen.queryByText(/Jeni offline/)).not.toBeInTheDocument()

    fireConnectivity(false)
    expect(screen.getByText(/Jeni offline/)).toBeInTheDocument()

    fireConnectivity(true)
    expect(screen.queryByText(/Jeni offline/)).not.toBeInTheDocument()
  })

  it('renders immediately when the app starts up already offline', () => {
    setOnline(false)
    render(<OfflineBanner />)
    expect(screen.getByText(/Jeni offline/)).toBeInTheDocument()
  })
})

describe('offline fallback on a cold launch', () => {
  it('replaces the routed app when it starts with no connection', () => {
    setOnline(false)
    renderWithProviders(<App />, { route: '/kerko' })

    expect(screen.getByText('Nuk keni lidhje me internetin')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Provo përsëri' })).toBeInTheDocument()
  })

  it('offers a retry that reloads the app', async () => {
    setOnline(false)
    const reload = vi.fn()
    // jsdom throws on a real navigation; swap location.reload for a spy.
    originalLocation = Object.getOwnPropertyDescriptor(window, 'location')
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    })

    const user = userEvent.setup()
    renderWithProviders(<App />, { route: '/kerko' })
    await user.click(screen.getByRole('button', { name: 'Provo përsëri' }))

    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does not hijack the app when the connection drops mid-session', () => {
    // Something has already loaded, so the banner is the right signal — taking
    // over the whole screen would throw away content the user can still read.
    setOnline(true)
    renderWithProviders(<App />, { route: '/kerko' })

    fireConnectivity(false)

    expect(screen.queryByText('Nuk keni lidhje me internetin')).not.toBeInTheDocument()
  })
})
