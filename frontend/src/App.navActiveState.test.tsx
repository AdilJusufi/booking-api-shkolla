import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'
import { renderWithProviders } from './test/render'

describe('nav active state — exactly one item active, even on prefix-nested routes (3e)', () => {
  it('PatientLayout: /llogaria/anetaret activates only Familja, not Profili — a prefix-nested regression', async () => {
    renderWithProviders(<App />, { route: '/llogaria/anetaret', user: 'Patient' })

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Anëtarët e Familjes' })).toBeInTheDocument())

    const sidebar = document.querySelector('.patient-sidebar') as HTMLElement
    const sidebarActive = sidebar.querySelectorAll('.patient-nav-item.is-active')
    expect(sidebarActive).toHaveLength(1)
    expect(sidebarActive[0]).toHaveTextContent('Familja')

    const tabbar = document.querySelector('.patient-tabbar') as HTMLElement
    const tabbarActive = tabbar.querySelectorAll('.patient-tabbar__item.is-active')
    expect(tabbarActive).toHaveLength(1)
    expect(tabbarActive[0]).toHaveTextContent('Familja')
  })

  it('PatientLayout: /llogaria activates only Profili', async () => {
    renderWithProviders(<App />, { route: '/llogaria', user: 'Patient' })

    await waitFor(() => expect(document.querySelector('.patient-sidebar')).toBeInTheDocument())

    const sidebar = document.querySelector('.patient-sidebar') as HTMLElement
    const sidebarActive = sidebar.querySelectorAll('.patient-nav-item.is-active')
    expect(sidebarActive).toHaveLength(1)
    expect(sidebarActive[0]).toHaveTextContent('Profili')
  })

  it('DoctorLayout: exactly one nav item is active on /mjeku-panel/orari', async () => {
    renderWithProviders(<App />, { route: '/mjeku-panel/orari', user: 'Doctor' })

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Orari i punës' })).toBeInTheDocument())

    const sidebar = document.querySelector('.patient-sidebar') as HTMLElement
    const active = sidebar.querySelectorAll('.patient-nav-item.is-active')
    expect(active).toHaveLength(1)
    expect(active[0]).toHaveTextContent('Orari')
  })

  it('SuperAdminLayout: exactly one nav item is active on /super-admin/specializimet', async () => {
    renderWithProviders(<App />, { route: '/super-admin/specializimet', user: 'SuperAdmin' })

    await waitFor(() => expect(document.querySelector('nav.clinic-tabs')).toBeInTheDocument())

    const nav = document.querySelector('nav.clinic-tabs') as HTMLElement
    const active = nav.querySelectorAll('.clinic-tab.is-active')
    expect(active).toHaveLength(1)
    expect(active[0]).toHaveTextContent('Specializimet')
  })
})
