import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InstallPromptProvider, useInstallPrompt } from './InstallPromptContext'

const DISMISSED_KEY = 'rezervo.pwa.installDismissed'

/** Stands in for Chromium's beforeinstallprompt event. */
function fireBeforeInstallPrompt() {
  const event = new Event('beforeinstallprompt') as Event & {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
  }
  event.prompt = vi.fn(() => Promise.resolve())
  event.userChoice = Promise.resolve({ outcome: 'accepted' as const })
  act(() => {
    window.dispatchEvent(event)
  })
  return event
}

/** Exposes the "the app was just useful" trigger that ConfirmBookingPage calls. */
function BookingTrigger() {
  const { requestInstallOffer } = useInstallPrompt()
  return (
    <button type="button" onClick={requestInstallOffer}>
      simulate booking
    </button>
  )
}

function renderProvider() {
  return render(
    <InstallPromptProvider>
      <BookingTrigger />
    </InstallPromptProvider>,
  )
}

const TITLE = 'Shtoje Rezervo Mjekun në ekranin bazë'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('InstallPromptContext', () => {
  it('stays hidden on arrival, even once the browser offers to install', () => {
    renderProvider()
    fireBeforeInstallPrompt()

    // Nothing has happened yet that would justify interrupting the user.
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument()
  })

  it('offers installation only after the app has been useful', async () => {
    const user = userEvent.setup()
    renderProvider()
    fireBeforeInstallPrompt()

    await user.click(screen.getByRole('button', { name: 'simulate booking' }))

    expect(screen.getByText(TITLE)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Instalo' })).toBeInTheDocument()
  })

  it('persists a dismissal so the offer does not return on the next visit', async () => {
    const user = userEvent.setup()
    const first = renderProvider()
    fireBeforeInstallPrompt()
    await user.click(screen.getByRole('button', { name: 'simulate booking' }))
    await user.click(screen.getByRole('button', { name: 'Mbyll' }))

    expect(screen.queryByText(TITLE)).not.toBeInTheDocument()
    expect(localStorage.getItem(DISMISSED_KEY)).toBe('1')

    // A fresh mount, as on a later visit — the stored dismissal still holds.
    first.unmount()
    renderProvider()
    fireBeforeInstallPrompt()
    await user.click(screen.getByRole('button', { name: 'simulate booking' }))

    expect(screen.queryByText(TITLE)).not.toBeInTheDocument()
  })

  it('does not offer anything once the app is already running standalone', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) => ({ matches: query === '(display-mode: standalone)', media: query } as MediaQueryList),
    )
    const user = userEvent.setup()
    renderProvider()
    fireBeforeInstallPrompt()

    await user.click(screen.getByRole('button', { name: 'simulate booking' }))

    expect(screen.queryByText(TITLE)).not.toBeInTheDocument()
  })

  it('shows Share instructions instead of an install button on iOS, which has no install event', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
    )
    const user = userEvent.setup()
    renderProvider()
    // Note: no beforeinstallprompt — iOS never fires one.

    await user.click(screen.getByRole('button', { name: 'simulate booking' }))

    expect(screen.getByText(TITLE)).toBeInTheDocument()
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Instalo' })).not.toBeInTheDocument()
  })

  it('shows nothing on a desktop browser that never offered an install', async () => {
    const user = userEvent.setup()
    renderProvider()

    await user.click(screen.getByRole('button', { name: 'simulate booking' }))

    expect(screen.queryByText(TITLE)).not.toBeInTheDocument()
  })
})
