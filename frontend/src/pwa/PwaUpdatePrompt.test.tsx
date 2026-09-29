// The update flow is driven through registerServiceWorker's callbacks rather
// than a real worker: jsdom has no ServiceWorkerContainer, so there is nothing
// to install, wait or activate. Mocking that seam lets the component's actual
// contract be tested — what the user sees when an update is waiting, and what
// happens when they accept it.
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ServiceWorkerCallbacks } from './registerServiceWorker'
import PwaUpdatePrompt from './PwaUpdatePrompt'

const updateSW = vi.fn(() => Promise.resolve())
let captured: ServiceWorkerCallbacks | null = null

vi.mock('./registerServiceWorker', () => ({
  registerServiceWorker: (callbacks: ServiceWorkerCallbacks) => {
    captured = callbacks
    return updateSW
  },
}))

/** Stands in for the browser telling us a new worker is installed and waiting. */
function signalWaitingWorker() {
  act(() => {
    captured?.onNeedRefresh()
  })
}

/** The user has started using the page, so a reload could now lose something. */
function interact() {
  fireEvent.pointerDown(document.body)
}

beforeEach(() => {
  captured = null
  updateSW.mockClear()
})

describe('PwaUpdatePrompt', () => {
  it('renders nothing until a waiting service worker is detected', () => {
    render(<PwaUpdatePrompt />)
    expect(screen.queryByText('Një version i ri është i disponueshëm.')).not.toBeInTheDocument()
  })

  it('applies an update found before the user touched the page, without asking', () => {
    render(<PwaUpdatePrompt />)
    signalWaitingWorker()

    // Launch/reload with a worker already waiting: nothing to lose, so a reload
    // never leaves the user on the old version.
    expect(updateSW).toHaveBeenCalledWith(true)
    expect(screen.getByRole('button', { name: /Duke rifreskuar/ })).toBeDisabled()
  })

  it('treats a keypress as interaction too', () => {
    render(<PwaUpdatePrompt />)
    fireEvent.keyDown(document.body, { key: 'a' })
    signalWaitingWorker()

    expect(updateSW).not.toHaveBeenCalled()
  })

  it('asks instead once the user has interacted', () => {
    render(<PwaUpdatePrompt />)
    interact()
    signalWaitingWorker()

    expect(screen.getByText('Një version i ri është i disponueshëm.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Rifresko/ })).toBeEnabled()
  })

  it('activates the waiting worker and reloads only once the user accepts', async () => {
    const user = userEvent.setup()
    render(<PwaUpdatePrompt />)
    interact()
    signalWaitingWorker()

    // Nothing happens on its own mid-session — a silent reload could discard a booking form.
    expect(updateSW).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /Rifresko/ }))

    // `true` is what tells the plugin to activate the worker and reload.
    expect(updateSW).toHaveBeenCalledWith(true)
  })

  it('lets the user dismiss the prompt without updating', async () => {
    const user = userEvent.setup()
    render(<PwaUpdatePrompt />)
    interact()
    signalWaitingWorker()

    await user.click(screen.getByRole('button', { name: 'Mbyll njoftimin' }))

    expect(screen.queryByText('Një version i ri është i disponueshëm.')).not.toBeInTheDocument()
    expect(updateSW).not.toHaveBeenCalled()
  })
})
