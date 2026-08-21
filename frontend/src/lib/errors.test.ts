import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { i18nReady } from '../i18n'
import { ApiError } from './api'
import { getErrorMessage, getFieldErrors, getSlotTakenMessage, getStaleRecordMessage } from './errors'
import sq from '../locales/sq/common.json'

// getErrorMessage() reads i18next directly (see errors.ts), so these
// assertions read the same sq/common.json source instead of duplicating its
// strings — a translation edit can't silently desync this test from the copy
// it is meant to guard.
beforeAll(async () => {
  await i18nReady
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('getErrorMessage', () => {
  it.each([
    [400, sq.errors['400']],
    [401, sq.errors['401']],
    [403, sq.errors['403']],
    [404, sq.errors['404']],
    [409, sq.errors['409']],
    [429, sq.errors['429']],
    [500, sq.errors['500']],
    [502, sq.errors['500']],
    [503, sq.errors['500']],
  ])('maps status %i to the correct message', (status, expected) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const error = new ApiError('SOME-RAW-BACKEND-DETAIL', status)
    expect(getErrorMessage(error)).toBe(expected)
  })

  it('maps a network failure (status 0) to the offline message', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const error = new ApiError('Nuk u lidhëm dot me serverin. A është backend-i i ndezur?', 0)
    expect(getErrorMessage(error)).toBe(sq.errors.network)
  })

  it('maps a non-ApiError (thrown string, plain Error, etc.) to the generic fallback', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(getErrorMessage(new Error('boom'))).toBe(sq.errors.default)
    expect(getErrorMessage('not even an Error')).toBe(sq.errors.default)
    expect(getErrorMessage(undefined)).toBe(sq.errors.default)
  })

  it('never surfaces the raw backend detail text, regardless of status', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    for (const status of [400, 401, 403, 404, 409, 429, 500]) {
      const error = new ApiError('Një ose më shumë fusha janë të pavlefshme', status)
      expect(getErrorMessage(error)).not.toContain('Një ose më shumë fusha')
    }
  })

  it('lets a call site override the copy for a specific status (e.g. a context-specific 409)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const error = new ApiError('conflict', 409)
    expect(getErrorMessage(error, { 409: getSlotTakenMessage() })).toBe(sq.errors.slotTaken)
    expect(getErrorMessage(error, { 409: getStaleRecordMessage() })).toBe(sq.errors.staleRecord)
  })

  it('always logs the original error to the console with status and endpoint detail', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const error = new ApiError('Slot i zënë.', 409, '/api/appointments', { detail: 'Slot i zënë.' })
    getErrorMessage(error)
    expect(spy).toHaveBeenCalledTimes(1)
    const [line, detail] = spy.mock.calls[0]
    expect(line).toContain('/api/appointments')
    expect(line).toContain('409')
    expect(detail).toEqual({ detail: 'Slot i zënë.' })
  })
})

describe('getSlotTakenMessage / getStaleRecordMessage', () => {
  it('return the current-language copy for the booking conflict messages', () => {
    expect(getSlotTakenMessage()).toBe(sq.errors.slotTaken)
    expect(getStaleRecordMessage()).toBe(sq.errors.staleRecord)
  })
})

describe('getFieldErrors', () => {
  it('extracts field-level messages from a 400 with an ASP.NET-style errors object', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const error = new ApiError('Validation failed', 400, '/api/patients/me', {
      errors: { Email: ['Email-i nuk është i vlefshëm.'], FirstName: ['Emri është i detyrueshëm.'] },
    })
    expect(getFieldErrors(error)).toEqual({
      email: 'Email-i nuk është i vlefshëm.',
      firstName: 'Emri është i detyrueshëm.',
    })
  })

  it('returns null for a 400 with no errors object, so callers fall back to a form-level message', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const error = new ApiError('Bad request', 400, '/api/x', { detail: 'Something went wrong' })
    expect(getFieldErrors(error)).toBeNull()
  })

  it('returns null for non-400 statuses', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const error = new ApiError('Conflict', 409, '/api/x', { errors: { Email: ['dup'] } })
    expect(getFieldErrors(error)).toBeNull()
  })

  it('returns null for non-ApiError values', () => {
    expect(getFieldErrors(new Error('boom'))).toBeNull()
  })
})
