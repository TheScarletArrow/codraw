import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { EXTRA_LOGOS, EXTRA_NAMES, mergeLogos, type ExtraIconData, type IconData } from './techIcons.ts'

const simpleIcons = JSON.parse(readFileSync(createRequire(import.meta.url).resolve('simple-icons/icons.json'), 'utf8')) as IconData[]
const extraLogos = JSON.parse(readFileSync(EXTRA_LOGOS, 'utf8')) as ExtraIconData[]
const extraNames = JSON.parse(readFileSync(EXTRA_NAMES, 'utf8')) as Record<string, string[]>

const extra = (slug: string, title = slug): ExtraIconData => ({ slug, title, hex: '000000', path: 'M0 0h24v24H0z', source: 'test' })

describe('the supplementary set of logos', () => {
  it('describes every logo as simple-icons does, with one path and its source', () => {
    for (const icon of extraLogos) {
      expect(icon.slug, icon.slug).toMatch(/^[a-z0-9]+$/)
      expect(icon.title.trim(), icon.slug).not.toBe('')
      expect(icon.hex, icon.slug).toMatch(/^[0-9A-F]{6}$/)
      expect(icon.path, icon.slug).toMatch(/^[Mm][\d\s.,+\-eACHLMQSTVZachlmqstvz]+$/)
      expect(icon.source.trim(), icon.slug).not.toBe('')
    }
  })

  it('adds logos that simple-icons lacks and names that it has logos for', () => {
    const logos = mergeLogos(simpleIcons, () => undefined, extraLogos, extraNames)

    expect(logos).toHaveLength(simpleIcons.length + extraLogos.length)
    expect(logos.find(({ icon }) => icon.slug === 'yandexcloud')?.names).toContain('Яндекс Облако')
    expect(logos.find(({ icon }) => icon.slug === 'sber')?.path()).toMatch(/^M/)
  })

  it('puts its own logos first, so that their titles win', () => {
    const logos = mergeLogos([{ slug: 'max', title: 'Max', hex: '002BE7' }], () => 'M1 1', [extra('maxmessenger', 'MAX')], {})

    expect(logos.map(({ icon }) => icon.slug)).toEqual(['maxmessenger', 'max'])
    expect(logos[1]!.path()).toBe('M1 1')
  })

  it('stops the build on a logo that simple-icons has, a logo twice and a name of no logo', () => {
    const redis: IconData = { slug: 'redis', title: 'Redis', hex: 'FF4438' }
    expect(() => mergeLogos([redis], () => undefined, [extra('redis')], {})).toThrow(/simple-icons already/)
    expect(() => mergeLogos([redis], () => undefined, [extra('sber'), extra('sber')], {})).toThrow(/twice/)
    expect(() => mergeLogos([redis], () => undefined, [], { kafka: ['Кафка'] })).toThrow(/neither set/)
  })
})
