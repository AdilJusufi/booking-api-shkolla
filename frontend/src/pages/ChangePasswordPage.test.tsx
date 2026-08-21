import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '../test/render'
import { server } from '../test/server'
import { API_BASE_URL } from '../test/api-base'
import ChangePasswordPage from './ChangePasswordPage'

const CHANGE_PASSWORD_URL = `${API_BASE_URL}/api/auth/change-password`

async function fillForm(user: ReturnType<typeof userEvent.setup>, current: string, next: string) {
  const passwordInputs = document.querySelectorAll('input[type="password"]')
  await user.type(passwordInputs[0], current)
  await user.type(passwordInputs[1], next)
  await user.type(passwordInputs[2], next)
}

describe('ChangePasswordPage — wrong current password (422 PasswordMismatch)', () => {
  it('shows the wrong-current-password message inline under the current-password field, not the raw Identity error code/description', async () => {
    server.use(
      http.post(CHANGE_PASSWORD_URL, () =>
        HttpResponse.json(
          {
            type: 'https://booking-api.dev/errors/validation',
            title: 'Validimi dështoi',
            status: 422,
            detail: 'Një ose më shumë fusha janë të pavlefshme.',
            errors: { PasswordMismatch: ['Incorrect password.'] },
          },
          { status: 422 },
        ),
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(<ChangePasswordPage />, { user: 'Patient' })

    await fillForm(user, 'WrongCurrent1', 'BrandNewPass1')
    await user.click(screen.getByRole('button', { name: /Ndrysho Fjalëkalimin/i }))

    await waitFor(() => expect(screen.getByText('Fjalëkalimi aktual është i gabuar.')).toBeInTheDocument())
    expect(screen.queryByText('Incorrect password.')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('falls back to a form-level message for a 422 that is not the PasswordMismatch code', async () => {
    server.use(
      http.post(CHANGE_PASSWORD_URL, () =>
        HttpResponse.json(
          {
            type: 'https://booking-api.dev/errors/validation',
            title: 'Validimi dështoi',
            status: 422,
            detail: 'Një ose më shumë fusha janë të pavlefshme.',
            errors: { PasswordRequiresUniqueChars: ['Passwords must use at least 1 different characters.'] },
          },
          { status: 422 },
        ),
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(<ChangePasswordPage />, { user: 'Patient' })

    await fillForm(user, 'CurrentPass1', 'BrandNewPass1')
    await user.click(screen.getByRole('button', { name: /Ndrysho Fjalëkalimin/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.queryByText('Fjalëkalimi aktual është i gabuar.')).not.toBeInTheDocument()
    expect(screen.queryByText('Passwords must use at least 1 different characters.')).not.toBeInTheDocument()
  })
})
