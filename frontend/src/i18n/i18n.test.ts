import { afterEach, describe, expect, it } from 'vitest'
import { defineMessages, locale, localeOf, perLocale, pluralEn, pluralRu, setLocale } from './i18n.ts'

afterEach(() => setLocale('ru'))

describe('localeOf', () => {
  it('takes the first language of the browser that CoDraw speaks', () => {
    expect(localeOf(['en-GB', 'ru'])).toBe('en')
    expect(localeOf(['de-DE', 'ru-RU', 'en'])).toBe('ru')
    expect(localeOf(['EN'])).toBe('en')
  })

  it('speaks Russian to a browser whose languages it does not speak', () => {
    expect(localeOf(['de', 'fr'])).toBe('ru')
    expect(localeOf([])).toBe('ru')
  })
})

describe('defineMessages', () => {
  const messages = defineMessages({
    ru: { title: 'Доска', count: (n: number) => `${n} ${pluralRu(n, 'доска', 'доски', 'досок')}` },
    en: { title: 'Board', count: (n: number) => `${n} ${pluralEn(n, 'board', 'boards')}` },
  })

  it('reads the texts of the language of the moment', () => {
    expect(locale()).toBe('ru')
    expect(messages.title).toBe('Доска')
    expect(messages.count(5)).toBe('5 досок')
    setLocale('en')
    expect(messages.title).toBe('Board')
    expect(messages.count(1)).toBe('1 board')
    expect({ ...messages }.title).toBe('Board')
    expect(Object.keys(messages)).toEqual(['title', 'count'])
  })
})

describe('pluralRu', () => {
  it('picks the Russian form of a count', () => {
    const forms = (n: number) => pluralRu(n, 'минуту', 'минуты', 'минут')
    expect([1, 21, 101].map(forms)).toEqual(['минуту', 'минуту', 'минуту'])
    expect([2, 3, 4, 22].map(forms)).toEqual(['минуты', 'минуты', 'минуты', 'минуты'])
    expect([0, 5, 11, 12, 14, 25, 111].map(forms)).toEqual(Array(7).fill('минут'))
  })
})

describe('perLocale', () => {
  it('makes a value once per language', () => {
    const date = perLocale((tag) => new Intl.DateTimeFormat(tag, { month: 'long', timeZone: 'UTC' }))
    const october = new Date(Date.UTC(2026, 9, 6))
    expect(date().format(october)).toBe('октябрь')
    expect(date()).toBe(date())
    setLocale('en')
    expect(date().format(october)).toBe('October')
  })
})
