import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '../test/render'
import { server } from '../test/server'
import { API_BASE_URL } from '../test/api-base'
import ForgotPasswordPage from './ForgotPasswordPage'

const FORGOT_URL = `${API_BASE_URL}/api/auth/forgot-password`

describe('ForgotPasswordPage — network failure must not be presented as success', () => {
  it('shows the offline message and does NOT advance to the "check your email" screen when the request fails to reach the server', async () => {
    server.use(http.post(FORGOT_URL, () => HttpResponse.error()))
    const user = userEvent.setup()
    renderWithProviders(<ForgotPasswordPage />)

    await user.type(screen.getByPlaceholderText('emri@shembull.com'), 'test@booking.dev')
    await user.click(screen.getByRole('button', { name: /Dërgoni udhëzimet/i }))

    await waitFor(() =>
      expect(screen.getByText('Nuk u lidhëm me serverin. Kontrolloni internetin dhe provoni përsëri.')).toBeInTheDocument(),
    )
    // Must not have silently claimed success on a network failure.
    expect(screen.queryByText('Kontrolloni emailin tuaj')).not.toBeInTheDocument()
  })
})
