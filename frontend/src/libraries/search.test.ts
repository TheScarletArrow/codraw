import { describe, expect, it } from 'vitest'
import type { ShapeLibrary } from '../api/libraries.ts'
import { searchComponents } from './search.ts'

const component = (id: string, name: string) => ({ id, name, preview: null, updatedAt: '2026-10-08T10:00:00Z' })
const libraries: ShapeLibrary[] = [
  { id: 'l1', name: 'Платежи', components: [component('c1', 'Шлюз оплаты'), component('c2', 'Сервис счетов')] },
  { id: 'l2', name: 'Шлюзы', components: [component('c3', 'Nginx')] },
]

const names = (query: string) => searchComponents(query, libraries).map((found) => found.component.name)

describe('searching components of libraries', () => {
  it('finds components by the starts of the words of their names first, then of the names of their libraries', () => {
    expect(names('шлюз')).toEqual(['Шлюз оплаты', 'Nginx'])
    expect(names('ПЛАТ')).toEqual(['Шлюз оплаты', 'Сервис счетов'])
    expect(names('сервис плат')).toEqual(['Сервис счетов'])
  })

  it('finds nothing for an empty query or words that start nothing', () => {
    expect(names('  ')).toEqual([])
    expect(names('оплата шлюзов')).toEqual([])
  })

  it('tells the library of each component found', () => {
    expect(searchComponents('nginx', libraries)[0]!.library.id).toBe('l2')
  })
})
