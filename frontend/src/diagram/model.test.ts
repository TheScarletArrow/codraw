import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
  compareCells,
  DEFAULT_PAGE_ID,
  getCells,
  getMeta,
  getPages,
  initializeDocument,
  LAYER_CELL_ID,
  orderBetween,
  readCell,
  readPage,
  ROOT_CELL_ID,
  SCHEMA_VERSION,
  writeCell,
  type CellData,
} from './model.ts'

const vertex = (id: string, overrides: Partial<CellData> = {}): CellData => ({
  id,
  kind: 'vertex',
  parent: LAYER_CELL_ID,
  order: orderBetween(null, null),
  value: 'Box',
  geometry: { x: 10, y: 20, width: 120, height: 60 },
  source: null,
  target: null,
  style: { fillColor: '#dae8fc', rounded: true },
  ...overrides,
})

/** Exchanges the full state of two documents, as a sync server would. */
function sync(a: Y.Doc, b: Y.Doc) {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)))
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)))
}

describe('initializeDocument', () => {
  it('creates the schema version, the default page and its root and layer cells', () => {
    const doc = new Y.Doc()

    initializeDocument(doc)

    expect(getMeta(doc).get('schemaVersion')).toBe(SCHEMA_VERSION)
    expect(readPage(getPages(doc).get(DEFAULT_PAGE_ID)!).name).toBe('Страница 1')
    expect(getPages(doc).get(DEFAULT_PAGE_ID)).toBeInstanceOf(Y.Map)
    const cells = getCells(doc)
    expect(readCell(ROOT_CELL_ID, cells.get(ROOT_CELL_ID)!)).toMatchObject({ kind: 'root', parent: null })
    expect(readCell(LAYER_CELL_ID, cells.get(LAYER_CELL_ID)!)).toMatchObject({ kind: 'layer', parent: ROOT_CELL_ID })
  })

  it('does not touch an initialized document', () => {
    const doc = new Y.Doc()
    initializeDocument(doc)
    let updates = 0
    doc.on('update', () => updates++)

    initializeDocument(doc)

    expect(updates).toBe(0)
  })

  it('converges when two clients initialize a fresh document at the same time', () => {
    const alice = new Y.Doc()
    const bob = new Y.Doc()
    initializeDocument(alice)
    initializeDocument(bob)
    alice.transact(() => writeCell(getCells(alice), vertex('alice-box')))
    bob.transact(() => writeCell(getCells(bob), vertex('bob-box')))

    sync(alice, bob)

    for (const doc of [alice, bob]) {
      expect(Array.from(getPages(doc).keys())).toEqual([DEFAULT_PAGE_ID])
      expect(Array.from(getCells(doc).keys()).sort()).toEqual([ROOT_CELL_ID, LAYER_CELL_ID, 'alice-box', 'bob-box'].sort())
    }
    expect(alice.getMap('cells:page-1').toJSON()).toEqual(bob.getMap('cells:page-1').toJSON())
  })

  it('migrates version 1 page entries to maps with the same fields', () => {
    const doc = new Y.Doc()
    doc.transact(() => {
      getMeta(doc).set('schemaVersion', 1)
      getPages(doc).set(DEFAULT_PAGE_ID, { name: 'Контекст', order: 'a0' })
      writeCell(getCells(doc), vertex('box'))
    })

    initializeDocument(doc)

    expect(getMeta(doc).get('schemaVersion')).toBe(SCHEMA_VERSION)
    const entry = getPages(doc).get(DEFAULT_PAGE_ID)
    expect(entry).toBeInstanceOf(Y.Map)
    expect(readPage(entry!)).toEqual({ name: 'Контекст', order: 'a0' })
    expect(Array.from(getCells(doc).keys()).sort()).toEqual([ROOT_CELL_ID, LAYER_CELL_ID, 'box'].sort())
  })

  it('converges when two clients migrate the same version 1 document', () => {
    const original = new Y.Doc()
    original.transact(() => {
      getMeta(original).set('schemaVersion', 1)
      getPages(original).set(DEFAULT_PAGE_ID, { name: 'Контекст', order: 'a0' })
    })
    const alice = new Y.Doc()
    const bob = new Y.Doc()
    sync(original, alice)
    sync(original, bob)

    initializeDocument(alice)
    initializeDocument(bob)
    sync(alice, bob)

    for (const doc of [alice, bob]) {
      expect(Array.from(getPages(doc).keys())).toEqual([DEFAULT_PAGE_ID])
      expect(readPage(getPages(doc).get(DEFAULT_PAGE_ID)!)).toEqual({ name: 'Контекст', order: 'a0' })
    }
  })

  it('does not bring back the default page when the board has other pages', () => {
    const doc = new Y.Doc()
    initializeDocument(doc)
    doc.transact(() => {
      getPages(doc).set('other', (getPages(doc).get(DEFAULT_PAGE_ID) as Y.Map<unknown>).clone())
      getPages(doc).delete(DEFAULT_PAGE_ID)
    })

    initializeDocument(doc)

    expect(Array.from(getPages(doc).keys())).toEqual(['other'])
    expect(getCells(doc, 'other').has(LAYER_CELL_ID)).toBe(true)
  })

  it('creates the default page again when concurrent deletions left the board without pages', () => {
    const doc = new Y.Doc()
    initializeDocument(doc)
    doc.transact(() => getPages(doc).delete(DEFAULT_PAGE_ID))

    initializeDocument(doc)

    expect(Array.from(getPages(doc).keys())).toEqual([DEFAULT_PAGE_ID])
  })
})

describe('cells', () => {
  it('writes and reads a cell', () => {
    const doc = new Y.Doc()
    const cells = getCells(doc)
    const data = vertex('box', { value: 'Сервис', style: { fillColor: '#fff', baseStyleNames: ['shape'] } })

    doc.transact(() => writeCell(cells, data))

    expect(readCell('box', cells.get('box')!)).toEqual(data)
  })

  it('writes only the fields that changed', () => {
    const doc = new Y.Doc()
    const cells = getCells(doc)
    doc.transact(() => writeCell(cells, vertex('box')))
    const changed: string[] = []
    cells.observeDeep((events) => events.forEach((event) => changed.push(...event.changes.keys.keys())))

    doc.transact(() => writeCell(cells, vertex('box', { style: { fillColor: '#000', rounded: true } })))

    expect(changed).toEqual(['fillColor'])
  })

  it('removes style keys that are no longer set', () => {
    const doc = new Y.Doc()
    const cells = getCells(doc)
    doc.transact(() => writeCell(cells, vertex('box')))

    doc.transact(() => writeCell(cells, vertex('box', { style: { fillColor: '#dae8fc' } })))

    expect(readCell('box', cells.get('box')!).style).toEqual({ fillColor: '#dae8fc' })
  })

  it('merges concurrent changes of different fields of one cell', () => {
    const alice = new Y.Doc()
    const bob = new Y.Doc()
    alice.transact(() => writeCell(getCells(alice), vertex('box')))
    sync(alice, bob)

    alice.transact(() => writeCell(getCells(alice), vertex('box', { style: { fillColor: '#f8cecc', rounded: true } })))
    bob.transact(() => writeCell(getCells(bob), vertex('box', { geometry: { x: 300, y: 200, width: 120, height: 60 } })))
    sync(alice, bob)

    for (const doc of [alice, bob]) {
      const box = readCell('box', getCells(doc).get('box')!)
      expect(box.style.fillColor).toBe('#f8cecc')
      expect(box.geometry).toEqual({ x: 300, y: 200, width: 120, height: 60 })
    }
  })
})

describe('order', () => {
  it('creates keys between neighbours', () => {
    const first = orderBetween(null, null)
    const last = orderBetween(first, null)
    const middle = orderBetween(first, last)

    expect([last, middle, first].sort()).toEqual([first, middle, last])
  })

  it('breaks ties between equal keys by id', () => {
    const cells = [
      { id: 'b', order: 'a1' },
      { id: 'a', order: 'a1' },
      { id: 'c', order: 'a0' },
    ]

    expect(cells.sort(compareCells).map((cell) => cell.id)).toEqual(['c', 'a', 'b'])
  })
})
