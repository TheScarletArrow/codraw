import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { setThemeChoice, THEME_KEY } from './theme.ts'
import { ThemeMenu } from './ThemeMenu.tsx'

const dark = () => document.documentElement.classList.contains('dark')

describe('ThemeMenu', () => {
  afterEach(() => setThemeChoice('system'))

  it('follows the system until the user chooses a theme', async () => {
    render(<ThemeMenu />)

    await userEvent.click(screen.getByRole('button', { name: 'Тема: Как в системе' }))

    const menu = screen.getByRole('dialog', { name: 'Тема' })
    const themes = within(menu).getByRole('group', { name: 'Тема' })
    const values = within(themes).getAllByRole('radio').map((radio) => radio.getAttribute('value'))
    expect(values).toEqual(['system', 'light', 'dark'])
    // A phone has no room for «Язык» in the header: the languages are here too.
    expect(within(menu).getByRole('group', { name: 'Язык' })).toBeInTheDocument()
    expect(within(menu).getByRole('radio', { name: 'Как в системе' })).toBeChecked()
  })

  it('applies the chosen theme at once and remembers it in the browser', async () => {
    render(<ThemeMenu />)
    await userEvent.click(screen.getByRole('button', { name: 'Тема: Как в системе' }))

    await userEvent.click(screen.getByRole('radio', { name: 'Тёмная' }))

    expect(dark()).toBe(true)
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')
    expect(screen.getByRole('radio', { name: 'Тёмная' })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Тема: Тёмная' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('radio', { name: 'Светлая' }))

    expect(dark()).toBe(false)
    expect(localStorage.getItem(THEME_KEY)).toBe('light')

    await userEvent.click(screen.getByRole('radio', { name: 'Как в системе' }))

    expect(localStorage.getItem(THEME_KEY)).toBeNull()
  })

  it('shows the theme remembered in the browser', () => {
    localStorage.setItem(THEME_KEY, 'light')

    render(<ThemeMenu />)

    expect(screen.getByRole('button', { name: 'Тема: Светлая' })).toBeInTheDocument()
  })
})
