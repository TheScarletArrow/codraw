import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
  getCells,
  getMeta,
  getPages,
  initializeDocument,
  LAYER_CELL_ID,
  readCell,
  writeAttrs,
  writeCell,
  type CellData,
} from './model.ts'
import { addPage, deletePage, listPages, renamePage } from './pages.ts'
import { restoreDocument, RESTORE_ORIGIN } from './restore.ts'
import { connect } from './testing.ts'

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
