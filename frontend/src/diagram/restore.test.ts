import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { readAttribution, writeAttribution } from './attribution.ts'
import { LOCKED_KEY } from './locks.ts'
import {
  DEFAULT_PAGE_ID,
  ELEMENT_KEY,
  getCells,
  getElements,
  getMeta,
  getPages,
  initializeDocument,
  LAYER_CELL_ID,
  readCell,
  writeAttrs,
  writeCell,
  type CellData,
} from './model.ts'
import { snapshotPage, type CellSnapshot } from './diff.ts'
import { addPage, deletePage, listPages, renamePage } from './pages.ts'
import { cellsToRestore, restoreDocument, restorePage, RESTORE_ORIGIN, writeRestoredFields } from './restore.ts'
import { readStatus, writeStatus } from './status.ts'
import { boardWith, connect, edgeData, laterState, shapeData } from './testing.ts'

const shape = (id: string, overrides: Partial<CellData> = {}): CellData => ({
  id,
  kind: 'vertex',
  parent: LAYER_CELL_ID,
  order: 'a0',
  value: id,
  geometry: { x: 10, y: 20, width: 120, height: 60 },
  source: null,
  target: null,
  style: { fillColor: '#dae8fc' },
  ...overrides,
})

/** Everything the document holds, by top-level map. */
function content(doc: Y.Doc) {
  return Object.fromEntries(
    Array.from(doc.share.keys())
      .map((name) => [name, doc.getMap(name).toJSON()] as const)
      // A top-level map cannot be removed: an emptied one is no content.
      .filter(([, value]) => Object.keys(value).length > 0),
  )
}

/** A board with two pages and shapes, as it was saved in a version. */
function versionDocument() {
  const doc = new Y.Doc()
  initializeDocument(doc)
  doc.transact(() => {
    writeCell(getCells(doc), shape('a'))
    writeCell(getCells(doc), shape('b', { style: { rounded: true } }))
    writeAttrs(getCells(doc).get('a')!, { owner: 'payments' })
  })
  const second = addPage(doc, undefined, 'Схема БД')
  writeCell(getCells(doc, second), shape('table'))
  return { doc, second }
}

/** A copy of a document, as the page gets it from the state of a version. */
function copyOf(doc: Y.Doc) {
  const copy = new Y.Doc()
  Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc))
  return copy
}

describe('restoreDocument', () => {
  it('brings back the pages, cells, styles and properties of the version', () => {
    const { doc: live, second } = versionDocument()
    const version = copyOf(live)
    // What a participant did afterwards.
    live.transact(() => {
      getCells(live).delete('a')
      writeCell(getCells(live), shape('b', { value: 'Переименовано', style: { strokeColor: '#ff0000' } }))
      writeCell(getCells(live), shape('c'))
    })
    renamePage(live, listPages(live)[0]!.id, 'Новое имя')
    deletePage(live, second)
    addPage(live, undefined, 'Лишняя')

    restoreDocument(live, copyOf(version))

    expect(content(live)).toEqual(content(version))
    expect(listPages(live).map((page) => page.name)).toEqual(['Страница 1', 'Схема БД'])
    expect(readCell('b', getCells(live).get('b')!).style).toEqual({ rounded: true })
    expect(getCells(live).get('a')!.get('attrs')).toBeInstanceOf(Y.Map)
  })

  it('changes nothing in a document that equals the version', () => {
    const { doc: live } = versionDocument()
    const before = Y.encodeStateVector(live)

    restoreDocument(live, copyOf(live))

    expect(Y.encodeStateVector(live)).toEqual(before)
  })

  it('keeps the cells that the version shares with the document as the same objects', () => {
    const { doc: live } = versionDocument()
    const version = copyOf(live)
    const kept = getCells(live).get('a')
    writeCell(getCells(live), shape('a', { value: 'Изменено' }))

    restoreDocument(live, version)

    expect(getCells(live).get('a')).toBe(kept)
    expect(kept!.get('value')).toBe('a')
  })

  it('reaches the other participants as one change of the restoring origin', () => {
    const { doc: live } = versionDocument()
    const other = new Y.Doc()
    connect(live, other)
    const version = copyOf(live)
    getCells(live).delete('a')
    const origins: unknown[] = []
    live.on('afterTransaction', (transaction: Y.Transaction) => origins.push(transaction.origin))

    restoreDocument(live, version)

    expect(origins).toEqual([RESTORE_ORIGIN])
    expect(content(other)).toEqual(content(version))
  })

  it('restores the meta of the board and empties pages that the version did not have', () => {
    const { doc: version } = versionDocument()
    const live = copyOf(version)
    const extra = addPage(live, undefined, 'Лишняя')
    writeCell(getCells(live, extra), shape('z'))
    getMeta(live).set('schemaVersion', 99)

    restoreDocument(live, copyOf(version))

    expect(getPages(live).has(extra)).toBe(false)
    expect(getCells(live, extra).size).toBe(0)
    expect(getMeta(live).get('schemaVersion')).toBe(getMeta(version).get('schemaVersion'))
  })
})

describe('restorePage', () => {
  /** A board with three pages, each with a shape, as it was saved in a version. */
  function threePages() {
    const doc = new Y.Doc()
    initializeDocument(doc)
    writeCell(getCells(doc), shape('a'))
    const schema = addPage(doc, undefined, 'Схема БД')
    writeCell(getCells(doc, schema), shape('table'))
    const notes = addPage(doc, undefined, 'Заметки')
    writeCell(getCells(doc, notes), shape('note'))
    return { doc, first: listPages(doc)[0]!.id, schema, notes }
  }

  it('gives the cells of an element of the restored page on other pages the properties and labels of the version', () => {
    const live = new Y.Doc()
    initializeDocument(live)
    const second = addPage(live, DEFAULT_PAGE_ID)
    const payments = { codrawShape: 'c4-container', [ELEMENT_KEY]: 'e1', codrawName: 'Payments', codrawKind: 'c4-container' }
    live.transact(() => {
      writeCell(getCells(live), shapeData('a', 'a0', { value: 'Payments\n[Container]', style: payments }))
      writeCell(getCells(live, second), shapeData('b', 'a0', { value: 'Payments\n[Container]', style: payments }))
      writeCell(getCells(live, second), shapeData('other', 'a1', { value: 'Счета' }))
    })
    const version = copyOf(live)
    live.transact(() => {
      getElements(live).get('e1')!.set('name', 'Billing')
      getCells(live).get('a')!.set('value', 'Billing\n[Container]')
      getCells(live, second).get('b')!.set('value', 'Billing\n[Container]')
      getCells(live, second).get('other')!.set('value', 'Счета и оплаты')
    })

    restorePage(live, version, DEFAULT_PAGE_ID)

    expect(getCells(live, second).get('b')!.get('value')).toBe('Payments\n[Container]')
    expect(getCells(live, second).get('other')!.get('value')).toBe('Счета и оплаты')
    expect(getElements(live).get('e1')!.get('name')).toBe('Payments')
  })

  it('relabels nothing on other pages for the elements of the page that the version does not change', () => {
    const live = new Y.Doc()
    initializeDocument(live)
    const second = addPage(live, DEFAULT_PAGE_ID)
    const payments = { codrawShape: 'c4-container', [ELEMENT_KEY]: 'e1', codrawName: 'Payments', codrawKind: 'c4-container' }
    live.transact(() => {
      writeCell(getCells(live), shapeData('a', 'a0', { value: 'Payments\n[Container]', style: payments }))
      writeCell(getCells(live, second), shapeData('b', 'a0', { value: 'Payments!\n[Container]', style: payments }))
    })
    const version = copyOf(live)
    live.transact(() => getCells(live).get('a')!.set('geometry', { x: 50, y: 50, width: 240, height: 120 }))

    restorePage(live, version, DEFAULT_PAGE_ID)

    expect(getCells(live, second).get('b')!.get('value')).toBe('Payments!\n[Container]')
  })

  it('makes the content of a page as the version has it and keeps its name, its place and the other pages', () => {
    const { doc: live, first, schema } = threePages()
    const version = copyOf(live)
    live.transact(() => {
      getCells(live, first).delete('a')
      writeCell(getCells(live, first), shape('b'))
      writeCell(getCells(live, schema), shape('added'))
    })
    renamePage(live, first, 'Новое имя')
    const origins: unknown[] = []
    live.on('afterTransaction', (transaction: Y.Transaction) => origins.push(transaction.origin))

    expect(restorePage(live, version, first)).toBe(true)

    expect(getCells(live, first).toJSON()).toEqual(getCells(version, first).toJSON())
    expect(listPages(live).map((page) => page.name)).toEqual(['Новое имя', 'Схема БД', 'Заметки'])
    expect(getCells(live, schema).has('added')).toBe(true)
    expect(origins).toEqual([RESTORE_ORIGIN])
  })

  it('brings back the locks of the version and who changed its cells, as restoring a version does', () => {
    const version = boardWith(shape('a'))
    writeAttribution(getCells(version).get('a')!, { id: 'alice', name: 'Алиса' }, 1)
    const live = laterState(version, (doc) => {
      const entry = getCells(doc).get('a')!
      entry.set('value', 'Redis')
      ;(entry.get('style') as Y.Map<unknown>).set(LOCKED_KEY, true)
      writeAttribution(entry, { id: 'bob', name: 'Боб' }, 2)
    })

    restorePage(live, version, DEFAULT_PAGE_ID)

    const entry = getCells(live).get('a')!
    expect(entry.get('value')).toBe('a')
    expect((entry.get('style') as Y.Map<unknown>).has(LOCKED_KEY)).toBe(false)
    expect(readAttribution(entry)).toEqual({ by: 'alice', name: 'Алиса', at: 1 })
  })

  it('brings back a deleted page with its name and in its place among the pages', () => {
    const { doc: live, schema } = threePages()
    const version = copyOf(live)
    deletePage(live, schema)

    restorePage(live, version, schema)

    expect(listPages(live).map((page) => page.name)).toEqual(['Страница 1', 'Схема БД', 'Заметки'])
    expect(getCells(live, schema).toJSON()).toEqual(getCells(version, schema).toJSON())
    expect(getPages(live).get(schema)).toBeInstanceOf(Y.Map)
  })

  it('brings back the elements of the page as the version has them, and drops those only its cells showed', () => {
    const version = boardWith(
      shape('api', { style: { [ELEMENT_KEY]: 'e-api', codrawName: 'API', codrawTechnology: 'Java' } }),
      shape('db', { style: { [ELEMENT_KEY]: 'e-db', codrawName: 'DB' } }),
    )
    const live = laterState(version, (doc) => {
      getElements(doc).get('e-api')!.set('technology', 'Kotlin')
      getCells(doc).delete('db')
      getElements(doc).delete('e-db')
      writeCell(getCells(doc), shape('cache', { style: { [ELEMENT_KEY]: 'e-cache', codrawName: 'Cache' } }))
    })

    restorePage(live, version, DEFAULT_PAGE_ID)

    expect(getElements(live).toJSON()).toEqual(getElements(version).toJSON())
    expect(readCell('db', getCells(live).get('db')!).style).toMatchObject({ codrawName: 'DB' })
  })

  it('changes nothing for a page that the version does not have', () => {
    const { doc: live } = threePages()
    const version = copyOf(live)
    const added = addPage(live, undefined, 'Новая')
    const before = Y.encodeStateVector(live)

    expect(restorePage(live, version, added)).toBe(false)

    expect(Y.encodeStateVector(live)).toEqual(before)
  })
})

describe('cellsToRestore', () => {
  /** The cells of the default page of a board with these cells, as a version has them. */
  const versionOf = (...cells: CellData[]) => snapshotPage(boardWith(...cells), DEFAULT_PAGE_ID)!.cells
  const on = (...ids: string[]) => {
    const page = new Set(ids)
    return (id: string) => page.has(id)
  }
  const ids = (cells: CellSnapshot[]) => cells.map((cell) => cell.id)

  /** A group at (100, 50) with a shape at (10, 20) inside it and an edge from the shape with a bend. */
  const group = () => [
    shapeData('group', 'a0', { geometry: { x: 100, y: 50, width: 300, height: 200 }, style: { fillColor: 'none', strokeColor: 'none' } }),
    shapeData('inner', 'a0', { parent: 'group', geometry: { x: 10, y: 20, width: 120, height: 60 } }),
    edgeData('loose', 'a1', 'inner', null, {
      parent: 'group',
      geometry: { x: 0, y: 0, width: 0, height: 0, relative: true, points: [{ x: 200, y: 50 }], targetPoint: { x: 250, y: 50 } },
    }),
  ]

  it('brings back a cell with its descendants, parents before their children', () => {
    const cells = versionOf(
      shapeData('table', 'a0'),
      shapeData('field-2', 'a1', { parent: 'table' }),
      shapeData('field-1', 'a0', { parent: 'table' }),
      shapeData('other', 'a1'),
    )

    const restored = cellsToRestore(cells, ['table'], on())

    expect(ids(restored)).toEqual(['table', 'field-1', 'field-2'])
    expect(restored[0]).toEqual(cells.get('table'))
  })

  it('brings the edges of the restored cells whose other end is on the page or restored, and no others', () => {
    const cells = versionOf(
      shapeData('a', 'a0'),
      shapeData('b', 'a1'),
      shapeData('c', 'a2'),
      edgeData('a-b', 'a3', 'a', 'b'),
      edgeData('a-c', 'a4', 'a', 'c'),
      edgeData('b-c', 'a5', 'b', 'c'),
    )

    expect(ids(cellsToRestore(cells, ['a'], on('b')))).toEqual(['a', 'a-b'])
    expect(ids(cellsToRestore(cells, ['a', 'c'], on('b')))).toEqual(['a', 'c', 'a-b', 'a-c', 'b-c'])
    // A selected edge whose end is gone stays away, and so does its label.
    const label = shapeData('label', 'a0', { parent: 'a-c', geometry: { x: 0, y: 0, width: 0, height: 0, relative: true } })
    const labelled = versionOf(...cells.values(), label)
    expect(ids(cellsToRestore(labelled, ['a-c', 'label'], on('a')))).toEqual([])
  })

  it('brings an edge with a loose end and the edges that end at a restored edge', () => {
    const cells = versionOf(
      shapeData('a', 'a0'),
      edgeData('free', 'a1', 'a', null, { geometry: { x: 0, y: 0, width: 0, height: 0, relative: true, targetPoint: { x: 400, y: 0 } } }),
      shapeData('b', 'a2'),
      edgeData('to-edge', 'a3', 'b', 'free'),
    )

    expect(ids(cellsToRestore(cells, ['free'], on('a', 'b')))).toEqual(['free', 'to-edge'])
    // Without its shape the edge goes, and so does the edge that ends at it.
    expect(ids(cellsToRestore(cells, ['free', 'b'], on()))).toEqual(['b'])
  })

  it('keeps the parent of a cell when the page has it', () => {
    const cells = versionOf(...group())

    const [inner] = cellsToRestore(cells, ['inner'], on('group'))

    expect(inner).toEqual(cells.get('inner'))
  })

  it('puts a cell whose parent is gone on the page, where the version had it', () => {
    const cells = versionOf(...group())

    const restored = cellsToRestore(cells, ['inner', 'loose'], on())

    expect(restored.map((cell) => [cell.id, cell.parent])).toEqual([
      ['inner', '1'],
      ['loose', '1'],
    ])
    expect(restored[0]!.geometry).toEqual({ x: 110, y: 70, width: 120, height: 60 })
    expect(restored[1]!.geometry).toMatchObject({ points: [{ x: 300, y: 100 }], targetPoint: { x: 350, y: 100 }, relative: true })
  })

  it('leaves out the label of an edge without its edge', () => {
    const cells = versionOf(
      shapeData('a', 'a0'),
      shapeData('b', 'a1'),
      edgeData('edge', 'a2', 'a', 'b'),
      shapeData('label', 'a0', { parent: 'edge', value: 'FK', geometry: { x: -0.5, y: 0, width: 0, height: 0, relative: true } }),
    )

    expect(ids(cellsToRestore(cells, ['label'], on('a', 'b')))).toEqual([])
    expect(ids(cellsToRestore(cells, ['label'], on('a', 'b', 'edge')))).toEqual(['label'])
  })

  it('ignores cells that the version does not have', () => {
    expect(cellsToRestore(versionOf(shapeData('a', 'a0')), ['b', '1'], on())).toEqual([])
  })

  it('leaves what the page holds locked as it is, with what it holds, but brings the edges that end at it', () => {
    const cells = versionOf(
      shapeData('table', 'a0'),
      shapeData('field-1', 'a0', { parent: 'table' }),
      shapeData('field-2', 'a1', { parent: 'table' }),
      shapeData('other', 'a1'),
      edgeData('fk', 'a2', 'other', 'field-1'),
      edgeData('table-edge', 'a3', 'table', 'b'),
      shapeData('b', 'a4'),
    )
    const locked = on('table', 'field-1')

    // A locked table stays as it is, its fields too, and so do its own edges.
    expect(ids(cellsToRestore(cells, ['table'], on('table', 'field-1', 'b'), locked))).toEqual([])
    // A field does not go back into a locked table.
    expect(ids(cellsToRestore(cells, ['field-2'], on('table', 'field-1'), locked))).toEqual([])
    // A shape comes back with its edge to the locked table.
    expect(ids(cellsToRestore(cells, ['other'], on('table', 'field-1'), locked))).toEqual(['other', 'fk'])
  })
})

describe('writeRestoredFields', () => {
  it('writes the properties and the unknown fields of the version, leaving who changed the cell last', () => {
    const doc = boardWith(shape('a'))
    const entry = getCells(doc).get('a')!
    writeAttrs(entry, { owner: 'billing', stale: 'yes' })
    entry.set('note', 'later')
    entry.set('modifiedBy', 'bob')
    const version = snapshotPage(boardWith(shape('a')), DEFAULT_PAGE_ID)!.cells.get('a')!

    doc.transact(() => writeRestoredFields(entry, { ...version, attrs: { owner: 'payments' }, extra: { layer: 'data', modifiedBy: 'alice' } }))

    expect(entry.get('attrs')).toBeInstanceOf(Y.Map)
    expect(readCell('a', entry).value).toBe('a')
    expect((entry.get('attrs') as Y.Map<string>).toJSON()).toEqual({ owner: 'payments' })
    expect(entry.get('layer')).toBe('data')
    expect(entry.has('note')).toBe(false)
    expect(entry.get('modifiedBy')).toBe('bob')
  })

  it('brings back the status of the version with who set it, and takes off a status set since', () => {
    const version = boardWith(shape('a'), shape('b'))
    version.transact(() => writeStatus(getCells(version).get('a')!, 'review', { id: 'bob', name: 'Боб' }, 1000))
    const doc = laterState(version, (later) => {
      writeStatus(getCells(later).get('a')!, 'done', { id: 'alice', name: 'Алиса' }, 2000)
      writeStatus(getCells(later).get('b')!, 'draft', { id: 'alice', name: 'Алиса' }, 2000)
    })
    const cells = snapshotPage(version, DEFAULT_PAGE_ID)!.cells

    doc.transact(() => {
      writeRestoredFields(getCells(doc).get('a')!, cells.get('a')!)
      writeRestoredFields(getCells(doc).get('b')!, cells.get('b')!)
    })

    expect(readStatus(getCells(doc).get('a'))).toEqual({ status: 'review', by: 'bob', name: 'Боб', at: 1000 })
    expect(readStatus(getCells(doc).get('b'))).toBeNull()
  })

  it('removes the properties that the version did not have', () => {
    const doc = boardWith(shape('a'))
    const entry = getCells(doc).get('a')!
    writeAttrs(entry, { owner: 'billing' })
    const version = snapshotPage(boardWith(shape('a')), DEFAULT_PAGE_ID)!.cells.get('a')!

    doc.transact(() => writeRestoredFields(entry, version))

    expect(entry.has('attrs')).toBe(false)
  })
})
