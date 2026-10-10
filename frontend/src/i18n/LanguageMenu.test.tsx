import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LOCALE_KEY } from './i18n.ts'
import { LanguageMenu } from './LanguageMenu.tsx'

describe('LanguageMenu', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('offers the languages by their own names', async () => {
    render(<LanguageMenu />)

    await userEvent.click(screen.getByRole('button', { name: 'Язык: Русский' }))

    const menu = screen.getByRole('dialog', { name: 'Язык' })
    expect(within(menu).getByRole('radio', { name: 'Русский' })).toBeChecked()
    expect(within(menu).getByRole('radio', { name: 'English' })).not.toBeChecked()
  })

  it('remembers the chosen language and reloads the page in it', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    render(<LanguageMenu />)
    await userEvent.click(screen.getByRole('button', { name: 'Язык: Русский' }))

    await userEvent.click(screen.getByRole('radio', { name: 'English' }))

    expect(localStorage.getItem(LOCALE_KEY)).toBe('en')
    expect(reload).toHaveBeenCalled()
    expect(document.documentElement.lang).toBe('en')
  })
})
