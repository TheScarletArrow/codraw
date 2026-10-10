import { describe, expect, it } from 'vitest'
import { dictionaries } from './i18n.ts'

// Every dictionary of the app, so that each one registers itself.
import.meta.glob(['/src/**/messages.{ts,tsx}', '/src/**/*.messages.{ts,tsx}'], { eager: true })

const CYRILLIC = /[А-Яа-яЁё]/

/** What differs between the Russian and the English texts at `path`, e.g. a key that one of them lacks. */
function differences(ru: unknown, en: unknown, path = ''): string[] {
  const kind = (value: unknown) => (Array.isArray(value) ? 'array' : typeof value)
  if (kind(ru) !== kind(en)) return [`${path || '(root)'}: ${kind(ru)} in ru, ${kind(en)} in en`]
  if (typeof ru === 'string') {
    const text = en as string
    if (ru.trim() !== '' && text.trim() === '') return [`${path}: empty in en`]
    if (CYRILLIC.test(text)) return [`${path}: Russian in en: «${text}»`]
    return []
  }
  if (typeof ru === 'function') {
    return ru.length === (en as () => unknown).length ? [] : [`${path}: takes ${ru.length} in ru, ${(en as () => unknown).length} in en`]
  }
  if (Array.isArray(ru)) {
    const list = en as unknown[]
    if (ru.length !== list.length) return [`${path}: ${ru.length} items in ru, ${list.length} in en`]
    return ru.flatMap((item, index) => differences(item, list[index], `${path}[${index}]`))
  }
  if (ru !== null && typeof ru === 'object') {
    const a = ru as Record<string, unknown>
    const b = en as Record<string, unknown>
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    return [...keys].flatMap((key) => {
      const at = path ? `${path}.${key}` : key
      if (!(key in a)) return [`${at}: missing in ru`]
      if (!(key in b)) return [`${at}: missing in en`]
      return differences(a[key], b[key], at)
    })
  }
  return []
}

describe('dictionaries', () => {
  it('are found', () => {
    expect(dictionaries.length).toBeGreaterThan(10)
  })

  it('have every text in both languages', () => {
    const problems = dictionaries.flatMap(({ ru, en }) => differences(ru, en))
    expect(problems).toEqual([])
  })

  it('tell a text missing in one of the languages', () => {
    expect(differences({ a: 'А', b: { c: 'В' } }, { a: 'A', b: {} })).toEqual(['b.c: missing in en'])
    expect(differences({ a: 'А' }, { a: 'A', d: 'D' })).toEqual(['d: missing in ru'])
    expect(differences({ a: 'А' }, { a: 'Б' })).toEqual(['a: Russian in en: «Б»'])
    expect(differences({ a: (n: number) => `${n}` }, { a: () => '' })).toEqual(['a: takes 1 in ru, 0 in en'])
  })
})
