import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '../test/render'
import { server } from '../test/server'
import { API_BASE_URL } from '../test/api-base'
import { buildWorkingSchedule } from '../test/fixtures'
import WorkingSchedulePage from './WorkingSchedulePage'

// Backend DayOfWeek is System.DayOfWeek (Sunday=0 … Saturday=6). Page groups
// Monday-first. One schedule per day, distinguished by slot duration.
const SCHEDULES = [
  { dayOfWeek: 0, expectedHeading: 'E Diel', slotDurationMinutes: 10 },
  { dayOfWeek: 1, expectedHeading: 'E Hënë', slotDurationMinutes: 11 },
  { dayOfWeek: 2, expectedHeading: 'E Martë', slotDurationMinutes: 12 },
  { dayOfWeek: 3, expectedHeading: 'E Mërkurë', slotDurationMinutes: 13 },
  { dayOfWeek: 4, expectedHeading: 'E Enjte', slotDurationMinutes: 14 },
  { dayOfWeek: 5, expectedHeading: 'E Premte', slotDurationMinutes: 15 },
  { dayOfWeek: 6, expectedHeading: 'E Shtunë', slotDurationMinutes: 16 },
]

describe('WorkingSchedulePage — day grouping contract (3a)', () => {
  it('groups each schedule under its correct Albanian weekday heading, Monday-first', async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/doctor/working-schedules`, () =>
        HttpResponse.json(
          SCHEDULES.map((s) => buildWorkingSchedule({ dayOfWeek: s.dayOfWeek, slotDurationMinutes: s.slotDurationMinutes })),
        ),
      ),
    )
    renderWithProviders(<WorkingSchedulePage />, { user: 'Doctor' })

    await waitFor(() => expect(screen.getByText('E Hënë')).toBeInTheDocument())

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings).toEqual(['E Hënë', 'E Martë', 'E Mërkurë', 'E Enjte', 'E Premte', 'E Shtunë', 'E Diel'])

    for (const { expectedHeading, slotDurationMinutes } of SCHEDULES) {
      const heading = screen.getByRole('heading', { level: 2, name: expectedHeading })
      const group = heading.closest('.schedule-day-group')
      expect(group).not.toBeNull()
      expect(group).toHaveTextContent(`${slotDurationMinutes} min / termin`)
    }
  })

  it('renders the empty state, not blank space, when the doctor has no schedules', async () => {
    server.use(http.get(`${API_BASE_URL}/api/doctor/working-schedules`, () => HttpResponse.json([])))
    renderWithProviders(<WorkingSchedulePage />, { user: 'Doctor' })

    await waitFor(() => expect(screen.getByText('Nuk keni asnjë orar të shtuar ende.')).toBeInTheDocument())
  })
})
