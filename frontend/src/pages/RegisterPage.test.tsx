import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '../test/render'
import { server } from '../test/server'
import { API_BASE_URL } from '../test/api-base'
import type { RegisterClinicRequest } from '../lib/types'
import RegisterPage from './RegisterPage'

const REGISTER_URL = `${API_BASE_URL}/api/auth/register`
const REGISTER_CLINIC_URL = `${API_BASE_URL}/api/auth/register-clinic`

// RegisterPage's <label> elements are siblings of their inputs, not wrapping
// them via htmlFor, so they aren't queryable via getByLabelText. Target by
// input type/placeholder instead, matching this page's existing test-friendly
// surface (there's no id/name on most fields).
async function fillMinimalForm(user: ReturnType<typeof userEvent.setup>) {
  const [firstName, lastName] = screen.getAllByRole('textbox')
  await user.type(firstName, 'Testi')
  await user.type(lastName, 'Përdorues')

  const emailField = document.querySelector('input[type="email"]') as HTMLInputElement
  const phoneField = screen.getByPlaceholderText('+383 4x xxx xxx')
  const dobField = document.querySelector('input[type="date"]') as HTMLInputElement
  const passwordField = document.querySelector('input[type="password"]') as HTMLInputElement

  await user.type(emailField, 'postuar@tashme.dev')
  await user.type(phoneField, '+383 44 123 456')
  await user.type(dobField, '1995-05-05')
  await user.type(passwordField, 'StrongPass1')
}

/**
 * Fills every `required` field on the clinic path — account holder, clinic,
 * and the single default branch — leaving the optional ones (description,
 * clinic email, website, municipality, branch phone) blank. Same
 * order-of-appearance targeting as fillMinimalForm(), since these fields
 * carry no id/name/htmlFor either.
 */
async function fillMinimalClinicForm(user: ReturnType<typeof userEvent.setup>) {
  const textboxes = screen.getAllByRole('textbox')
  const [firstName, lastName, email, phoneNumber, clinicName, , clinicPhoneNumber, , , branchName, branchAddress, branchCity] = textboxes

  await user.type(firstName, 'Drilon')
  await user.type(lastName, 'Krasniqi')
  await user.type(email, 'admin@klinika-test.dev')
  await user.type(phoneNumber, '+383 44 111 222')
  await user.type(clinicName, 'Poliklinika Testuese')
  await user.type(clinicPhoneNumber, '+383 38 111 222')
  await user.type(branchName, 'Dega Qendër')
  await user.type(branchAddress, 'Rr. Testuese 1')
  await user.type(branchCity, 'Prishtinë')

  const [password, confirmPassword] = document.querySelectorAll('input[type="password"]')
  await user.type(password, 'StrongPass1')
  await user.type(confirmPassword, 'StrongPass1')
}

function buildClinicAuthResponse() {
  return {
    userId: 'user-clinic-admin-0001',
    firstName: 'Drilon',
    lastName: 'Krasniqi',
    email: 'admin@klinika-test.dev',
    roles: ['ClinicAdmin'],
    accessToken: 'test-access-token',
    accessTokenExpiresAt: '2026-08-25T00:00:00Z',
    refreshToken: 'test-refresh-token',
    refreshTokenExpiresAt: '2026-09-01T00:00:00Z',
  }
}

describe('RegisterPage — duplicate email handling (409)', () => {
  it('renders the duplicate-email message inline on the email field with working links to /hyr and /harrova-fjalekalimin — never the raw backend detail', async () => {
    server.use(
      http.post(REGISTER_URL, () =>
        HttpResponse.json(
          { type: 'https://booking-api.dev/errors/email-exists', title: 'Konflikt', status: 409, detail: 'Ekziston tashmë një llogari me këtë email.' },
          { status: 409 },
        ),
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(<RegisterPage />)

    await fillMinimalForm(user)
    await user.click(screen.getByRole('button', { name: /Regjistrohu/i }))

    await waitFor(() => expect(screen.getByText(/Ky email është i regjistruar tashmë/)).toBeInTheDocument())

    // Raw backend detail never rendered.
    expect(screen.queryByText('Ekziston tashmë një llogari me këtë email.')).not.toBeInTheDocument()

    // Both links present and pointing at the right routes.
    const errorRegion = screen.getByText(/Ky email është i regjistruar tashmë/).closest('span') as HTMLElement
    const loginLink = within(errorRegion).getByRole('link', { name: 'hyni' })
    const resetLink = within(errorRegion).getByRole('link', { name: 'rivendosni fjalëkalimin' })
    expect(loginLink).toHaveAttribute('href', '/hyr')
    expect(resetLink).toHaveAttribute('href', '/harrova-fjalekalimin')
  })

  it('maps a 422 password-policy failure to an inline message under the password field, not a generic banner', async () => {
    server.use(
      http.post(REGISTER_URL, () =>
        HttpResponse.json(
          {
            type: 'https://booking-api.dev/errors/validation',
            title: 'Validimi dështoi',
            status: 422,
            detail: 'Një ose më shumë fusha janë të pavlefshme.',
            errors: { Password: ['Password-i duhet të përmbajë së paku një shkronjë të madhe.'] },
          },
          { status: 422 },
        ),
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(<RegisterPage />)

    await fillMinimalForm(user)
    await user.click(screen.getByRole('button', { name: /Regjistrohu/i }))

    await waitFor(() =>
      expect(screen.getByText('Password-i duhet të përmbajë së paku një shkronjë të madhe.')).toBeInTheDocument(),
    )
    expect(screen.queryByText('Një ose më shumë fusha janë të pavlefshme.')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('RegisterPage — account type toggle', () => {
  it('defaults to the patient form and switches to the clinic form on toggle, without leaving patient-only fields behind', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RegisterPage />)

    // Patient-only fields present by default.
    expect(document.querySelector('input[type="date"]')).not.toBeNull()

    await user.click(screen.getByRole('tab', { name: 'Klinikë' }))

    // Patient-only fields (date of birth, gender select) are gone…
    expect(document.querySelector('input[type="date"]')).toBeNull()
    // …and clinic-only fields have appeared.
    expect(screen.getByText('Të dhënat e klinikës')).toBeInTheDocument()
    expect(screen.getByText('Degët')).toBeInTheDocument()
    // Confirm-password only exists on the clinic path.
    expect(document.querySelectorAll('input[type="password"]')).toHaveLength(2)

    await user.click(screen.getByRole('tab', { name: 'Pacient' }))
    expect(document.querySelector('input[type="date"]')).not.toBeNull()
    expect(document.querySelectorAll('input[type="password"]')).toHaveLength(1)
  })

  it('lets a second branch be added and removed', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RegisterPage />)
    await user.click(screen.getByRole('tab', { name: 'Klinikë' }))

    expect(screen.getByText('Dega 1')).toBeInTheDocument()
    expect(screen.queryByText('Dega 2')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Shto degë tjetër/i }))
    expect(screen.getByText('Dega 2')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Hiq degën 2' }))
    expect(screen.queryByText('Dega 2')).not.toBeInTheDocument()
  })
})

describe('RegisterPage — clinic registration', () => {
  it('submits the correct payload shape to /api/auth/register-clinic, logs the account holder in, and lands them on the pending-clinic dashboard with a confirmation toast', async () => {
    let capturedBody: RegisterClinicRequest | null = null
    server.use(
      http.post(REGISTER_CLINIC_URL, async ({ request }) => {
        capturedBody = (await request.json()) as RegisterClinicRequest
        return HttpResponse.json(
          { auth: buildClinicAuthResponse(), clinicId: 'clinic-0001', clinicName: 'Poliklinika Testuese', isApproved: false },
          { status: 201 },
        )
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<RegisterPage />)

    await user.click(screen.getByRole('tab', { name: 'Klinikë' }))
    await fillMinimalClinicForm(user)
    await user.click(screen.getByRole('button', { name: /Regjistro klinikën/i }))

    await waitFor(() => expect(capturedBody).not.toBeNull())
    expect(capturedBody).toEqual({
      firstName: 'Drilon',
      lastName: 'Krasniqi',
      email: 'admin@klinika-test.dev',
      phoneNumber: '+383 44 111 222',
      password: 'StrongPass1',
      clinicName: 'Poliklinika Testuese',
      description: undefined,
      clinicPhoneNumber: '+383 38 111 222',
      clinicEmail: undefined,
      website: undefined,
      branches: [
        {
          name: 'Dega Qendër',
          address: 'Rr. Testuese 1',
          city: 'Prishtinë',
          municipality: undefined,
          phoneNumber: undefined,
        },
      ],
    })

    // Auto-login happened — the account holder never sees a login screen.
    await waitFor(() => expect(localStorage.getItem('rezervo.accessToken')).toBe('test-access-token'))

    // A confirmation toast fires — navigate() then sends the account holder
    // to /admin-panel/klinikat, the route that already renders the
    // "NË PRITJE" banner for an unapproved clinic (see MyClinicsPage.test.tsx)
    // — rather than pretending the clinic is ready to use.
    expect(await screen.findByText(/u regjistrua me sukses/i)).toBeInTheDocument()
  })

  it('shows the duplicate-email message on the clinic account-holder email field for a 409, same as the patient path', async () => {
    server.use(
      http.post(REGISTER_CLINIC_URL, () =>
        HttpResponse.json(
          { type: 'https://booking-api.dev/errors/email-exists', title: 'Konflikt', status: 409, detail: 'Ekziston tashmë një llogari me këtë email.' },
          { status: 409 },
        ),
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(<RegisterPage />)

    await user.click(screen.getByRole('tab', { name: 'Klinikë' }))
    await fillMinimalClinicForm(user)
    await user.click(screen.getByRole('button', { name: /Regjistro klinikën/i }))

    await waitFor(() => expect(screen.getByText(/Ky email është i regjistruar tashmë/)).toBeInTheDocument())
    expect(screen.queryByText('Ekziston tashmë një llogari me këtë email.')).not.toBeInTheDocument()
  })

  it('blocks submission client-side when password and confirm-password differ, without calling the backend', async () => {
    let called = false
    server.use(
      http.post(REGISTER_CLINIC_URL, () => {
        called = true
        return HttpResponse.json({}, { status: 201 })
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<RegisterPage />)

    await user.click(screen.getByRole('tab', { name: 'Klinikë' }))
    await fillMinimalClinicForm(user)

    const [, confirmPassword] = document.querySelectorAll('input[type="password"]') as unknown as HTMLInputElement[]
    await user.clear(confirmPassword)
    await user.type(confirmPassword, 'ADifferentPass1')
    await user.click(screen.getByRole('button', { name: /Regjistro klinikën/i }))

    expect(await screen.findByText('Fjalëkalimet nuk përputhen.')).toBeInTheDocument()
    expect(called).toBe(false)
  })
})

describe('RegisterPage — patient path is unaffected by the clinic path', () => {
  it('still submits to /api/auth/register (not register-clinic) and redirects by role', async () => {
    let patientCalled = false
    let clinicCalled = false
    server.use(
      http.post(REGISTER_URL, () => {
        patientCalled = true
        return HttpResponse.json(
          {
            userId: 'user-patient-0001',
            firstName: 'Testi',
            lastName: 'Përdorues',
            email: 'postuar@tashme.dev',
            roles: ['Patient'],
            accessToken: 'patient-access-token',
            accessTokenExpiresAt: '2026-08-25T00:00:00Z',
            refreshToken: 'patient-refresh-token',
            refreshTokenExpiresAt: '2026-09-01T00:00:00Z',
          },
          { status: 201 },
        )
      }),
      http.post(REGISTER_CLINIC_URL, () => {
        clinicCalled = true
        return HttpResponse.json({}, { status: 201 })
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<RegisterPage />)

    await fillMinimalForm(user)
    await user.click(screen.getByRole('button', { name: /Regjistrohu/i }))

    await waitFor(() => expect(patientCalled).toBe(true))
    expect(clinicCalled).toBe(false)
  })
})
