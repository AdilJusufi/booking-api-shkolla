import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '../test/render'
import { server } from '../test/server'
import { API_BASE_URL } from '../test/api-base'
import RegisterPage from './RegisterPage'

const REGISTER_URL = `${API_BASE_URL}/api/auth/register`

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
