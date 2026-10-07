import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import themeScript from '../../public/theme.js?raw'
import { currentTheme, installTheme, readThemeChoice, resolveTheme, setThemeChoice, THEME_KEY } from './theme.ts'

/** A system whose color scheme the test switches, as `matchMedia` reports it. */
function stubSystem(dark: boolean) {
  const listeners = new Set<() => void>()
  const query = {
    get matches() {
      return dark
    },
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  }
  vi.stubGlobal('matchMedia', (media: string) => {
    expect(media).toBe('(prefers-color-scheme: dark)')
    return query
  })
  return {
    switchTo(next: boolean) {
      dark = next
      listeners.forEach((listener) => listener())
    },
  }
}

const dark = () => document.documentElement.classList.contains('dark')

describe('theme', () => {
  let uninstall = () => {}
  beforeEach(() => document.documentElement.classList.remove('dark'))
  afterEach(() => {
    uninstall()
    uninstall = () => {}
    setThemeChoice('system')
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    document.documentElement.classList.remove('dark')
  })

  it('shows the scheme of the system for «Как в системе» and the chosen theme otherwise', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('follows the system until a theme is chosen', () => {
    stubSystem(true)

    expect(readThemeChoice()).toBe('system')
    expect(currentTheme()).toBe('dark')
  })

  it('remembers the choice in the browser and forgets it for «Как в системе»', () => {
    stubSystem(false)

    setThemeChoice('dark')
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')
    expect(dark()).toBe(true)

    setThemeChoice('light')
    expect(localStorage.getItem(THEME_KEY)).toBe('light')
    expect(dark()).toBe(false)

    setThemeChoice('system')
    expect(localStorage.getItem(THEME_KEY)).toBeNull()
    expect(readThemeChoice()).toBe('system')
  })

  it('takes an unknown stored value for «Как в системе»', () => {
    localStorage.setItem(THEME_KEY, 'sepia')

    expect(readThemeChoice()).toBe('system')
  })

  it('applies the stored theme when installed and follows the system while the choice is «Как в системе»', () => {
    const system = stubSystem(false)
    uninstall = installTheme()
    expect(dark()).toBe(false)

    system.switchTo(true)
    expect(dark()).toBe(true)

    setThemeChoice('light')
    system.switchTo(true)
    expect(dark()).toBe(false)
  })

  it('follows a choice made in another tab', () => {
    stubSystem(false)
    uninstall = installTheme()

    localStorage.setItem(THEME_KEY, 'dark')
    window.dispatchEvent(new StorageEvent('storage', { key: THEME_KEY, newValue: 'dark' }))

    expect(dark()).toBe(true)
  })

  it('keeps the choice in the page when the browser keeps no data for the site', () => {
    stubSystem(false)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })

    setThemeChoice('dark')

    expect(readThemeChoice()).toBe('dark')
    expect(dark()).toBe(true)
  })
})

describe('the script that applies the theme before the first paint', () => {
  const run = () => new Function(themeScript)()
  beforeEach(() => document.documentElement.classList.remove('dark'))
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    document.documentElement.classList.remove('dark')
  })

  it('reads the key of the app', () => {
    expect(themeScript).toContain(`'${THEME_KEY}'`)
  })

  it('applies the chosen theme whatever the system', () => {
    stubSystem(true)
    localStorage.setItem(THEME_KEY, 'light')
    run()
    expect(dark()).toBe(false)

    stubSystem(false)
    localStorage.setItem(THEME_KEY, 'dark')
    run()
    expect(dark()).toBe(true)
  })

  it('follows the system without a choice, as the app does', () => {
    stubSystem(true)
    run()
    expect(dark()).toBe(currentTheme() === 'dark')
    expect(dark()).toBe(true)
  })

  it('stays light without matchMedia or storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    run()
    expect(dark()).toBe(false)
  })
})
