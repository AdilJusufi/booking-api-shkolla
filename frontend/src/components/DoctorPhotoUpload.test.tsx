import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../test/render'
import { server } from '../test/server'
import { API_BASE_URL } from '../test/api-base'
import DoctorPhotoUpload, { PHOTO_MAX_BYTES } from './DoctorPhotoUpload'

const DOCTOR_ID = '55555555-0001-5555-5555-555555555555'
const CLOUD = 'test-cloud'
const UPLOADED_URL = `https://res.cloudinary.com/${CLOUD}/image/upload/v1/doctors/${DOCTOR_ID}/photo/abc.jpg`
const SIGNATURE = {
  signature: 'sig',
  timestamp: 1790000000,
  apiKey: '123',
  cloudName: CLOUD,
  folder: `doctors/${DOCTOR_ID}/photo`,
  allowedFormats: 'jpg,jpeg,png,webp',
  maxFileSizeBytes: PHOTO_MAX_BYTES,
}
const CLOUDINARY_UPLOAD = `https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`

/** `size` fakes only the reported size (for the oversize check) — the body stays 1 byte. */
function file(name: string, type: string, size?: number): File {
  const f = new File(['x'], name, { type })
  if (size !== undefined) Object.defineProperty(f, 'size', { value: size })
  return f
}

function renderUpload(photoUrl?: string) {
  const onChange = vi.fn()
  renderWithProviders(
    <DoctorPhotoUpload doctorId={DOCTOR_ID} firstName="Arben" lastName="Gashi" photoUrl={photoUrl} onChange={onChange} />,
    { user: 'Doctor' },
  )
  return { onChange, input: screen.getByTestId('doctor-photo-input') as HTMLInputElement }
}

describe('DoctorPhotoUpload', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:preview')
    URL.revokeObjectURL = vi.fn()
  })

  it('signs, uploads to Cloudinary with exactly the signed fields, saves, and reports the new URL', async () => {
    let sentFields: Record<string, string> = {}
    let savedBody: unknown
    server.use(
      http.get(`${API_BASE_URL}/api/doctors/${DOCTOR_ID}/photo/upload-signature`, () => HttpResponse.json(SIGNATURE)),
      http.post(CLOUDINARY_UPLOAD, () => HttpResponse.json({ secure_url: UPLOADED_URL })),
      http.put(`${API_BASE_URL}/api/doctors/${DOCTOR_ID}/photo`, async ({ request }) => {
        savedBody = await request.json()
        return HttpResponse.json({ photoUrl: UPLOADED_URL })
      }),
    )
    // Reading a multipart body inside an MSW handler hangs under jsdom, so capture the
    // FormData the component hands to fetch() instead, and pass the call through.
    const realFetch = globalThis.fetch
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      if (String(input) === CLOUDINARY_UPLOAD && init?.body instanceof FormData) {
        sentFields = Object.fromEntries(
          [...init.body.entries()].filter(([k]) => k !== 'file').map(([k, v]) => [k, String(v)]),
        )
      }
      return realFetch(input, init)
    })
    const user = userEvent.setup()
    const { onChange, input } = renderUpload()

    await user.upload(input, file('me.jpg', 'image/jpeg'))

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(UPLOADED_URL))
    fetchSpy.mockRestore()
    expect(sentFields).toEqual({
      api_key: '123',
      timestamp: '1790000000',
      signature: 'sig',
      folder: `doctors/${DOCTOR_ID}/photo`,
      allowed_formats: 'jpg,jpeg,png,webp',
      max_file_size: String(PHOTO_MAX_BYTES),
    })
    expect(savedBody).toEqual({ photoUrl: UPLOADED_URL })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(await screen.findByText('Fotoja u përditësua.')).toBeInTheDocument()
  })

  it('shows a loading state and a local preview while uploading', async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/doctors/${DOCTOR_ID}/photo/upload-signature`, async () => {
        await new Promise((r) => setTimeout(r, 50))
        return HttpResponse.json(SIGNATURE)
      }),
      http.post(CLOUDINARY_UPLOAD, () => HttpResponse.json({ secure_url: UPLOADED_URL })),
      http.put(`${API_BASE_URL}/api/doctors/${DOCTOR_ID}/photo`, () => HttpResponse.json({ photoUrl: UPLOADED_URL })),
    )
    const user = userEvent.setup()
    const { input } = renderUpload()

    await user.upload(input, file('me.png', 'image/png'))

    expect(screen.getByRole('status', { name: 'Duke ngarkuar foton' })).toBeInTheDocument()
    expect(document.querySelector('img[src="blob:preview"]')).not.toBeNull()
    await waitFor(() => expect(screen.queryByRole('status', { name: 'Duke ngarkuar foton' })).not.toBeInTheDocument())
  })

  it('rejects a wrong file type before any request', async () => {
    const user = userEvent.setup({ applyAccept: false })
    const { onChange, input } = renderUpload()

    await user.upload(input, file('logo.svg', 'image/svg+xml'))

    expect(screen.getByRole('alert')).toHaveTextContent('Formati nuk mbështetet. Përdorni JPG, PNG ose WEBP.')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('rejects an oversized file before any request', async () => {
    const user = userEvent.setup()
    const { onChange, input } = renderUpload()

    await user.upload(input, file('big.jpg', 'image/jpeg', PHOTO_MAX_BYTES + 1))

    expect(screen.getByRole('alert')).toHaveTextContent('Fotoja është shumë e madhe. Madhësia maksimale është 5 MB.')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('explains clearly when uploads are not configured on the server (503)', async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/doctors/${DOCTOR_ID}/photo/upload-signature`, () =>
        HttpResponse.json({ status: 503, code: 'uploads-not-configured' }, { status: 503 }),
      ),
    )
    const user = userEvent.setup()
    const { onChange, input } = renderUpload()

    await user.upload(input, file('me.jpg', 'image/jpeg'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Ngarkimi i imazheve nuk është i disponueshëm për momentin.')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('says the image was rejected when Cloudinary refuses it, and does not save', async () => {
    let saved = false
    server.use(
      http.get(`${API_BASE_URL}/api/doctors/${DOCTOR_ID}/photo/upload-signature`, () => HttpResponse.json(SIGNATURE)),
      http.post(CLOUDINARY_UPLOAD, () =>
        HttpResponse.json({ error: { message: 'File size too large.' } }, { status: 400 }),
      ),
      http.put(`${API_BASE_URL}/api/doctors/${DOCTOR_ID}/photo`, () => {
        saved = true
        return HttpResponse.json({})
      }),
    )
    const user = userEvent.setup()
    const { onChange, input } = renderUpload()

    await user.upload(input, file('me.jpg', 'image/jpeg'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Imazhi u refuzua nga shërbimi i ruajtjes.')
    expect(saved).toBe(false)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('says permission is missing on 403', async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/doctors/${DOCTOR_ID}/photo/upload-signature`, () =>
        HttpResponse.json({ status: 403, code: 'forbidden' }, { status: 403 }),
      ),
    )
    const user = userEvent.setup()
    const { input } = renderUpload()

    await user.upload(input, file('me.jpg', 'image/jpeg'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Nuk keni leje ta ndryshoni këtë imazh.')
  })

  it('removes an existing photo', async () => {
    let savedBody: unknown
    server.use(
      http.put(`${API_BASE_URL}/api/doctors/${DOCTOR_ID}/photo`, async ({ request }) => {
        savedBody = await request.json()
        return HttpResponse.json({ photoUrl: null })
      }),
    )
    const user = userEvent.setup()
    const { onChange } = renderUpload(UPLOADED_URL)

    await user.click(screen.getByRole('button', { name: 'Hiq foton' }))

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(null))
    expect(savedBody).toEqual({ photoUrl: null })
  })
})
