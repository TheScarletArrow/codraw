import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
  DEFAULT_PAGE_ID,
  ELEMENT_KEY,
  getCells,
  getElements,
  initializeDocument,
  LAYER_CELL_ID,
  OWN_LINES_KEY,
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
import { apiGraph, apiSpecCells } from '../apiSpec/apiSpecCells.ts'
import { parseApiSpec } from '../apiSpec/parseApiSpec.ts'
import { ORDERS_ASYNCAPI_YAML, PETSTORE_YAML } from '../apiSpec/testDocuments.ts'
import { importPages } from '../drawio/importPages.ts'
import { BOARD_TEMPLATES, templatePage } from '../templates/templates.ts'
import { connect, edgeData, shapeData } from './testing.ts'

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

  it('keeps the lines of its own of a plain cell aside while the element is of a kind of C4, and gives them back', () => {
    const { doc, second } = shared()
    const style = { ...SERVICE, [ELEMENT_KEY]: 'e2', codrawShowTechnology: true, codrawName: 'Orders', codrawTechnology: 'Go' }
    put(doc, DEFAULT_PAGE_ID, shapeData('d', 'a1', { value: 'Orders\n[Go]\nGET /orders', style }))
    const change = (kind: string) => {
      const before = getElements(doc).get('e2')!.toJSON()
      doc.transact(() => {
        getElements(doc).get('e2')!.set('kind', kind)
        relabelElementCells(doc, new Map([['e2', before]]))
      })
    }

    change('c4-container')
    expect(valueOf(doc, DEFAULT_PAGE_ID, 'd')).toBe('Orders\n[Container: Go]')
    expect(valueOf(doc, second, 'c')).toBe('Orders\n[Container: Go]')
    expect(readCell('d', getCells(doc).get('d')!).style).toMatchObject({ [OWN_LINES_KEY]: 'GET /orders' })

    change('service')
    expect(valueOf(doc, DEFAULT_PAGE_ID, 'd')).toBe('Orders\n[Go]\nGET /orders')
    expect(valueOf(doc, second, 'c')).toBe('Orders\nGET /orders')
    expect(readCell('d', getCells(doc).get('d')!).style).not.toHaveProperty(OWN_LINES_KEY)
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
    // Named by the cell: two participants who do it at the same time make one element.
    expect(id).toBe('a')
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

  it('makes the same element of a shape that two participants paste as the same element at the same time', () => {
    const { doc } = board()
    put(doc, DEFAULT_PAGE_ID, shapeData('p', 'a0', { value: 'Payments\n[Container]', style: CONTAINER }))
    const theirs = new Y.Doc()
    Y.applyUpdate(theirs, Y.encodeStateAsUpdate(doc))
    const network = connect(doc, theirs)
    network.disconnect()

    doc.transact(() => ensureElement(doc, { pageId: DEFAULT_PAGE_ID, cellId: 'p' }))
    theirs.transact(() => ensureElement(theirs, { pageId: DEFAULT_PAGE_ID, cellId: 'p' }))
    network.reconnect()

    for (const each of [doc, theirs]) {
      expect(elementOf(each, DEFAULT_PAGE_ID, 'p')).toBe('p')
      expect(getElements(each).get('p')!.toJSON()).toEqual({ name: 'Payments', kind: 'c4-container' })
    }
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

  it('keeps a cell when removing an element from all pages if a locked edge ends at it or it holds a locked cell', () => {
    const { doc, second } = shared()
    put(
      doc,
      DEFAULT_PAGE_ID,
      shapeData('db', 'a1', { value: 'БД' }),
      edgeData('flow', 'a2', 'a', 'db', { style: { locked: true } }),
    )
    put(doc, second, shapeData('inner', 'a0', { parent: 'b', value: 'Внутри', style: { locked: true } }))

    expect(elementPlaces(doc, 'e1').map((place) => place.locked)).toEqual([['a'], ['b']])
    doc.transact(() => removeElementCells(doc, 'e1'))

    expect(getCells(doc).has('a')).toBe(true)
    expect(getCells(doc).has('flow')).toBe(true)
    expect(getCells(doc, second).has('inner')).toBe(true)
    expect(getElements(doc).has('e1')).toBe(true)
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

describe('labels of boards made by CoDraw', () => {
  it('puts nothing right on the boards of the templates: their labels tell the properties of their elements', () => {
    for (const template of BOARD_TEMPLATES) {
      const doc = new Y.Doc()
      const [page] = importPages(doc, [templatePage(template)])
      let healed: string[] = []
      doc.transact(() => (healed = healLabels(getCells(doc, page!))))
      expect({ template: template.id, healed }).toEqual({ template: template.id, healed: [] })
    }
  })

  it('puts nothing right on services and topics imported from OpenAPI and AsyncAPI', async () => {
    const specs = await Promise.all(
      [PETSTORE_YAML, ORDERS_ASYNCAPI_YAML].map((text, index) => parseApiSpec({ name: `api${index}.yaml`, text })),
    )
    const doc = board().doc
    put(doc, DEFAULT_PAGE_ID, ...(await apiSpecCells(apiGraph(specs, { models: true }), { x: 0, y: 0 })))

    let healed: string[] = []
    doc.transact(() => (healed = healLabels(getCells(doc))))

    expect(getElements(doc).size).toBeGreaterThan(0)
    expect(healed).toEqual([])
  })
})
