import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './api'
import { classifyUploadError, CloudinaryRejectedError, doctorPhotoUrl } from './cloudinary'
import { getUploadErrorMessage } from './errors'

describe('classifyUploadError / getUploadErrorMessage', () => {
  // getUploadErrorMessage logs every error by design; keep the test output clean.
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it.each([
    [new ApiError('x', 503, '/sig', { code: 'uploads-not-configured' }), 'not-configured', 'Ngarkimi i imazheve nuk është i disponueshëm'],
    [new ApiError('x', 403, '/sig', { code: 'forbidden' }), 'forbidden', 'Nuk keni leje'],
    [new CloudinaryRejectedError(400, 'Invalid image file'), 'rejected', 'Imazhi u refuzua'],
    // Wrong api_key/secret on the server: not the user's file.
    [new CloudinaryRejectedError(401, 'Unknown API key'), 'not-configured', 'Ngarkimi i imazheve nuk është i disponueshëm'],
    [new ApiError('x', 0, '/sig'), 'network', 'Nuk u lidhëm dot'],
    [new TypeError('Failed to fetch'), 'network', 'Nuk u lidhëm dot'],
    // A plain 503 without our code is an outage, not missing config — don't claim otherwise.
    [new ApiError('x', 503, '/sig'), 'other', 'Ngarkimi dështoi'],
    [new ApiError('x', 500, '/sig'), 'other', 'Ngarkimi dështoi'],
  ])('%s → %s', (error, kind, message) => {
    expect(classifyUploadError(error)).toBe(kind)
    expect(getUploadErrorMessage(error)).toContain(message)
  })
})

describe('doctorPhotoUrl', () => {
  const original = 'https://res.cloudinary.com/c/image/upload/v1/doctors/d/photo/a.jpg'

  it('requests a face-cropped square at 2× the display size', () => {
    expect(doctorPhotoUrl(original, 56)).toBe(
      'https://res.cloudinary.com/c/image/upload/c_fill,g_face,w_112,h_112,f_auto,q_auto/v1/doctors/d/photo/a.jpg',
    )
  })

  it('never asks for more than 400px', () => {
    expect(doctorPhotoUrl(original, 300)).toContain('w_400,h_400')
  })
})
