import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../test/render'
import { server } from '../test/server'
import { API_BASE_URL } from '../test/api-base'
import LoginPage from './LoginPage'

const LOGIN_URL = `${API_BASE_URL}/api/auth/login`

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>, email = 'pacienti@test.dev', password = 'wrong-password') {
  await user.type(screen.getByPlaceholderText('emri@shembull.com'), email)
  await user.type(screen.getByPlaceholderText('••••••••'), password)
  await user.click(screen.getByRole('button', { name: /Hyni në llogari/i }))
}

describe('LoginPage — auth error handling', () => {
  it('renders a plain 401 as the generic credential message, form-level (not on a field)', async () => {
    server.use(
      http.post(LOGIN_URL, () =>
        HttpResponse.json(
          { type: 'https://booking-api.dev/errors/authentication-failed', title: 'Autentifikimi dështoi', status: 401, detail: 'Kredencialet janë të pavlefshme.' },
          { status: 401 },
        ),
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(<LoginPage />)
    await fillAndSubmit(user)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Email ose fjalëkalim i pasaktë.')
    // Never leak the raw backend detail text.
    expect(screen.queryByText('Kredencialet janë të pavlefshme.')).not.toBeInTheDocument()
    // Not a field-level error: neither input carries its own error span.
    expect(document.querySelectorAll('.field__error')).toHaveLength(0)
  })

  it('renders the lockout 401 as a distinct message from the wrong-password 401', async () => {
    server.use(
      http.post(LOGIN_URL, () =>
        HttpResponse.json(
          {
            type: 'https://booking-api.dev/errors/authentication-failed',
            title: 'Autentifikimi dështoi',
            status: 401,
            detail: 'Llogaria është bllokuar përkohësisht nga tentimet e dështuara. Provo më vonë.',
          },
          { status: 401 },
        ),
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(<LoginPage />)
    await fillAndSubmit(user)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Llogaria është bllokuar përkohësisht pas shumë përpjekjeve. Provoni përsëri pas 15 minutash.')
    expect(alert).not.toHaveTextContent('Email ose fjalëkalim i pasaktë.')
  })

  it('renders the unconfirmed-email 401 with its own distinct message', async () => {
    server.use(
      http.post(LOGIN_URL, () =>
        HttpResponse.json(
          {
            type: 'https://booking-api.dev/errors/authentication-failed',
            title: 'Autentifikimi dështoi',
            status: 401,
            detail: 'Email-i nuk është konfirmuar ende. Kontrollo postën tënde.',
          },
          { status: 401 },
        ),
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(<LoginPage />)
    await fillAndSubmit(user)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Ju lutem konfirmoni emailin tuaj përpara se të hyni. Kontrolloni dosjen e spam-it.')
  })

  it('disables the submit button on a 429 and re-enables it after the cooldown', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    server.use(http.post(LOGIN_URL, () => new HttpResponse(null, { status: 429 })))
    const user = userEvent.setup()
    renderWithProviders(<LoginPage />)
    await fillAndSubmit(user)

    const button = await screen.findByRole('button', { name: /Provoni përsëri \(60s\)/i })
    expect(button).toBeDisabled()

    await act(async () => {
      vi.advanceTimersByTime(60_000)
    })

    await waitFor(() => expect(screen.getByRole('button', { name: /Hyni në llogari/i })).not.toBeDisabled())
    vi.useRealTimers()
  })
})
