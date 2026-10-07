import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { DiagramBuilder } from '../templates/builder.ts'
import { INHERITED_KEY } from './baseTables.ts'
import { searchCanvas, searchText, stepMatch, type CanvasMatch } from './canvasSearch.ts'
import { DEFAULT_PAGE_ID, ELEMENT_KEY, getCells, initializeDocument, LAYER_CELL_ID, writeCell, type CellData } from './model.ts'
import { addPage, renamePage } from './pages.ts'

function board() {
  const doc = new Y.Doc()
  initializeDocument(doc)
  return doc
}

/** Writes the cells of a builder to a page of the board. */
function write(doc: Y.Doc, builder: DiagramBuilder, pageId = DEFAULT_PAGE_ID) {
  doc.transact(() => builder.build().forEach((cell) => writeCell(getCells(doc, pageId), cell)))
}

const cell = (id: string, overrides: Partial<CellData> = {}): CellData => ({
  id,
  kind: 'vertex',
  parent: LAYER_CELL_ID,
  order: 'a0',
  value: id,
  geometry: { x: 0, y: 0, width: 120, height: 60 },
  source: null,
  target: null,
  style: {},
  ...overrides,
})

/** The texts of the found elements, in their order. */
const found = (doc: Y.Doc, query: string) =>
  searchCanvas(doc, query).map(({ pageId, cellId }) => String(getCells(doc, pageId).get(cellId)!.get('value')))

describe('searching the canvas', () => {
  it('finds shapes and edges by their labels, whatever the case, «ё» and line breaks', () => {
    const doc = board()
    const builder = new DiagramBuilder()
    const api = builder.shape('service', 0, 0, { value: 'Customer API' })
    const db = builder.shape('database', 300, 0, { value: 'Счёт\nи   оплата' })
    builder.edge(api, db, { value: 'HTTPS' })
    builder.shape('rectangle', 0, 200, { value: 'Склад' })
    write(doc, builder)

    expect(found(doc, 'customer')).toEqual(['Customer API'])
    expect(found(doc, 'СЧЕТ И ОПЛАТА')).toEqual(['Счёт\nи   оплата'])
    expect(found(doc, '  ёт ')).toEqual(['Счёт\nи   оплата'])
    expect(found(doc, 'https')).toEqual(['HTTPS'])
    expect(found(doc, 'кухня')).toEqual([])
  })

  it('finds elements by the properties their labels do not show, and edges by their technology', () => {
    const doc = board()
    doc.transact(() => {
      const cells = getCells(doc)
      writeCell(cells, cell('billing', { value: 'Billing', style: { [ELEMENT_KEY]: 'e1', codrawTechnology: 'Kafka Streams', codrawTags: ['pci'], codrawOwner: 'Платежи' } }))
      writeCell(cells, cell('db', { value: 'DB', geometry: { x: 300, y: 0, width: 120, height: 60 } }))
      writeCell(cells, cell('flow', { kind: 'edge', value: '', source: 'billing', target: 'db', geometry: { x: 0, y: 0, width: 0, height: 0, relative: true }, style: { codrawTechnology: 'Kafka' } }))
      // Custom properties of a file are no properties of an element.
      writeCell(cells, cell('other', { value: 'Other', style: { tooltip: 'kafka' }, geometry: { x: 0, y: 200, width: 120, height: 60 } }))
    })

    const ids = (query: string) => searchCanvas(doc, query).map((match) => match.cellId)
    expect(ids('kafka')).toEqual(['billing', 'flow'])
    expect(ids('PCI')).toEqual(['billing'])
    expect(ids('платежи')).toEqual(['billing'])
  })

  it('finds tables by their names and the fields and indexes of tables as they are typed', () => {
    const doc = board()
    const builder = new DiagramBuilder()
    builder.table('orders', 0, 0, ['id uuid PK NOT NULL', 'customer_id uuid FK'], 220, ['orders_customer_idx (customer_id)'])
    write(doc, builder)

    expect(found(doc, 'order')).toEqual(['orders', 'orders_customer_idx (customer_id)'])
    expect(found(doc, 'customer')).toEqual(['customer_id uuid FK', 'orders_customer_idx (customer_id)'])
    expect(found(doc, 'pk not null')).toEqual(['id uuid PK NOT NULL'])
  })

  it('finds an inherited field in every table that shows it', () => {
    const doc = board()
    const builder = new DiagramBuilder()
    const users = builder.table('users', 0, 0, ['email text'])
    const orders = builder.table('orders', 300, 0, ['total numeric'])
    const base = builder.table('base', 0, 300, ['created_at timestamptz'])
    write(doc, builder)
    doc.transact(() =>
      [users, orders].forEach((table, index) =>
        writeCell(
          getCells(doc),
          cell(`inherited-${index}`, {
            parent: table.id,
            value: 'created_at timestamptz',
            geometry: { x: 0, y: 56, width: 220, height: 26 },
            style: { [INHERITED_KEY]: base.fields[0]! },
          }),
        ),
      ),
    )

    expect(searchCanvas(doc, 'created_at').map((match) => match.cellId)).toEqual(['inherited-0', 'inherited-1', base.fields[0]])
  })

  it('searches every page, the pages in their order', () => {
    const doc = board()
    const second = addPage(doc, DEFAULT_PAGE_ID)
    const first = new DiagramBuilder()
    first.shape('service', 0, 0, { value: 'Customer API' })
    write(doc, first)
    const other = new DiagramBuilder()
    const orders = other.table('orders', 0, 0, ['customer_id uuid'])
    write(doc, other, second)
    const between = addPage(doc, DEFAULT_PAGE_ID)
    renamePage(doc, between, 'customer')

    expect(searchCanvas(doc, 'customer')).toEqual([
      { pageId: DEFAULT_PAGE_ID, cellId: expect.any(String) },
      { pageId: second, cellId: orders.fields[0] },
    ])
  })

  it('goes top to bottom, then left to right, with the rows of a table and the shapes of a group after them', () => {
    const doc = board()
    const builder = new DiagramBuilder()
    builder.shape('service', 0, 300, { value: 'API' })
    builder.shape('service', 400, 100, { value: 'API right' })
    builder.table('api_keys', 0, 100, ['id uuid PK', 'api_key text'])
    builder.shape('service', 0, 0, { value: 'API top' })
    write(doc, builder)
    doc.transact(() => {
      const cells = getCells(doc)
      writeCell(cells, cell('group', { value: '', geometry: { x: 600, y: 20, width: 200, height: 200 } }))
      writeCell(cells, cell('in-group-low', { parent: 'group', value: 'API low', geometry: { x: 0, y: 150, width: 40, height: 20 } }))
      writeCell(cells, cell('in-group-high', { parent: 'group', value: 'API high', geometry: { x: 0, y: 10, width: 40, height: 20 } }))
    })

    expect(found(doc, 'api')).toEqual(['API top', 'API high', 'API low', 'api_keys', 'api_key text', 'API right', 'API'])
  })

  it('places an edge at the middle between its ends', () => {
    const doc = board()
    const builder = new DiagramBuilder()
    const top = builder.shape('rectangle', 0, 0, { value: 'top', width: 100, height: 50 })
    const bottom = builder.shape('rectangle', 0, 400, { value: 'bottom', width: 100, height: 50 })
    builder.edge(top, bottom, { value: 'link' })
    builder.shape('rectangle', 300, 200, { value: 'link middle', width: 100, height: 50 })
    write(doc, builder)
    doc.transact(() =>
      writeCell(
        getCells(doc),
        cell('loose', {
          kind: 'edge',
          value: 'link loose',
          geometry: { x: 0, y: 0, width: 0, height: 0, relative: true, sourcePoint: { x: 0, y: 600 }, targetPoint: { x: 100, y: 700 } },
        }),
      ),
    )

    // The edge between the shapes is at the height 225, below «link middle» at 200.
    expect(found(doc, 'link')).toEqual(['link middle', 'link', 'link loose'])
  })

  it('finds nothing for an empty query, and nothing of the root, the layers or names of pages', () => {
    const doc = board()
    renamePage(doc, DEFAULT_PAGE_ID, 'Схема')
    doc.transact(() => {
      getCells(doc).get(LAYER_CELL_ID)!.set('value', 'Схема')
      writeCell(getCells(doc), cell('stock', { value: 'Склад' }))
    })

    expect(searchCanvas(doc, '')).toEqual([])
    expect(searchCanvas(doc, '   ')).toEqual([])
    expect(searchCanvas(doc, 'схема')).toEqual([])
  })

  it('counts an element once, however often its text has the query', () => {
    const doc = board()
    doc.transact(() => writeCell(getCells(doc), cell('twice', { value: 'id id id' })))

    expect(searchCanvas(doc, 'id')).toEqual([{ pageId: DEFAULT_PAGE_ID, cellId: 'twice' }])
  })

  it('survives a document that puts a cell inside itself or connects edges to each other', () => {
    const doc = board()
    doc.transact(() => {
      const cells = getCells(doc)
      writeCell(cells, cell('a', { kind: 'edge', value: 'loop a', geometry: null, source: 'b', target: 'b' }))
      writeCell(cells, cell('b', { kind: 'edge', value: 'loop b', geometry: null, source: 'a', target: 'a' }))
      writeCell(cells, cell('self', { parent: 'self', value: 'loop self' }))
    })

    expect(found(doc, 'loop')).toEqual(['loop a', 'loop b'])
  })

  it('compares texts in lower case, with «ё» as «е» and one space for every run of spaces', () => {
    expect(searchText('Ёлка\n\tи  ЁЖ')).toBe('елка и еж')
  })
})

describe('stepping through matches', () => {
  const pages = ['p1', 'p2', 'p3']
  const matches: CanvasMatch[] = [
    { pageId: 'p1', cellId: 'a' },
    { pageId: 'p1', cellId: 'b' },
    { pageId: 'p3', cellId: 'c' },
  ]

  it('goes to the next and the previous match, from the last to the first and back', () => {
    expect(stepMatch(matches, 0, 1, pages, 'p1')).toBe(1)
    expect(stepMatch(matches, 2, 1, pages, 'p3')).toBe(0)
    expect(stepMatch(matches, 1, -1, pages, 'p1')).toBe(0)
    expect(stepMatch(matches, 0, -1, pages, 'p1')).toBe(2)
  })

  it('starts on the current page without a current match, or on the page after it, or before it going back', () => {
    expect(stepMatch(matches, -1, 1, pages, 'p1')).toBe(0)
    expect(stepMatch(matches, -1, -1, pages, 'p1')).toBe(1)
    expect(stepMatch(matches, -1, 1, pages, 'p2')).toBe(2)
    expect(stepMatch(matches, -1, -1, pages, 'p2')).toBe(1)
    expect(stepMatch(matches, -1, 1, ['p1', 'p2', 'p3', 'p4'], 'p4')).toBe(0)
    expect(stepMatch(matches.slice(2), -1, -1, pages, 'p1')).toBe(0)
  })

  it('has nowhere to go without matches', () => {
    expect(stepMatch([], -1, 1, pages, 'p1')).toBe(-1)
    expect(stepMatch([], 0, -1, pages, 'p1')).toBe(-1)
  })
})
