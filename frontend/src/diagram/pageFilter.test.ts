import { describe, expect, it } from 'vitest'
import { INTERACTION_KEY } from './elementKinds.ts'
import { FREEHAND_KEY } from './freehand.ts'
import { ELEMENT_KEY, ELEMENT_STYLE_KEYS } from './model.ts'
import {
  filterChoices,
  filterCounts,
  filteredOut,
  filterFromParams,
  isFilterActive,
  NO_FILTER,
  writeFilterParams,
  type FilterRecord,
  type PageFilter,
} from './pageFilter.ts'
import { TABLE_STYLE } from './shapes.ts'

/** A shape whose element has the properties, of the kind of its shape as an element made by the panel has it. */
const element = (id: string, value: string, properties: Record<string, unknown> = {}, codrawShape = 'service'): FilterRecord => ({
  id,
  kind: 'vertex',
  parent: '1',
  source: null,
  target: null,
  value,
  style: {
    codrawShape,
    [ELEMENT_KEY]: id,
    ...Object.fromEntries(
      Object.entries({ name: value, kind: codrawShape, ...properties }).map(([field, propertyValue]) => [
        ELEMENT_STYLE_KEYS[field as keyof typeof ELEMENT_STYLE_KEYS],
        propertyValue,
      ]),
    ),
  },
})
const edge = (id: string, source: string, target: string, style: Record<string, unknown> = {}): FilterRecord => ({
  id,
  kind: 'edge',
  parent: '1',
  source,
  target,
  value: '',
  style,
})
const filter = (changes: Partial<PageFilter>): PageFilter => ({ ...NO_FILTER, ...changes })

/** Payments with two services and a database, the warehouse with one service, a sticky and a table. */
const page: FilterRecord[] = [
  element('pay', 'Payments', { owner: 'Платежи', technology: 'Kotlin', tags: ['pci', 'core'] }),
  element('ledger', 'Ledger', { owner: 'Платежи', technology: 'PostgreSQL' }, 'database'),
  element('stock', 'Stock', { owner: 'Склад', technology: 'PostgreSQL' }, 'database'),
  element('api', 'API', { owner: 'Склад', technology: 'Go' }),
  edge('e1', 'pay', 'ledger', { [INTERACTION_KEY]: 'sync' }),
  edge('e2', 'pay', 'stock', { [INTERACTION_KEY]: 'async' }),
  edge('e3', 'api', 'stock'),
  { id: 'label', kind: 'vertex', parent: 'e2', source: null, target: null, value: 'события', style: { fillColor: 'none', strokeColor: 'none' } },
  { id: 'note', kind: 'vertex', parent: '1', source: null, target: null, value: 'Идея', style: { codrawShape: 'sticky' } },
  { id: 'table', kind: 'vertex', parent: '1', source: null, target: null, value: 'users', style: { ...TABLE_STYLE } },
  { id: 'hand', kind: 'edge', parent: '1', source: null, target: null, value: '', style: { [FREEHAND_KEY]: true } },
]

const out = (chosen: Partial<PageFilter>) => [...filteredOut(page, filter(chosen))].sort()

describe('the filter of a page', () => {
  it('leaves out the elements of other owners, the edges to them and their labels', () => {
    expect(out({ owners: ['Платежи'] })).toEqual(['api', 'e2', 'e3', 'label', 'stock'])
    expect(filterCounts(page, filter({ owners: ['Платежи'] }))).toEqual({ matched: 2, total: 4 })
  })

  it('wants a chosen value in every facet with a choice, any of the chosen ones in a facet', () => {
    expect(out({ kinds: ['database'], technologies: ['PostgreSQL'] })).toEqual(['api', 'e1', 'e2', 'e3', 'label', 'pay'])
    expect(out({ kinds: ['database'], technologies: ['PostgreSQL'], owners: ['Платежи'] })).toEqual([
      'api',
      'e1',
      'e2',
      'e3',
      'label',
      'pay',
      'stock',
    ])
    expect(out({ technologies: ['Kotlin', 'Go'] })).toEqual(['e1', 'e2', 'e3', 'label', 'ledger', 'stock'])
    expect(out({ tags: ['pci'] })).toEqual(['api', 'e1', 'e2', 'e3', 'label', 'ledger', 'stock'])
  })

  it('tells edges by their kind and keeps every element for a filter of edges only', () => {
    expect(out({ interactions: ['async'] })).toEqual(['e1', 'e3'])
    expect(out({ interactions: ['none', 'sync'] })).toEqual(['e2', 'label'])
  })

  it('takes the kind a shape stands for when its element has none', () => {
    const plain: FilterRecord = { id: 'q', kind: 'vertex', parent: '1', source: null, target: null, value: 'Очередь', style: { codrawShape: 'queue' } }
    expect([...filteredOut([plain], filter({ kinds: ['queue'] }))]).toEqual([])
    expect([...filteredOut([plain], filter({ kinds: ['service'] }))]).toEqual(['q'])
  })

  it('chooses nothing without a value, also when it hides', () => {
    expect(isFilterActive(filter({ hide: true }))).toBe(false)
    expect(filteredOut(page, filter({ hide: true })).size).toBe(0)
  })

  it('offers the values of the page with their counts, and the chosen ones the page lacks', () => {
    const choices = filterChoices(page, filter({ owners: ['Маркетинг'] }))
    expect(choices.owners).toEqual([
      { value: 'Маркетинг', label: 'Маркетинг', count: 0 },
      { value: 'Платежи', label: 'Платежи', count: 2 },
      { value: 'Склад', label: 'Склад', count: 2 },
    ])
    expect(choices.kinds).toEqual([
      { value: 'database', label: 'База данных', count: 2 },
      { value: 'service', label: 'Сервис', count: 2 },
    ])
    expect(choices.tags.map((choice) => choice.value)).toEqual(['core', 'pci'])
    expect(choices.technologies.map((choice) => [choice.value, choice.count])).toEqual([
      ['Go', 1],
      ['Kotlin', 1],
      ['PostgreSQL', 2],
    ])
    expect(choices.interactions).toEqual([
      { value: 'sync', label: 'Синхронная', count: 1 },
      { value: 'async', label: 'Асинхронная', count: 1 },
      { value: 'none', label: 'Не указан', count: 1 },
    ])
  })
})

describe('the filter in the address', () => {
  it('goes into the parameters and back, next to the others', () => {
    const params = new URLSearchParams('page=p2&tag=old')
    const chosen = filter({ tags: ['pci'], kinds: ['database'], technologies: ['PostgreSQL 16'], owners: ['Платежи'], interactions: ['async'], hide: true })
    writeFilterParams(params, chosen)
    expect(params.get('page')).toBe('p2')
    expect(params.getAll('tag')).toEqual(['pci'])
    expect(filterFromParams(new URLSearchParams(params.toString()))).toEqual(chosen)
  })

  it('leaves out values of no kind, and no filter leaves no parameter', () => {
    expect(filterFromParams(new URLSearchParams('kind=robot&kind=queue&edge=maybe&edge=sync&tag=%20&hide=yes'))).toEqual(
      filter({ kinds: ['queue'], interactions: ['sync'] }),
    )
    const params = new URLSearchParams('tag=pci&hide=1&page=p1')
    writeFilterParams(params, NO_FILTER)
    expect(params.toString()).toBe('page=p1')
  })
})
