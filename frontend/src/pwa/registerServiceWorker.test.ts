import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MIN_CHECK_GAP_MS, UPDATE_CHECK_INTERVAL_MS, watchForUpdates } from './registerServiceWorker'

function fakeRegistration() {
  return { update: vi.fn(() => Promise.resolve()), installing: null } as unknown as ServiceWorkerRegistration & {
    update: ReturnType<typeof vi.fn>
  }
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('watchForUpdates', () => {
  let stop: () => void = () => undefined

  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    stop()
    vi.useRealTimers()
  })

  it('checks for a new service worker every hour while the app stays open', () => {
    const reg = fakeRegistration()
    stop = watchForUpdates(reg)

    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS - 1)
    expect(reg.update).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(reg.update).toHaveBeenCalledTimes(1)
  })

  it('checks when the app returns to the foreground, at most once per gap', () => {
    const reg = fakeRegistration()
    stop = watchForUpdates(reg)

    vi.advanceTimersByTime(MIN_CHECK_GAP_MS)
    setVisibility('visible')
    expect(reg.update).toHaveBeenCalledTimes(1)

    setVisibility('hidden')
    setVisibility('visible')
    expect(reg.update).toHaveBeenCalledTimes(1)
  })

  it('does not start a second check while an update is already installing', () => {
    const reg = fakeRegistration()
    Object.assign(reg, { installing: {} })
    stop = watchForUpdates(reg)

    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS)
    expect(reg.update).not.toHaveBeenCalled()
  })

  it('swallows a failed check (offline, flaky network)', async () => {
    const reg = fakeRegistration()
    reg.update.mockRejectedValueOnce(new Error('offline'))
    stop = watchForUpdates(reg)

    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS)
    await Promise.resolve()
    expect(reg.update).toHaveBeenCalledTimes(1)
  })
})
