import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../test/render'
import { server } from '../test/server'
import { API_BASE_URL } from '../test/api-base'
import ResendConfirmationPage from './ResendConfirmationPage'

const RESEND_URL = `${API_BASE_URL}/api/auth/resend-confirmation`

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText('emri@shembull.com'), 'test@booking.dev')
  await user.click(screen.getByRole('button', { name: /Ridërgo email-in/i }))
}

describe('ResendConfirmationPage — no enumeration, network failure, and rate limiting', () => {
  it('shows the same "check your email" screen on success, regardless of whether the address exists', async () => {
    server.use(http.post(RESEND_URL, () => new HttpResponse(null, { status: 204 })))
    const user = userEvent.setup()
    renderWithProviders(<ResendConfirmationPage />)
    await fillAndSubmit(user)

    await waitFor(() => expect(screen.getByText('Kontrolloni emailin tuaj')).toBeInTheDocument())
    expect(
      screen.getByText(
        'Nëse kjo adresë është e regjistruar dhe e pakonfirmuar, ju kemi dërguar një email të ri. Kontrolloni edhe dosjen e spam-it.',
      ),
    ).toBeInTheDocument()
  })

  it('shows the offline message and does NOT advance to the "check your email" screen when the request fails to reach the server', async () => {
    server.use(http.post(RESEND_URL, () => HttpResponse.error()))
    const user = userEvent.setup()
    renderWithProviders(<ResendConfirmationPage />)
    await fillAndSubmit(user)

    await waitFor(() =>
      expect(screen.getByText('Nuk u lidhëm me serverin. Kontrolloni internetin dhe provoni përsëri.')).toBeInTheDocument(),
    )
    expect(screen.queryByText('Kontrolloni emailin tuaj')).not.toBeInTheDocument()
  })

  it('disables the submit button on a 429 and shows the 5-minute cooldown, without implying whether the address exists', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    server.use(http.post(RESEND_URL, () => new HttpResponse(null, { status: 429 })))
    const user = userEvent.setup()
    renderWithProviders(<ResendConfirmationPage />)
    await fillAndSubmit(user)

    // "email-send" policy: 5-minute window, not the 60s "auth" default.
    const button = await screen.findByRole('button', { name: /Provoni përsëri \(300s\)/i })
    expect(button).toBeDisabled()

    // The error shown is the generic rate-limit message, never a per-address one.
    expect(screen.getByText('Keni bërë shumë kërkesa. Ju lutem prisni pak dhe provoni përsëri.')).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(300_000)
    })

    await waitFor(() => expect(screen.getByRole('button', { name: /Ridërgo email-in/i })).not.toBeDisabled())
    vi.useRealTimers()
  })
})
