import { useSyncExternalStore } from 'react'

/**
 * The languages of the interface. Russian comes first: it is the language of a browser that names neither, and of the
 * tests, which find elements by their Russian names.
 */
export const LOCALES = ['ru', 'en'] as const

export type Locale = (typeof LOCALES)[number]

/** Each language by its own name, as the switch in the menu of the user offers it. */
export const LOCALE_NAMES: Record<Locale, string> = { ru: 'Русский', en: 'English' }

/** The language chosen in this browser; without one the app follows the languages of the browser. */
export const LOCALE_KEY = 'codraw.locale'

const isLocale = (value: unknown): value is Locale => LOCALES.includes(value as Locale)

/**
 * The language for the languages of a browser, most preferred first: the first one CoDraw speaks, e.g. `en` for
 * `en-GB`, and Russian when it speaks none of them.
 */
export function localeOf(languages: readonly string[]): Locale {
  for (const language of languages) {
    const base = language.toLowerCase().split('-')[0]
    if (isLocale(base)) return base
  }
  return 'ru'
}

function storedLocale(): Locale | null {
  try {
    const stored = localStorage.getItem(LOCALE_KEY)
    return isLocale(stored) ? stored : null
  } catch {
    return null
  }
}

/** Tests speak Russian whatever the languages of the environment: they find elements by Russian names. */
function initialLocale(): Locale {
  if (import.meta.env.MODE === 'test') return 'ru'
  const languages = typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language])
  return storedLocale() ?? localeOf(languages)
}

let current: Locale = initialLocale()
const listeners = new Set<() => void>()
// `index.html` names Russian; the page speaks the language of the browser or of the choice.
if (typeof document !== 'undefined') document.documentElement.lang = current

/** The language of the interface now. */
export const locale = (): Locale => current

/** The tag of the language for `Intl`, e.g. for dates: `ru-RU` or `en-US`. */
export const intlLocale = (): string => (current === 'ru' ? 'ru-RU' : 'en-US')

/**
 * Switches the language of this page and tells the subscribers. Texts already computed, e.g. the names of the shapes of
 * the palette, keep the language they were made in: {@link chooseLocale} reloads the page for them.
 */
export function setLocale(next: Locale) {
  current = next
  if (typeof document !== 'undefined') document.documentElement.lang = next
  listeners.forEach((listener) => listener())
}

/** Remembers the choice of the menu of the user in this browser and shows the app in that language. */
export function chooseLocale(next: Locale) {
  try {
    localStorage.setItem(LOCALE_KEY, next)
  } catch {
    // A browser that keeps no data for the site keeps the language until the page is reloaded.
  }
  if (next === current) return
  setLocale(next)
  window.location.reload()
}

/** The language of the interface, for components that change with it. */
export function useLocale(): Locale {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    locale,
  )
}

/** A text of a dictionary: a string, a function of what it names (e.g. a count), or a group of such texts. */
type Text = string | ((...args: never[]) => unknown) | readonly Text[] | { readonly [key: string]: Text }

/** The English dictionary of the Russian one: the same keys, a string for each string and the same functions. */
export type Translation<T> = T extends string
  ? string
  : T extends (...args: infer A) => infer R
    ? (...args: A) => R
    : T extends readonly (infer E)[]
      ? readonly Translation<E>[]
      : { readonly [K in keyof T]: Translation<T[K]> }

export interface Dictionaries<T> {
  ru: T
  en: Translation<NoInfer<T>>
}

/** Every dictionary of the app, for the test that finds a text missing in one of the languages. */
export const dictionaries: Dictionaries<unknown>[] = []

/**
 * The texts of a part of the interface in both languages. The result reads the texts of the language of the moment of
 * reading: `messages.title` in a component or in a function gives the title in the language of the page.
 */
export function defineMessages<T extends { readonly [key: string]: Text }>(texts: Dictionaries<T>): T {
  dictionaries.push(texts as Dictionaries<unknown>)
  const now = () => texts[current] as object
  return new Proxy(texts.ru, {
    get: (_, key) => Reflect.get(now(), key),
    has: (_, key) => Reflect.has(now(), key),
    ownKeys: () => Reflect.ownKeys(now()),
    getOwnPropertyDescriptor: (_, key) => Reflect.getOwnPropertyDescriptor(now(), key),
  })
}

/** The Russian word for a count: `one` for 1, 21; `few` for 2–4, 22; `many` for 0, 5–20, 25. */
export function pluralRu(count: number, one: string, few: string, many: string): string {
  const tens = Math.abs(count) % 100
  const units = tens % 10
  if (!Number.isInteger(count)) return few
  if (tens >= 11 && tens <= 14) return many
  if (units === 1) return one
  if (units >= 2 && units <= 4) return few
  return many
}

/** The English word for a count: `one` for 1, `other` for any other. */
export const pluralEn = (count: number, one: string, other: string): string => (count === 1 ? one : other)

/**
 * A value made for the language of the moment, e.g. an `Intl.DateTimeFormat`, made once per language:
 * `const date = perLocale((tag) => new Intl.DateTimeFormat(tag, { dateStyle: 'medium' }))`, then `date().format(…)`.
 */
export function perLocale<T>(make: (tag: string) => T): () => T {
  const made = new Map<string, T>()
  return () => {
    const tag = intlLocale()
    if (!made.has(tag)) made.set(tag, make(tag))
    return made.get(tag)!
  }
}
