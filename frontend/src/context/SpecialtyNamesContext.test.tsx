import { render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { SpecialtyNamesProvider, useSpecialtyLabel } from './SpecialtyNamesContext'
import { server } from '../test/server'
import { API_BASE_URL } from '../test/api-base'

const SPECIALTIES_URL = `${API_BASE_URL}/api/specialties`

/** Rendon një emër specializimi përmes hook-ut, që testi të shohë rezultatin. */
function Label({ name }: { name: string }) {
  const specialtyLabel = useSpecialtyLabel()
  return <span data-testid="label">{specialtyLabel(name)}</span>
}

function renderLabel(name: string) {
  return render(
    <SpecialtyNamesProvider>
      <Label name={name} />
    </SpecialtyNamesProvider>,
  )
}

const FULL = {
  id: 's-1',
  name: 'Dermatologji',
  nameEn: 'Dermatology',
  nameSr: 'Dermatologija',
  isActive: true,
}
/** Specializim i shtuar nga SuperAdmin pa përkthime — rasti i fallback-ut. */
const UNTRANSLATED = { id: 's-2', name: 'Nefrologji', nameEn: null, nameSr: null, isActive: true }

describe('useSpecialtyLabel — përkthimi vjen nga baza, me fallback te emri shqip', () => {
  it('shows the English name when the language is English', async () => {
    await i18n.changeLanguage('en')
    server.use(http.get(SPECIALTIES_URL, () => HttpResponse.json([FULL])))
    renderLabel('Dermatologji')

    await waitFor(() => expect(screen.getByTestId('label')).toHaveTextContent('Dermatology'))
  })

  it('shows the Serbian name when the language is Serbian', async () => {
    await i18n.changeLanguage('sr')
    server.use(http.get(SPECIALTIES_URL, () => HttpResponse.json([FULL])))
    renderLabel('Dermatologji')

    await waitFor(() => expect(screen.getByTestId('label')).toHaveTextContent('Dermatologija'))
  })

  it('keeps the canonical Albanian name when the language is Albanian', async () => {
    await i18n.changeLanguage('sq')
    server.use(http.get(SPECIALTIES_URL, () => HttpResponse.json([FULL])))
    renderLabel('Dermatologji')

    await waitFor(() => expect(screen.getByTestId('label')).toHaveTextContent('Dermatologji'))
  })

  it('falls back to the Albanian name when a translation is missing', async () => {
    // Pika kryesore: një specializim i shtuar më vonë nga admin-i pa përkthime
    // s'duhet të shfaqet kurrë bosh apo si çelës i papërpunuar.
    await i18n.changeLanguage('en')
    server.use(http.get(SPECIALTIES_URL, () => HttpResponse.json([UNTRANSLATED])))
    renderLabel('Nefrologji')

    await waitFor(() => expect(screen.getByTestId('label')).toHaveTextContent('Nefrologji'))
  })

  it('falls back to the given name for a specialty the API does not know', async () => {
    await i18n.changeLanguage('en')
    server.use(http.get(SPECIALTIES_URL, () => HttpResponse.json([FULL])))
    renderLabel('Specializim i panjohur')

    await waitFor(() =>
      expect(screen.getByTestId('label')).toHaveTextContent('Specializim i panjohur'),
    )
  })

  it('falls back to the given name when the specialties request fails', async () => {
    await i18n.changeLanguage('en')
    server.use(http.get(SPECIALTIES_URL, () => HttpResponse.error()))
    renderLabel('Dermatologji')

    await waitFor(() => expect(screen.getByTestId('label')).toHaveTextContent('Dermatologji'))
  })

  it('treats a blank translation as missing rather than rendering an empty label', async () => {
    await i18n.changeLanguage('en')
    server.use(
      http.get(SPECIALTIES_URL, () =>
        HttpResponse.json([{ ...FULL, nameEn: '   ' }]),
      ),
    )
    renderLabel('Dermatologji')

    await waitFor(() => expect(screen.getByTestId('label')).toHaveTextContent('Dermatologji'))
  })
})
