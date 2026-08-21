import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '../test/render'
import { server } from '../test/server'
import { API_BASE_URL } from '../test/api-base'
import ResetPasswordPage from './ResetPasswordPage'

const RESET_URL = `${API_BASE_URL}/api/auth/reset-password`
const ROUTE = '/rivendos-fjalekalimin?token=abc123&email=test%40booking.dev'

describe('ResetPasswordPage — invalid/expired token', () => {
  it('shows the expired-link state on a 401 (the actual status AuthService.ResetPasswordAsync throws), with a CTA to /harrova-fjalekalimin', async () => {
    server.use(
      http.post(RESET_URL, () =>
        HttpResponse.json(
          { type: 'https://booking-api.dev/errors/authentication-failed', title: 'Autentifikimi dështoi', status: 401, detail: 'Tokeni i rivendosjes është i pavlefshëm.' },
          { status: 401 },
        ),
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(<ResetPasswordPage />, { route: ROUTE, path: '/rivendos-fjalekalimin' })

    await user.type(screen.getByPlaceholderText('Shkruani fjalëkalimin e ri'), 'BrandNewPass1')
    await user.type(screen.getByPlaceholderText('Përsërisni fjalëkalimin'), 'BrandNewPass1')
    await user.click(screen.getByRole('button', { name: /Rivendos fjalëkalimin/i }))

    await waitFor(() => expect(screen.getByText(/Ky link ka skaduar ose është i pavlefshëm/)).toBeInTheDocument())
    // Raw backend detail never rendered.
    expect(screen.queryByText('Tokeni i rivendosjes është i pavlefshëm.')).not.toBeInTheDocument()
    const cta = screen.getByRole('link', { name: /Kërkoni link të ri/i })
    expect(cta).toHaveAttribute('href', '/harrova-fjalekalimin')
  })
})
