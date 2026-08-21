import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '../test/render'
import { LANGUAGE_STORAGE_KEY } from '../i18n'
import UserMenu from './UserMenu'
import Footer from './Footer'

describe('LanguageSwitcher — UserMenu (logged-in)', () => {
  it('changes rendered output when a language is selected, and closes the panel', async () => {
    const user = userEvent.setup()
    renderWithProviders(<UserMenu />, { user: 'Patient' })

    await user.click(screen.getByRole('button', { name: 'Menuja e llogarisë' }))
    expect(screen.getByText('Dil')).toBeInTheDocument()

    await user.click(screen.getByRole('menuitemradio', { name: 'English' }))

    // Selecting closes the panel immediately (same as any other item), so the
    // "Log out" text it contains is gone from the DOM along with it — the
    // trigger's own label is what proves the language actually changed.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Account menu' })).toBeInTheDocument())
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Account menu' }))
    expect(screen.getByText('Log out')).toBeInTheDocument()
  })

  it('marks the active language with aria-checked, and updates it on selection', async () => {
    const user = userEvent.setup()
    renderWithProviders(<UserMenu />, { user: 'Patient' })

    await user.click(screen.getByRole('button', { name: 'Menuja e llogarisë' }))
    expect(screen.getByRole('menuitemradio', { name: 'Shqip' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('menuitemradio', { name: 'English' })).toHaveAttribute('aria-checked', 'false')

    await user.click(screen.getByRole('menuitemradio', { name: 'English' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Account menu' })).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Account menu' }))
    expect(screen.getByRole('menuitemradio', { name: 'English' })).toHaveAttribute('aria-checked', 'true')
  })

  it('updates <html lang> when a language is selected', async () => {
    const user = userEvent.setup()
    renderWithProviders(<UserMenu />, { user: 'Patient' })

    await user.click(screen.getByRole('button', { name: 'Menuja e llogarisë' }))
    await user.click(screen.getByRole('menuitemradio', { name: 'English' }))

    await waitFor(() => expect(document.documentElement.getAttribute('lang')).toBe('en'))
  })

  it('persists the choice to localStorage, surviving a remount', async () => {
    const user = userEvent.setup()
    const { unmount } = renderWithProviders(<UserMenu />, { user: 'Patient' })

    await user.click(screen.getByRole('button', { name: 'Menuja e llogarisë' }))
    await user.click(screen.getByRole('menuitemradio', { name: 'English' }))
    await waitFor(() => expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en'))

    unmount()

    renderWithProviders(<UserMenu />, { user: 'Patient' })
    await user.click(screen.getByRole('button', { name: 'Account menu' }))
    expect(screen.getByText('Log out')).toBeInTheDocument()
    expect(screen.getByRole('menuitemradio', { name: 'English' })).toHaveAttribute('aria-checked', 'true')
  })
})

describe('LanguageSwitcher — Footer (logged-out)', () => {
  it('changes rendered output for a logged-out visitor, with no user menu present', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Footer />)

    expect(screen.queryByRole('button', { name: 'Menuja e llogarisë' })).not.toBeInTheDocument()
    expect(screen.getByText('Hyr')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'English', pressed: false }))

    await waitFor(() => expect(screen.getByText('Log in')).toBeInTheDocument())
    expect(document.documentElement.getAttribute('lang')).toBe('en')
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en')
  })
})
