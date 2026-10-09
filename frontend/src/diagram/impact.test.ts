import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { FREEHAND_KEY } from './freehand.ts'
import {
  boardImpact,
  dependencyArea,
  dependencyLinks,
  impactNode,
  shortestPaths,
  type ImpactRecord,
} from './impact.ts'
import { ELEMENT_KEY, ELEMENT_STYLE_KEYS, getCells, initializeDocument, writeCell } from './model.ts'
import { addPage } from './pages.ts'
import { TABLE_STYLE } from './shapes.ts'
import { edgeData, shapeData } from './testing.ts'

const shape = (id: string, value: string, codrawShape = 'service', extra: Record<string, unknown> = {}): ImpactRecord => ({
  id,
  kind: 'vertex',
  parent: '1',
  source: null,
  target: null,
  value,
  style: { codrawShape, ...extra },
})
const edge = (id: string, source: string, target: string, style: Record<string, unknown> = {}): ImpactRecord => ({
  id,
  kind: 'edge',
  parent: '1',
  source,
  target,
  value: '',
  style,
})

/** Browser → API → Ledger → DB, API → Kafka topic ← Billing (receiving drawn from the topic), Billing → Ledger. */
const page: ImpactRecord[] = [
  shape('web', 'Браузер', 'browser'),
  shape('api', 'API'),
  shape('ledger', 'Ledger'),
  shape('db', 'DB', 'database'),
  shape('topic', 'payments', 'event-topic'),
  shape('billing', 'Billing'),
  edge('e1', 'web', 'api'),
  edge('e2', 'api', 'ledger'),
  edge('e3', 'ledger', 'db'),
  edge('e4', 'api', 'topic'),
  edge('e5', 'topic', 'billing'),
  edge('e6', 'billing', 'ledger'),
  edge('hand', 'web', 'db', { [FREEHAND_KEY]: true }),
]

const sorted = (values: Iterable<string>) => [...values].sort()

describe('dependencies', () => {
  it('reads an edge as a dependency of its source on its target, and anything linked to a channel as depending on it', () => {
    const links = dependencyLinks(page)
    expect(links.find((link) => link.edge === 'e5')).toEqual({ edge: 'e5', from: 'billing', to: 'topic' })
    expect(links.find((link) => link.edge === 'e4')).toEqual({ edge: 'e4', from: 'api', to: 'topic' })
    expect(links.some((link) => link.edge === 'hand')).toBe(false)
  })

  it('goes one step, two steps or all the way, in both directions', () => {
    const links = dependencyLinks(page)
    const one = dependencyArea(links, 'api', 1)
    expect(Object.fromEntries(one.dependencies)).toEqual({ ledger: 1, topic: 1 })
    expect(Object.fromEntries(one.dependents)).toEqual({ web: 1 })
    expect(sorted(one.dependencyEdges)).toEqual(['e2', 'e4'])
    expect(sorted(one.dependentEdges)).toEqual(['e1'])

    const all = dependencyArea(links, 'api', 'all')
    expect(Object.fromEntries(all.dependencies)).toEqual({ ledger: 1, topic: 1, db: 2 })
    expect(sorted(all.dependencyEdges)).toEqual(['e2', 'e3', 'e4'])

    const ledger = dependencyArea(links, 'ledger', 2)
    expect(Object.fromEntries(ledger.dependents)).toEqual({ api: 1, billing: 1, web: 2 })
    expect(sorted(ledger.dependentEdges)).toEqual(['e1', 'e2', 'e6'])
  })

  it('reads a field of a table as its table', () => {
    const records: ImpactRecord[] = [
      { ...shape('orders', 'orders'), style: { ...TABLE_STYLE } },
      { ...shape('customer-id', 'customer_id uuid'), parent: 'orders', style: {} },
      { ...shape('customers', 'customers'), style: { ...TABLE_STYLE } },
      { ...shape('id', 'id uuid PK'), parent: 'customers', style: {} },
      edge('fk', 'customer-id', 'id'),
    ]
    expect(dependencyLinks(records)).toEqual([{ edge: 'fk', from: 'orders', to: 'customers' }])
    expect(impactNode(records, 'customer-id')).toBe('orders')
  })
})

describe('the shortest paths between two elements', () => {
  it('follows the arrows, all paths of the least steps', () => {
    const path = shortestPaths(page, 'web', 'db')!
    expect(path).toMatchObject({ steps: 3, directed: true })
    expect(sorted(path.nodes)).toEqual(['api', 'db', 'ledger', 'web'])
    expect(sorted(path.edges)).toEqual(['e1', 'e2', 'e3'])

    const two = [...page, shape('cache', 'Cache', 'cache'), edge('e7', 'api', 'cache'), edge('e8', 'cache', 'db')]
    expect(sorted(shortestPaths(two, 'api', 'db')!.edges)).toEqual(['e2', 'e3', 'e7', 'e8'])
  })

  it('goes against the arrows when there is no other way, and finds none between unconnected elements', () => {
    expect(shortestPaths(page, 'db', 'web')).toMatchObject({ steps: 3, directed: true })
    expect(shortestPaths(page, 'topic', 'ledger')).toMatchObject({ steps: 2, directed: true })
    const apart = [...page, shape('alone', 'Alone')]
    expect(shortestPaths(apart, 'web', 'alone')).toBeNull()
    // Billing and DB: Billing → Ledger → DB along the arrows; web and billing only either way.
    expect(shortestPaths(page, 'web', 'billing')).toMatchObject({ directed: true, steps: 3 })
    const sideways = [shape('a', 'A'), shape('b', 'B'), shape('c', 'C'), edge('ab', 'a', 'b'), edge('cb', 'c', 'b')]
    expect(shortestPaths(sideways, 'a', 'c')).toMatchObject({ directed: false, steps: 2 })
  })
})

describe('dependencies on the whole board', () => {
  it('follows an element through its cells on other pages, naming the pages that tell each dependency', () => {
    const doc = new Y.Doc()
    initializeDocument(doc)
    const deploy = addPage(doc, 'page-1', 'Деплой')
    const element = (id: string, value: string, key: string) =>
      shapeData(id, 'a0', { value, style: { codrawShape: 'service', [ELEMENT_KEY]: key, [ELEMENT_STYLE_KEYS.name]: value } })
    doc.transact(() => {
      // «Страница 1»: Payments → Ledger; «Деплой»: Payments (the same element) → Kafka → nothing, Ledger → PostgreSQL.
      writeCell(getCells(doc), element('p1', 'Payments', 'payments'))
      writeCell(getCells(doc), element('l1', 'Ledger', 'ledger'))
      writeCell(getCells(doc), edgeData('a', 'a1', 'p1', 'l1'))
      writeCell(getCells(doc, deploy), element('p2', 'Payments', 'payments'))
      writeCell(getCells(doc, deploy), shapeData('k', 'a0', { value: 'Kafka', style: { codrawShape: 'event-topic' } }))
      writeCell(getCells(doc, deploy), element('l2', 'Ledger', 'ledger'))
      writeCell(getCells(doc, deploy), shapeData('pg', 'a0', { value: 'PostgreSQL', style: { codrawShape: 'database' } }))
      writeCell(getCells(doc, deploy), edgeData('b', 'a1', 'p2', 'k'))
      writeCell(getCells(doc, deploy), edgeData('c', 'a1', 'l2', 'pg'))
    })

    const one = boardImpact(doc, 'page-1', 'p1', 1)!
    expect(one.name).toBe('Payments')
    expect(one.places.map((place) => place.pageName)).toEqual(['Страница 1', 'Деплой'])
    expect(one.dependencies.map((item) => [item.name, item.depth, item.places.map((place) => `${place.pageName}:${place.cellId}`)])).toEqual([
      ['Kafka', 1, ['Деплой:k']],
      ['Ledger', 1, ['Страница 1:l1']],
    ])
    expect(one.dependents).toEqual([])

    const all = boardImpact(doc, 'page-1', 'p1', 'all')!
    expect(all.dependencies.map((item) => [item.name, item.depth, item.places.map((place) => place.pageName)])).toEqual([
      ['Kafka', 1, ['Деплой']],
      ['Ledger', 1, ['Страница 1']],
      ['PostgreSQL', 2, ['Деплой']],
    ])
    const ledger = boardImpact(doc, deploy, 'l2', 1)!
    expect(ledger.dependents.map((item) => item.name)).toEqual(['Payments'])
    expect(boardImpact(doc, 'page-1', 'a', 1)).toBeNull()
  })
})
