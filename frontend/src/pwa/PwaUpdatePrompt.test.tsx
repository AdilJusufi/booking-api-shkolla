// The update flow is driven through registerServiceWorker's callbacks rather
// than a real worker: jsdom has no ServiceWorkerContainer, so there is nothing
// to install, wait or activate. Mocking that seam lets the component's actual
// contract be tested — what the user sees when an update is waiting, and what
// happens when they accept it.
import { act, render, screen } from '@testing-library/react'
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

beforeEach(() => {
  captured = null
  updateSW.mockClear()
})

describe('PwaUpdatePrompt', () => {
  it('renders nothing until a waiting service worker is detected', () => {
    render(<PwaUpdatePrompt />)
    expect(screen.queryByText('Një version i ri është i disponueshëm.')).not.toBeInTheDocument()
  })

  it('shows the update prompt when a waiting service worker is detected', () => {
    render(<PwaUpdatePrompt />)
    signalWaitingWorker()

    expect(screen.getByText('Një version i ri është i disponueshëm.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Rifresko/ })).toBeInTheDocument()
  })

  it('activates the waiting worker and reloads only once the user accepts', async () => {
    const user = userEvent.setup()
    render(<PwaUpdatePrompt />)
    signalWaitingWorker()

    // Nothing happens on its own — a silent reload could discard a booking form.
    expect(updateSW).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /Rifresko/ }))

    // `true` is what tells the plugin to activate the worker and reload.
    expect(updateSW).toHaveBeenCalledWith(true)
  })

  it('lets the user dismiss the prompt without updating', async () => {
    const user = userEvent.setup()
    render(<PwaUpdatePrompt />)
    signalWaitingWorker()

    await user.click(screen.getByRole('button', { name: 'Mbyll njoftimin' }))

    expect(screen.queryByText('Një version i ri është i disponueshëm.')).not.toBeInTheDocument()
    expect(updateSW).not.toHaveBeenCalled()
  })
})
