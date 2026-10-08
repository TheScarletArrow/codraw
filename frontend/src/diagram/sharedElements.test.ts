import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
  DEFAULT_PAGE_ID,
  ELEMENT_KEY,
  getCells,
  getElements,
  initializeDocument,
  LAYER_CELL_ID,
  readCell,
  writeCell,
  type CellData,
} from './model.ts'
import { addPage } from './pages.ts'
import {
  detachCell,
  elementPlaces,
  elementUses,
  ensureElement,
  healLabels,
  mergeElements,
  relabelElementCells,
  removeElementCells,
} from './sharedElements.ts'
import { edgeData, shapeData } from './testing.ts'

const CONTAINER = { codrawShape: 'c4-container' }
const SERVICE = { codrawShape: 'service' }

/** A board with two pages: «Страница 1» and the page `second`. */
function board() {
  const doc = new Y.Doc()
  initializeDocument(doc)
  const second = addPage(doc, DEFAULT_PAGE_ID)
  return { doc, second }
}

function put(doc: Y.Doc, pageId: string, ...cells: CellData[]) {
  doc.transact(() => cells.forEach((cell) => writeCell(getCells(doc, pageId), cell)))
}

const valueOf = (doc: Y.Doc, pageId: string, id: string) => getCells(doc, pageId).get(id)!.get('value')
const elementOf = (doc: Y.Doc, pageId: string, id: string) => readCell(id, getCells(doc, pageId).get(id)!).style[ELEMENT_KEY]

/** «Payments», a container of C4 on both pages, and a service «Orders» with an endpoint of its own on the second. */
function shared() {
  const { doc, second } = board()
  const payments = { [ELEMENT_KEY]: 'e1', codrawName: 'Payments', codrawKind: 'c4-container', codrawTechnology: 'Kotlin' }
  put(doc, DEFAULT_PAGE_ID, shapeData('a', 'a0', { value: 'Payments\n[Container: Kotlin]', style: { ...CONTAINER, ...payments } }))
  put(
    doc,
    second,
    shapeData('b', 'a0', { value: 'Payments\n[Container: Kotlin]', style: { ...CONTAINER, ...payments, fillColor: '#ff0000' } }),
    shapeData('c', 'a1', { value: 'Orders\nGET /orders', style: { ...SERVICE, [ELEMENT_KEY]: 'e2', codrawName: 'Orders' } }),
  )
  return { doc, second }
}

describe('shared elements', () => {
  it('finds the cells of each element on all pages', () => {
    const { doc, second } = shared()

    expect(elementUses(doc)).toEqual(
      new Map([
        [
          'e1',
          [
            { pageId: DEFAULT_PAGE_ID, cellId: 'a' },
            { pageId: second, cellId: 'b' },
          ],
        ],
        ['e2', [{ pageId: second, cellId: 'c' }]],
      ]),
    )
    expect(elementPlaces(doc, 'e1')).toEqual([
      { pageId: DEFAULT_PAGE_ID, pageName: 'Страница 1', cellIds: ['a'], locked: [] },
      { pageId: second, pageName: 'Страница 2', cellIds: ['b'], locked: [] },
    ])
  })

  it('rewrites the labels of the other cells of an element after its properties changed', () => {
    const { doc, second } = shared()
    const before = getElements(doc).get('e1')!.toJSON()

    doc.transact(() => getElements(doc).get('e1')!.set('name', 'Billing'))
    const changed = relabelElementCells(doc, new Map([['e1', before]]), (ref) => ref.cellId === 'a')

    expect(changed).toEqual([{ pageId: second, cellId: 'b' }])
    expect(valueOf(doc, second, 'b')).toBe('Billing\n[Container: Kotlin]')
    expect(valueOf(doc, DEFAULT_PAGE_ID, 'a')).toBe('Payments\n[Container: Kotlin]')
  })

  it('keeps the lines of its own of each cell, and its showing of the technology', () => {
    const { doc, second } = shared()
    const style = { ...SERVICE, [ELEMENT_KEY]: 'e2', codrawShowTechnology: true }
    put(doc, DEFAULT_PAGE_ID, shapeData('d', 'a1', { value: 'Orders\n[Go]', style: { ...style, codrawName: 'Orders', codrawTechnology: 'Go' } }))
    const before = getElements(doc).get('e2')!.toJSON()

    doc.transact(() => getElements(doc).get('e2')!.set('name', 'Заказы'))
    relabelElementCells(doc, new Map([['e2', before]]))

    expect(valueOf(doc, second, 'c')).toBe('Заказы\nGET /orders')
    expect(valueOf(doc, DEFAULT_PAGE_ID, 'd')).toBe('Заказы\n[Go]')
  })

  it('puts right the labels that do not tell the properties, and leaves the others and labels of HTML', () => {
    const { doc, second } = shared()
    put(doc, second, shapeData('h', 'a2', { value: '<b>Payments</b>', style: { ...CONTAINER, html: 1, [ELEMENT_KEY]: 'e1' } }))
    doc.transact(() => getElements(doc).get('e1')!.set('technology', 'Go'))

    let healed: string[] = []
    doc.transact(() => (healed = healLabels(getCells(doc, second))))

    expect(healed).toEqual(['b'])
    expect(valueOf(doc, second, 'b')).toBe('Payments\n[Container: Go]')
    expect(valueOf(doc, second, 'c')).toBe('Orders\nGET /orders')
    expect(valueOf(doc, second, 'h')).toBe('<b>Payments</b>')
  })

  it('makes a shape without an element one with the properties of its label, and brings back a lost element', () => {
    const { doc } = board()
    put(
      doc,
      DEFAULT_PAGE_ID,
      shapeData('a', 'a0', { value: 'API\n[Container: Java]\nЗаказы', style: CONTAINER }),
      shapeData('lost', 'a1', { value: 'Cache\n[Redis]', style: { codrawShape: 'cache', [ELEMENT_KEY]: 'gone' } }),
      shapeData('t', 'a2', { value: 'orders', style: { codrawShape: 'table', childLayout: 'stackLayout' } }),
    )

    let id: string | null = null
    doc.transact(() => (id = ensureElement(doc, { pageId: DEFAULT_PAGE_ID, cellId: 'a' })))
    doc.transact(() => ensureElement(doc, { pageId: DEFAULT_PAGE_ID, cellId: 'lost' }))

    expect(getElements(doc).get(id!)!.toJSON()).toEqual({
      name: 'API',
      kind: 'c4-container',
      technology: 'Java',
      description: 'Заказы',
    })
    expect(elementOf(doc, DEFAULT_PAGE_ID, 'a')).toBe(id)
    expect(valueOf(doc, DEFAULT_PAGE_ID, 'a')).toBe('API\n[Container: Java]\nЗаказы')
    expect(getElements(doc).get('gone')!.toJSON()).toEqual({ name: 'Cache', kind: 'cache', technology: 'Redis' })
    expect(ensureElement(doc, { pageId: DEFAULT_PAGE_ID, cellId: 't' })).toBeNull()
  })

  it('makes the label of a shape of the palette that becomes an element of its properties, without the words of the palette', () => {
    const { doc } = board()
    put(doc, DEFAULT_PAGE_ID, shapeData('p', 'a0', { value: 'Контейнер\n[Container: технология]\nОписание', style: CONTAINER }))

    doc.transact(() => ensureElement(doc, { pageId: DEFAULT_PAGE_ID, cellId: 'p' }))

    expect(valueOf(doc, DEFAULT_PAGE_ID, 'p')).toBe('Контейнер\n[Container]')
  })

  it('detaches a cell into an element of its own with the same properties', () => {
    const { doc, second } = shared()

    let id: string | null = null
    doc.transact(() => (id = detachCell(doc, { pageId: second, cellId: 'b' })))
    doc.transact(() => getElements(doc).get(id!)!.set('name', 'payments-pod'))

    expect(id).not.toBe('e1')
    expect(getElements(doc).get(id!)!.toJSON()).toMatchObject({ technology: 'Kotlin', kind: 'c4-container' })
    expect(getElements(doc).get('e1')!.get('name')).toBe('Payments')
    expect(elementOf(doc, DEFAULT_PAGE_ID, 'a')).toBe('e1')
  })

  it('drops the element that a detached cell was the last cell of', () => {
    const { doc, second } = shared()

    doc.transact(() => detachCell(doc, { pageId: second, cellId: 'c' }))

    expect(getElements(doc).has('e2')).toBe(false)
  })

  it('merges shapes and all cells of their elements into one element with the properties kept', () => {
    const { doc, second } = shared()
    put(doc, DEFAULT_PAGE_ID, shapeData('p', 'a1', { value: 'payments\n[Container]', style: CONTAINER }))
    put(doc, second, shapeData('q', 'a3', { value: 'Billing\n[Container: Go]', style: { ...CONTAINER, [ELEMENT_KEY]: 'e3', codrawName: 'Billing', codrawKind: 'c4-container', codrawTechnology: 'Go' } }))

    doc.transact(() =>
      mergeElements(
        doc,
        [
          { pageId: DEFAULT_PAGE_ID, cellId: 'a' },
          { pageId: DEFAULT_PAGE_ID, cellId: 'p' },
          { pageId: second, cellId: 'q' },
        ],
        { pageId: DEFAULT_PAGE_ID, cellId: 'a' },
      ),
    )

    for (const [page, id] of [
      [DEFAULT_PAGE_ID, 'a'],
      [DEFAULT_PAGE_ID, 'p'],
      [second, 'b'],
      [second, 'q'],
    ] as const) {
      expect(elementOf(doc, page, id)).toBe('e1')
      expect(valueOf(doc, page, id)).toBe('Payments\n[Container: Kotlin]')
    }
    expect([...getElements(doc).keys()].sort()).toEqual(['e1', 'e2'])
  })

  it('removes the cells of an element from all pages with their edges, and leaves locked cells and the element', () => {
    const { doc, second } = shared()
    put(doc, second, edgeData('flow', 'a4', 'b', 'c'), shapeData('label', 'a0', { parent: 'flow', value: 'HTTPS' }))

    let removed: unknown[] = []
    doc.transact(() => (removed = removeElementCells(doc, 'e1')))

    expect(removed).toEqual([
      { pageId: DEFAULT_PAGE_ID, cellId: 'a' },
      { pageId: second, cellId: 'b' },
      { pageId: second, cellId: 'flow' },
      { pageId: second, cellId: 'label' },
    ])
    expect([...getCells(doc, second).keys()].filter((id) => id !== LAYER_CELL_ID && id !== '0')).toEqual(['c'])
    expect(getElements(doc).has('e1')).toBe(false)
  })

  it('keeps a locked cell when removing an element from all pages, and the element with it', () => {
    const { doc, second } = shared()
    const style = { ...CONTAINER, [ELEMENT_KEY]: 'e1', codrawName: 'Payments', codrawKind: 'c4-container', locked: true }
    put(doc, DEFAULT_PAGE_ID, shapeData('a', 'a0', { value: 'Payments\n[Container: Kotlin]', style: { ...style, codrawTechnology: 'Kotlin' } }))

    expect(elementPlaces(doc, 'e1')[0]!.locked).toEqual(['a'])
    doc.transact(() => removeElementCells(doc, 'e1'))

    expect(getCells(doc, DEFAULT_PAGE_ID).has('a')).toBe(true)
    expect(getCells(doc, second).has('b')).toBe(false)
    expect(getElements(doc).get('e1')!.get('technology')).toBe('Kotlin')
  })
})
