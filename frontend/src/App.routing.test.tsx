import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import App from './App'
import { renderWithProviders } from './test/render'
import { server } from './test/server'
import { API_BASE_URL } from './test/api-base'

function mockLogin(roles: string[]) {
  server.use(
    http.post(`${API_BASE_URL}/api/auth/login`, () =>
      HttpResponse.json({
        userId: 'user-1',
        firstName: 'Testi',
        lastName: 'Perdoruesi',
        email: 'test@booking.dev',
        roles,
        accessToken: 'token',
        accessTokenExpiresAt: '2099-01-01T00:00:00Z',
        refreshToken: 'refresh',
        refreshTokenExpiresAt: '2099-01-01T00:00:00Z',
      }),
    ),
  )
}

async function login() {
  const user = userEvent.setup()
  await user.type(screen.getByPlaceholderText('emri@shembull.com'), 'test@booking.dev')
  await user.type(screen.getByPlaceholderText('••••••••'), 'Parola123!')
  await user.click(screen.getByRole('button', { name: /Hyni në llogari/i }))
}

describe('post-login redirect lands on the correct portal home (3d)', () => {
  it('Patient → /terminet', async () => {
    mockLogin(['Patient'])
    renderWithProviders(<App />, { route: '/hyr' })
    await login()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Terminet e mia' })).toBeInTheDocument())
  })

  it('Doctor → /mjeku-panel/kalendari', async () => {
    mockLogin(['Doctor'])
    renderWithProviders(<App />, { route: '/hyr' })
    await login()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Kalendari im' })).toBeInTheDocument())
  })

  it('ClinicAdmin → /admin-panel/klinikat', async () => {
    mockLogin(['ClinicAdmin'])
    renderWithProviders(<App />, { route: '/hyr' })
    await login()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Klinikat e mia' })).toBeInTheDocument())
  })

  it('SuperAdmin → /super-admin/klinikat', async () => {
    mockLogin(['SuperAdmin'])
    renderWithProviders(<App />, { route: '/hyr' })
    await login()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Menaxhimi i Klinikave' })).toBeInTheDocument())
  })
})

describe('cross-portal access is redirected to the user\'s own portal home, not / or a blank screen (3d)', () => {
  it('a Doctor visiting a Patient-only route is sent to their own portal home', async () => {
    renderWithProviders(<App />, { route: '/terminet', user: 'Doctor' })
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Kalendari im' })).toBeInTheDocument())
    expect(screen.queryByRole('heading', { name: 'Terminet e mia' })).not.toBeInTheDocument()
  })

  it('a Patient visiting a ClinicAdmin-only route is sent to their own portal home', async () => {
    renderWithProviders(<App />, { route: '/admin-panel/klinikat', user: 'Patient' })
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Terminet e mia' })).toBeInTheDocument())
  })

  it('a ClinicAdmin visiting a SuperAdmin-only route is sent to their own portal home', async () => {
    renderWithProviders(<App />, { route: '/super-admin/klinikat', user: 'ClinicAdmin' })
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Klinikat e mia' })).toBeInTheDocument())
  })
})

describe('unauthenticated access to a protected route redirects to /hyr (3d)', () => {
  it('visiting /terminet while logged out lands on the login page', async () => {
    renderWithProviders(<App />, { route: '/terminet' })
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Mirë se vini' })).toBeInTheDocument())
  })

  it('visiting /mjeku-panel/kalendari while logged out lands on the login page', async () => {
    renderWithProviders(<App />, { route: '/mjeku-panel/kalendari' })
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Mirë se vini' })).toBeInTheDocument())
  })
})
