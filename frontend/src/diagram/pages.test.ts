import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { readAttribution, writeAttribution } from './attribution.ts'
import {
  DEFAULT_PAGE_ID,
  ELEMENT_KEY,
  getCells,
  getElements,
  getPages,
  initializeDocument,
  LAYER_CELL_ID,
  orderBetween,
  readCell,
  ROOT_CELL_ID,
  writeCell,
  type CellData,
} from './model.ts'
import {
  addPage,
  deletePage,
  duplicatePage,
  isPageEmpty,
  listPages,
  movePage,
  nextPageName,
  PAGES_ORIGIN,
  renamePage,
} from './pages.ts'
import { readStatus, STATUS_KEYS, writeStatus } from './status.ts'

function board() {
  const doc = new Y.Doc()
  initializeDocument(doc)
  return doc
}

const names = (doc: Y.Doc) => listPages(doc).map((page) => page.name)

const cell = (id: string, overrides: Partial<CellData> = {}): CellData => ({
  id,
  kind: 'vertex',
  parent: LAYER_CELL_ID,
  order: orderBetween(null, null),
  value: id,
  geometry: { x: 10, y: 20, width: 120, height: 60 },
  source: null,
  target: null,
  style: { fillColor: '#dae8fc' },
  ...overrides,
})

function sync(a: Y.Doc, b: Y.Doc) {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)))
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)))
}

describe('pages', () => {
  it('names a new page by the number of pages, skipping taken names', () => {
    expect(nextPageName([{ id: 'a', name: 'Страница 1', order: 'a0' }])).toBe('Страница 2')
    expect(
      nextPageName([
        { id: 'a', name: 'Страница 2', order: 'a0' },
        { id: 'b', name: 'Схема', order: 'a1' },
      ]),
    ).toBe('Страница 3')
    expect(nextPageName([{ id: 'a', name: 'Страница 2', order: 'a0' }])).toBe('Страница 3')
  })

  it('adds a page with its root and layer cells after the given page', () => {
    const doc = board()
    const third = addPage(doc, DEFAULT_PAGE_ID)
    const second = addPage(doc, DEFAULT_PAGE_ID)

    expect(listPages(doc).map((page) => page.id)).toEqual([DEFAULT_PAGE_ID, second, third])
    expect(names(doc)).toEqual(['Страница 1', 'Страница 3', 'Страница 2'])
    expect(getPages(doc).get(second)).toBeInstanceOf(Y.Map)
    expect(Array.from(getCells(doc, second).keys()).sort()).toEqual([ROOT_CELL_ID, LAYER_CELL_ID].sort())
    expect(isPageEmpty(doc, second)).toBe(true)
  })

  it('adds a page at the end without a current page', () => {
    const doc = board()
    const id = addPage(doc, null, 'Схема БД')

    expect(listPages(doc).at(-1)).toMatchObject({ id, name: 'Схема БД' })
  })

  it('renames a page, ignoring empty names', () => {
    const doc = board()

    renamePage(doc, DEFAULT_PAGE_ID, '  Контекст ')
    renamePage(doc, DEFAULT_PAGE_ID, '   ')

    expect(names(doc)).toEqual(['Контекст'])
  })

  it('moves a page to a position', () => {
    const doc = board()
    const second = addPage(doc, DEFAULT_PAGE_ID)
    const third = addPage(doc, second)

    movePage(doc, third, 0)
    expect(listPages(doc).map((page) => page.id)).toEqual([third, DEFAULT_PAGE_ID, second])

    movePage(doc, third, 2)
    expect(listPages(doc).map((page) => page.id)).toEqual([DEFAULT_PAGE_ID, second, third])
  })

  it('keeps both a rename and a move made at the same time', () => {
    const alice = board()
    const second = addPage(alice, DEFAULT_PAGE_ID)
    const bob = new Y.Doc()
    sync(alice, bob)

    renamePage(alice, second, 'Контейнеры')
    movePage(bob, second, 0)
    sync(alice, bob)

    for (const doc of [alice, bob]) {
      expect(listPages(doc)[0]).toMatchObject({ id: second, name: 'Контейнеры' })
    }
  })

  it('duplicates a page with new cell ids and remapped references right after it', () => {
    const doc = board()
    const last = addPage(doc, DEFAULT_PAGE_ID)
    const cells = getCells(doc)
    doc.transact(() => {
      writeCell(cells, cell('a'))
      writeCell(cells, cell('b'))
      writeCell(cells, cell('edge', { kind: 'edge', source: 'a', target: 'b', geometry: { x: 0, y: 0, width: 0, height: 0, relative: true } }))
    })

    const copy = duplicatePage(doc, DEFAULT_PAGE_ID)!

    expect(listPages(doc).map((page) => page.id)).toEqual([DEFAULT_PAGE_ID, copy, last])
    expect(listPages(doc)[1]!.name).toBe('Страница 1 (копия)')
    const copied = getCells(doc, copy)
    const byValue = new Map(Array.from(copied.entries(), ([id, map]) => [readCell(id, map).value, readCell(id, map)]))
    expect(byValue.get('a')!.id).not.toBe('a')
    expect(byValue.get('edge')).toMatchObject({ source: byValue.get('a')!.id, target: byValue.get('b')!.id, parent: LAYER_CELL_ID })
    expect(byValue.get('a')!.style).toEqual({ fillColor: '#dae8fc' })

    // The copy is independent of the original.
    const copiedA = copied.get(byValue.get('a')!.id)!
    doc.transact(() => (copiedA.get('style') as Y.Map<unknown>).set('fillColor', '#f8cecc'))
    expect(readCell('a', cells.get('a')!).style.fillColor).toBe('#dae8fc')
  })

  it('duplicates the layers of a page with their names, locks and visibility, and the cells in their copies', () => {
    const doc = board()
    const cells = getCells(doc)
    doc.transact(() => {
      writeCell(cells, { ...cell(LAYER_CELL_ID), kind: 'layer', parent: ROOT_CELL_ID, order: 'a0', value: 'Бизнес', geometry: null, style: {} })
      writeCell(cells, { ...cell('notes'), kind: 'layer', parent: ROOT_CELL_ID, order: 'a1', value: 'Заметки', geometry: null, style: { codrawHidden: true, locked: true } })
      writeCell(cells, cell('idea', { parent: 'notes' }))
    })

    const copy = duplicatePage(doc, DEFAULT_PAGE_ID, { id: 'bob', name: 'Боб' })!

    const copied = Array.from(getCells(doc, copy).entries(), ([id, map]) => readCell(id, map))
    const layers = copied.filter((data) => data.kind === 'layer').sort((a, b) => (a.order < b.order ? -1 : 1))
    expect(layers.map((layer) => [layer.value, layer.style])).toEqual([
      ['Бизнес', {}],
      ['Заметки', { codrawHidden: true, locked: true }],
    ])
    expect(layers[0]!.id).toBe(LAYER_CELL_ID)
    expect(layers[1]!.id).not.toBe('notes')
    expect(copied.find((data) => data.value === 'idea')!.parent).toBe(layers[1]!.id)
    expect(readAttribution(getCells(doc, copy).get(layers[1]!.id))).toBeNull()
  })

  it('takes a page with empty layers for an empty page', () => {
    const doc = board()
    doc.transact(() => writeCell(getCells(doc), { ...cell('notes'), kind: 'layer', parent: ROOT_CELL_ID, geometry: null }))

    expect(isPageEmpty(doc, DEFAULT_PAGE_ID)).toBe(true)
    doc.transact(() => writeCell(getCells(doc), cell('idea', { parent: 'notes' })))
    expect(isPageEmpty(doc, DEFAULT_PAGE_ID)).toBe(false)
  })

  it('names the participant who duplicates a page in the copies, and the original keeps who changed it', () => {
    const doc = board()
    const cells = getCells(doc)
    doc.transact(() => {
      writeCell(cells, cell('a'))
      writeAttribution(cells.get('a')!, { id: 'alice', name: 'Алиса' }, 1000)
      writeCell(cells, cell('b'))
    })

    const copy = duplicatePage(doc, DEFAULT_PAGE_ID, { id: 'bob', name: 'Боб' })!

    const copied = Array.from(getCells(doc, copy).entries()).filter(
      ([, map]) => !['root', 'layer'].includes(map.get('kind') as string),
    )
    expect(copied).toHaveLength(2)
    for (const [, map] of copied) expect(readAttribution(map)).toMatchObject({ by: 'bob', name: 'Боб' })
    expect(readAttribution(cells.get('a'))).toEqual({ by: 'alice', name: 'Алиса', at: 1000 })
    expect(readAttribution(cells.get('b'))).toBeNull()
  })

  it('gives the copies no status, and the original keeps its status', () => {
    const doc = board()
    const cells = getCells(doc)
    doc.transact(() => {
      writeCell(cells, cell('a'))
      writeStatus(cells.get('a')!, 'done', { id: 'alice', name: 'Алиса' }, 1000)
    })

    const copy = duplicatePage(doc, DEFAULT_PAGE_ID, { id: 'bob', name: 'Боб' })!

    const copied = Array.from(getCells(doc, copy).entries()).find(([id]) => id !== ROOT_CELL_ID && id !== LAYER_CELL_ID)![1]
    expect(readStatus(copied)).toBeNull()
    expect(STATUS_KEYS.filter((key) => copied.has(key))).toEqual([])
    expect(readStatus(cells.get('a'))).toEqual({ status: 'done', by: 'alice', name: 'Алиса', at: 1000 })
  })

  it('gives the copies of cells of elements copies of the elements', () => {
    const doc = board()
    const cells = getCells(doc)
    const style = { [ELEMENT_KEY]: 'e1', codrawName: 'Payments', codrawTechnology: 'Kotlin' }
    doc.transact(() => {
      writeCell(cells, cell('a', { style }))
      writeCell(cells, cell('b', { style }))
    })

    const copy = duplicatePage(doc, DEFAULT_PAGE_ID)!

    const copied = Array.from(getCells(doc, copy).entries())
      .filter(([id]) => id !== ROOT_CELL_ID && id !== LAYER_CELL_ID)
      .map(([id, map]) => readCell(id, map).style)
    const element = copied[0]![ELEMENT_KEY] as string
    expect(element).not.toBe('e1')
    expect(copied).toEqual([
      { ...style, [ELEMENT_KEY]: element },
      { ...style, [ELEMENT_KEY]: element },
    ])
    doc.transact(() => getElements(doc).get(element)!.set('technology', 'Go'))
    expect(readCell('a', cells.get('a')!).style.codrawTechnology).toBe('Kotlin')
  })

  it('gives a copy of a cell whose element is gone a new element id, not the one the original names', () => {
    const doc = board()
    doc.transact(() => writeCell(getCells(doc), cell('a', { style: { [ELEMENT_KEY]: 'e1', codrawName: 'A' } })))
    doc.transact(() => getElements(doc).delete('e1'))

    const copy = duplicatePage(doc, DEFAULT_PAGE_ID)!

    const copied = Array.from(getCells(doc, copy).entries()).find(([id]) => id !== ROOT_CELL_ID && id !== LAYER_CELL_ID)![1]
    expect(readCell('x', copied).style[ELEMENT_KEY]).not.toBe('e1')
    expect(getElements(doc).size).toBe(0)
  })

  it('deletes the elements that only the deleted page shows', () => {
    const doc = board()
    const second = addPage(doc, DEFAULT_PAGE_ID)
    doc.transact(() => {
      writeCell(getCells(doc, second), cell('a', { style: { [ELEMENT_KEY]: 'only', codrawName: 'A' } }))
      writeCell(getCells(doc, second), cell('b', { style: { [ELEMENT_KEY]: 'shared', codrawName: 'B' } }))
      writeCell(getCells(doc), cell('c', { style: { [ELEMENT_KEY]: 'shared', codrawName: 'B' } }))
    })

    deletePage(doc, second)

    expect([...getElements(doc).keys()]).toEqual(['shared'])
  })

  it('deletes a page with its cells but never the last page', () => {
    const doc = board()
    const second = addPage(doc, DEFAULT_PAGE_ID)
    doc.transact(() => writeCell(getCells(doc, second), cell('a')))

    expect(deletePage(doc, second)).toBe(true)
    expect(listPages(doc).map((page) => page.id)).toEqual([DEFAULT_PAGE_ID])
    expect(getCells(doc, second).size).toBe(0)

    expect(deletePage(doc, DEFAULT_PAGE_ID)).toBe(false)
    expect(listPages(doc)).toHaveLength(1)
  })

  it('writes page operations with their own origin', () => {
    const doc = board()
    const origins: unknown[] = []
    doc.on('afterTransaction', (transaction: Y.Transaction) => origins.push(transaction.origin))

    const id = addPage(doc, DEFAULT_PAGE_ID)
    renamePage(doc, id, 'Схема')
    movePage(doc, id, 0)
    duplicatePage(doc, id)
    deletePage(doc, id)

    expect(origins).toEqual(Array(5).fill(PAGES_ORIGIN))
  })
})
