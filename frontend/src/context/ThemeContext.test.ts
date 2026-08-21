import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ThemeProvider, useTheme } from './ThemeContext'

const STORAGE_KEY = 'rezervo.theme'

afterEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('ThemeContext', () => {
  it('reads stored theme from localStorage on mount', () => {
    localStorage.setItem(STORAGE_KEY, 'light')
    const { result } = renderHook(useTheme, { wrapper: ThemeProvider })
    expect(result.current.theme).toBe('light')
  })

  it('applies data-theme attribute to the root element', () => {
    localStorage.setItem(STORAGE_KEY, 'dark')
    renderHook(useTheme, { wrapper: ThemeProvider })
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('toggleTheme switches dark → light and updates localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 'dark')
    const { result } = renderHook(useTheme, { wrapper: ThemeProvider })

    act(() => { result.current.toggleTheme() })

    expect(result.current.theme).toBe('light')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('toggleTheme switches light → dark and updates localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 'light')
    const { result } = renderHook(useTheme, { wrapper: ThemeProvider })

    act(() => { result.current.toggleTheme() })

    expect(result.current.theme).toBe('dark')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('persists theme across consecutive toggles', () => {
    localStorage.setItem(STORAGE_KEY, 'light')
    const { result } = renderHook(useTheme, { wrapper: ThemeProvider })

    act(() => { result.current.toggleTheme() }) // light → dark
    act(() => { result.current.toggleTheme() }) // dark → light

    expect(result.current.theme).toBe('light')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light')
  })
})
