import { useSyncExternalStore } from 'react'
import { themeMessages } from './messages.ts'

/** What the user chose in «Тема»: the theme of the system, or a theme of their own. */
export type ThemeChoice = 'system' | 'light' | 'dark'

/** The theme the app shows. */
export type Theme = 'light' | 'dark'

/**
 * The choice of this browser, `light` or `dark`; without one the app follows the system. `public/theme.js` reads it
 * before the first paint.
 */
export const THEME_KEY = 'codraw.theme'

/** The class of `<html>` that turns the dark theme on; `public/theme.js` sets it before the first paint. */
export const DARK_CLASS = 'dark'

const SYSTEM_DARK = '(prefers-color-scheme: dark)'

/** The options of «Тема» in the order of the menu. */
export const THEME_CHOICES: readonly ThemeChoice[] = ['system', 'light', 'dark']

/** The theme to show for a choice: «Как в системе» shows the scheme of the system. */
export function resolveTheme(choice: ThemeChoice, systemDark: boolean): Theme {
  if (choice === 'system') return systemDark ? 'dark' : 'light'
  return choice
}

/** The name of a choice in «Тема», e.g. «Светлая». */
export const themeChoiceLabel = (choice: ThemeChoice): string => themeMessages[choice]

/** The choice made in this page when the browser keeps no data for the site; it holds until the page is reloaded. */
let unstoredChoice: ThemeChoice | null = null

/** The choice of this browser; a browser that keeps no data for the site follows the system. */
export function readThemeChoice(): ThemeChoice {
  if (unstoredChoice) return unstoredChoice
  try {
    const stored = localStorage.getItem(THEME_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    return 'system'
  }
}

function systemQuery(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(SYSTEM_DARK) : null
}

/** The theme the app shows now. */
export function currentTheme(): Theme {
  return resolveTheme(readThemeChoice(), systemQuery()?.matches ?? false)
}

const listeners = new Set<() => void>()

/** Shows the current theme on `<html>` and tells the subscribers. */
function update() {
  document.documentElement.classList.toggle(DARK_CLASS, currentTheme() === 'dark')
  listeners.forEach((listener) => listener())
}

/** Applies and remembers a choice of «Тема» in this browser. */
export function setThemeChoice(choice: ThemeChoice) {
  try {
    if (choice === 'system') localStorage.removeItem(THEME_KEY)
    else localStorage.setItem(THEME_KEY, choice)
    unstoredChoice = null
  } catch {
    unstoredChoice = choice
  }
  update()
}

/**
 * Keeps `<html>` in the theme of this browser for the life of the page: applies it now (`public/theme.js` has applied it
 * before the first paint already), follows the system while the choice is «Как в системе», and follows a choice made in
 * another tab. Returns a function that stops it.
 */
export function installTheme(): () => void {
  update()
  const query = systemQuery()
  const handleStorage = (event: StorageEvent) => {
    // No key: another tab cleared the data of the site.
    if (event.key === THEME_KEY || event.key === null) update()
  }
  query?.addEventListener('change', update)
  window.addEventListener('storage', handleStorage)
  return () => {
    query?.removeEventListener('change', update)
    window.removeEventListener('storage', handleStorage)
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The choice of «Тема» in this browser. */
export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(subscribe, readThemeChoice)
}

/** The theme the app shows: the choice, or the scheme of the system for «Как в системе». */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, currentTheme)
}
