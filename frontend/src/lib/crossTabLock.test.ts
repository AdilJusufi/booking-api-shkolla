import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withRefreshLock } from './crossTabLock'

const LOCK_NAME = 'rezervo.auth.refresh'

/**
 * jsdom nuk e ka Web Locks API, ndaj këto teste godasin rrugën e rezervës me localStorage —
 * pikërisht atë që ka më shumë nevojë për provë, sepse Web Locks është atomik nga vetë
 * platforma ndërsa rezerva është logjikë e jona.
 */
describe('withRefreshLock — mutex mes skedave', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useRealTimers()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('serialises overlapping callers instead of running them at once', async () => {
    let running = 0
    let maxConcurrent = 0

    const work = () =>
      withRefreshLock(async () => {
        running += 1
        maxConcurrent = Math.max(maxConcurrent, running)
        await new Promise((r) => setTimeout(r, 20))
        running -= 1
        return 'ok'
      })

    await Promise.all([work(), work(), work()])

    expect(maxConcurrent).toBe(1)
  })

  it('releases the lock so a later caller can acquire it', async () => {
    await withRefreshLock(async () => 'first')
    expect(localStorage.getItem(LOCK_NAME)).toBeNull()

    await expect(withRefreshLock(async () => 'second')).resolves.toBe('second')
  })

  it('releases the lock even when the work throws', async () => {
    await expect(withRefreshLock(async () => { throw new Error('boom') })).rejects.toThrow('boom')

    expect(localStorage.getItem(LOCK_NAME)).toBeNull()
    await expect(withRefreshLock(async () => 'after')).resolves.toBe('after')
  })

  /**
   * Rasti "skeda udhëheqëse u mbyll në mes të punës": bllokimi mbetet i shkruar në
   * localStorage dhe askush s'e liron. Pa afat skadimi, çdo skedë tjetër do të priste
   * përgjithmonë një përgjigje që s'vjen kurrë.
   */
  it('takes over a stale lock left behind by a tab that was closed mid-refresh', async () => {
    const longExpired = Date.now() - 60_000
    localStorage.setItem(LOCK_NAME, `skeda-e-vdekur:${longExpired}`)

    await expect(withRefreshLock(async () => 'recovered')).resolves.toBe('recovered')
  })

  it('does not steal a lock that is still fresh', async () => {
    localStorage.setItem(LOCK_NAME, `skeda-aktive:${Date.now()}`)

    let started = false
    const pending = withRefreshLock(async () => {
      started = true
      return 'should not run yet'
    })

    await new Promise((r) => setTimeout(r, 100))
    expect(started, 'bllokimi i freskët i një skede tjetër duhet respektuar').toBe(false)

    localStorage.removeItem(LOCK_NAME)
    await expect(pending).resolves.toBe('should not run yet')
  })
})
