import { describe, expect, it } from 'vitest'
import { setLocale } from '../i18n/i18n.ts'
import { relativeTime } from './relativeTime.ts'

const NOW = Date.UTC(2026, 9, 6, 12, 0, 0)
const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const ago = (elapsed: number) => relativeTime(NOW - elapsed, NOW)

describe('relativeTime', () => {
  it('says «только что» within a minute and for a time ahead of the clock', () => {
    expect(ago(0)).toBe('только что')
    expect(ago(59 * SECOND)).toBe('только что')
    expect(ago(-5 * MINUTE)).toBe('только что')
  })

  it('counts whole minutes, hours and days with Russian forms of the number', () => {
    expect(ago(MINUTE)).toBe('1 минуту назад')
    expect(ago(2 * MINUTE + 59 * SECOND)).toBe('2 минуты назад')
    expect(ago(5 * MINUTE)).toBe('5 минут назад')
    expect(ago(11 * MINUTE)).toBe('11 минут назад')
    expect(ago(21 * MINUTE)).toBe('21 минуту назад')
    expect(ago(59 * MINUTE)).toBe('59 минут назад')
    expect(ago(HOUR)).toBe('1 час назад')
    expect(ago(3 * HOUR)).toBe('3 часа назад')
    expect(ago(5 * HOUR)).toBe('5 часов назад')
    expect(ago(21 * HOUR)).toBe('21 час назад')
    expect(ago(DAY)).toBe('1 день назад')
    expect(ago(2 * DAY)).toBe('2 дня назад')
    expect(ago(12 * DAY)).toBe('12 дней назад')
    expect(ago(29 * DAY)).toBe('29 дней назад')
  })

  it('counts months of 30 days and years of 365 days', () => {
    expect(ago(30 * DAY)).toBe('1 месяц назад')
    expect(ago(65 * DAY)).toBe('2 месяца назад')
    expect(ago(150 * DAY)).toBe('5 месяцев назад')
    expect(ago(362 * DAY)).toBe('1 год назад')
    expect(ago(2 * 365 * DAY)).toBe('2 года назад')
    expect(ago(5 * 365 * DAY)).toBe('5 лет назад')
  })

  it('speaks English in the English interface', () => {
    setLocale('en')
    expect(ago(30 * SECOND)).toBe('just now')
    expect(ago(MINUTE)).toBe('1 minute ago')
    expect(ago(3 * MINUTE)).toBe('3 minutes ago')
    expect(ago(21 * HOUR)).toBe('21 hours ago')
    expect(ago(DAY)).toBe('1 day ago')
    expect(ago(65 * DAY)).toBe('2 months ago')
    expect(ago(365 * DAY)).toBe('1 year ago')
  })
})
