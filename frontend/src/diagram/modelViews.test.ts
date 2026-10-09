import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { DiagramBuilder } from '../templates/builder.ts'
import { buildModel, writeModelField } from './boardModel.ts'
import { ELEMENT_STYLE_KEYS } from './model.ts'
import { LOCKED_KEY } from './locks.ts'
import {
  DEFAULT_PAGE_ID,
  ELEMENT_KEY,
  getCells,
  getElements,
  getPages,
  isElementStyleKey,
  readCell,
  readPage,
  writeCell,
  type CellData,
} from './model.ts'
import {
  createViewPage,
  detachView,
  hideOnView,
  keysHiddenByRemoval,
  showOnView,
  summaryLabel,
  syncView,
  syncViews,
  VIEW_ORIGIN,
  viewContents,
  viewOf,
  writeViewRule,
} from './modelViews.ts'
import { addPage } from './pages.ts'
import { boardOf } from './testing.ts'
import { COMPUTED_KEY, type ViewRule } from './viewRule.ts'

const rule = (changes: Partial<ViewRule>): ViewRule => ({ kind: 'landscape', scope: null, environment: null, owners: [], tags: [], technologies: [], ...changes })

/** The cells of a page that are no layer nor root. */
const cellsOf = (doc: Y.Doc, pageId: string): CellData[] =>
  Array.from(getCells(doc, pageId).entries(), ([id, cell]) => readCell(id, cell)).filter((cell) => cell.kind === 'vertex' || cell.kind === 'edge')

const shapeNames = (doc: Y.Doc, pageId: string) =>
  cellsOf(doc, pageId)
    .filter((cell) => cell.kind === 'vertex')
    .map((cell) => String(cell.style[ELEMENT_STYLE_KEYS.name] ?? cell.value.split('\n')[0]))
    .sort()

/** The edges of a page as «source → target: label». */
function edgeLabels(doc: Y.Doc, pageId: string): string[] {
  const cells = cellsOf(doc, pageId)
  const name = (id: string | null) => {
    const cell = cells.find((candidate) => candidate.id === id)
    return cell ? String(cell.style[ELEMENT_STYLE_KEYS.name] ?? cell.value.split('\n')[0]) : '?'
  }
  return cells
    .filter((cell) => cell.kind === 'edge')
    .map((cell) => `${name(cell.source)} → ${name(cell.target)}: ${cell.value}`)
    .sort()
}

/** The first cell of a page of the element `element`. */
const cellOf = (doc: Y.Doc, pageId: string, element: string) =>
  Array.from(getCells(doc, pageId).entries()).find(([, cell]) => readCell('x', cell).style[ELEMENT_KEY] === element)![0]

const boxOf = (doc: Y.Doc, pageId: string, name: string) => {
  const cell = cellsOf(doc, pageId).find((candidate) => candidate.kind === 'vertex' && candidate.style[ELEMENT_STYLE_KEYS.name] === name)
  return cell?.geometry ?? null
}

/** The style keys that make another cell a cell of the element of `cell`, with its properties. */
const sameElement = (cell: CellData) =>
  Object.fromEntries(Object.entries(cell.style).filter(([key]) => key === ELEMENT_KEY || isElementStyleKey(key)))

/** A shop: a person who uses its API, the API with a component calling a bank, and a database. */
function shop() {
  const context = new DiagramBuilder()
  const buyer = context.shape('c4-person', 0, 0, { element: { name: 'Покупатель' } })
  const shopSystem = context.shape('c4-system', 600, 0, { element: { name: 'Магазин' } })
  const bank = context.shape('c4-external-system', 1200, 0, { element: { name: 'Банк' } })
  const containers = new DiagramBuilder()
  const cells = context.build()
  const elementOf = (id: string) => cells.find((cell) => cell.id === id)!.style[ELEMENT_KEY] as string
  // Another cell of the same element carries its properties, as every cell of an element does.
  const same = (id: string) => sameElement(cells.find((cell) => cell.id === id)!) as never
  const boundary = containers.shape('c4-boundary', 0, 0, {
    value: 'Магазин\n[Software System]',
    width: 1000,
    height: 600,
    style: same(shopSystem),
  })
  const api = containers.shape('c4-container', 40, 80, { element: { name: 'API', owner: 'Платежи', tags: ['pci'] } })
  const db = containers.shape('c4-database', 500, 80, { element: { name: 'База заказов', owner: 'Склад' } })
  const pay = containers.shape('c4-component', 60, 400, { element: { name: 'Оплата' } })
  const buyerCopy = containers.shape('c4-person', -600, 0, { value: 'Покупатель\n[Person]', style: same(buyer) })
  const bankCopy = containers.shape('c4-external-system', 1400, 0, { value: 'Банк\n[Software System]', style: same(bank) })
  containers.edge(buyerCopy, api, { value: 'Покупает', technology: 'HTTPS' })
  containers.edge(api, db, { value: 'Пишет заказы', technology: 'JDBC' })
  containers.edge(pay, bankCopy, { value: 'Списывает', technology: 'HTTPS' })
  containers.edge(api, bankCopy, { value: 'Возвращает', technology: 'gRPC' })
  const built = containers.build()
  const element = (id: string) => (built.find((cell) => cell.id === id)?.style[ELEMENT_KEY] as string) ?? id
  // «Оплата» is drawn inside the API: it is a component of it, a part of its own frame.
  const page = boardOf({ Контекст: new DiagramBuilder(), Контейнеры: new DiagramBuilder() })
  page.doc.transact(() => {
    cells.forEach((cell) => writeCell(getCells(page.doc, page.pages.Контекст!), cell))
    built.forEach((cell) => writeCell(getCells(page.doc, page.pages.Контейнеры!), cell))
  })
  page.doc.transact(() => writeModelField(page.doc, element(pay), 'parent', element(api)))
  return {
    ...page,
    ids: {
      buyer: elementOf(buyer),
      shop: elementOf(shopSystem),
      bank: elementOf(bank),
      api: element(api),
      db: element(db),
      pay: element(pay),
      boundary,
    },
  }
}

describe('what a view shows', () => {
  it('shows people and systems on the landscape, with the relations of their parts lifted to them', () => {
    const { doc, ids } = shop()
    const contents = viewContents(buildModel(doc), rule({ kind: 'landscape' }))
    expect(contents.items.map((item) => item.element).sort()).toEqual([ids.bank, ids.buyer, ids.shop].sort())
    expect(contents.edges.map((edge) => [edge.source, edge.target, edge.label, edge.technology])).toEqual(
      [
        [ids.buyer, ids.shop, 'Покупает', 'HTTPS'],
        [ids.shop, ids.bank, 'Списывает; Возвращает', 'HTTPS, gRPC'],
      ].sort((a, b) => (`${a[0]}>${a[1]}` < `${b[0]}>${b[1]}` ? -1 : 1)),
    )
  })

  it('shows a system and what it is connected to in its context', () => {
    const { doc, ids } = shop()
    const contents = viewContents(buildModel(doc), rule({ kind: 'context', scope: ids.shop }))
    expect(contents.items.map((item) => [item.element, item.role])).toEqual([
      [ids.shop, 'scope'],
      [ids.buyer, 'neighbor'],
      [ids.bank, 'neighbor'],
    ])
  })

  it('shows the containers of a system in its boundary, and the neighbours of the containers', () => {
    const { doc, ids } = shop()
    const contents = viewContents(buildModel(doc), rule({ kind: 'containers', scope: ids.shop }))
    // The boundary is an item of its own, apart from the shape of the system on other views.
    const boundary = `${ids.shop}~${ids.shop}`
    expect(contents.items.map((item) => [item.key, item.role, item.frame])).toEqual([
      [boundary, 'scope', null],
      [`${ids.shop}~${ids.api}`, 'member', boundary],
      [`${ids.shop}~${ids.db}`, 'member', boundary],
      [ids.buyer, 'neighbor', null],
      [ids.bank, 'neighbor', null],
    ])
    expect(contents.edges.map((edge) => edge.label).sort()).toEqual(['Пишет заказы', 'Покупает', 'Списывает; Возвращает'])
  })

  it('shows the components of a container, the other containers of its system and the systems around', () => {
    const { doc, ids } = shop()
    const contents = viewContents(buildModel(doc), rule({ kind: 'components', scope: ids.api }))
    // The other container of the shop is a container, the person and the bank are themselves; what calls the container
    // itself goes to its boundary.
    expect(contents.items.map((item) => [item.element, item.role])).toEqual([
      [ids.api, 'scope'],
      [ids.pay, 'member'],
      [ids.buyer, 'neighbor'],
      [ids.db, 'neighbor'],
      [ids.bank, 'neighbor'],
    ])
    expect(contents.edges.map((edge) => edge.label).sort()).toEqual(['Возвращает', 'Пишет заказы', 'Покупает', 'Списывает'])
  })

  it('keeps by a slice only what has its values, and always what the view is about', () => {
    const { doc, ids } = shop()
    const model = buildModel(doc)
    const team = viewContents(model, rule({ kind: 'containers', scope: ids.shop, owners: ['Платежи'] }))
    expect(team.items.map((item) => item.element)).toEqual([ids.shop, ids.api])
    const tagged = viewContents(model, rule({ kind: 'landscape', tags: ['pci'] }))
    expect(tagged.items).toEqual([])
  })

  it('makes a summary of three labels at most', () => {
    const relation = (label: string) => ({ id: label, source: 'a', target: 'b', label, technology: '', interaction: null, edge: { pageId: 'p', cellId: label } })
    expect(summaryLabel(['Читает', 'Пишет', 'Читает', ''].map(relation))).toBe('Читает; Пишет')
    expect(summaryLabel(['a', 'b', 'c', 'd', 'e'].map(relation))).toBe('a; b; c; и ещё 2')
  })

  it('shows the nodes of an environment with what runs on them, and joins the instances by the relations', () => {
    const { doc, ids, pages } = shop()
    const deploy = new DiagramBuilder()
    const cluster = deploy.shape('c4-deployment-node', 0, 0, { element: { name: 'k8s-prod' }, width: 1200, height: 800 })
    const ns = deploy.shape('c4-deployment-node', 40, 80, { element: { name: 'shop-ns' }, width: 800, height: 500 })
    const of = (id: string) => sameElement(readCell(id, getCells(doc, pages.Контейнеры!).get(cellOf(doc, pages.Контейнеры!, id))!)) as never
    deploy.shape('c4-container', 80, 160, { value: 'API\n[Container]', style: of(ids.api) })
    deploy.shape('c4-database', 400, 160, { value: 'База заказов\n[Container]', style: of(ids.db) })
    const stage = deploy.shape('c4-deployment-node', 2000, 0, { element: { name: 'stage' }, width: 600, height: 400 })
    deploy.shape('c4-container', 2040, 80, { value: 'API\n[Container]', style: of(ids.api) })
    const cells = deploy.build()
    const element = (id: string) => cells.find((cell) => cell.id === id)!.style[ELEMENT_KEY] as string
    const page = addPage(doc, pages.Контейнеры!, 'Деплой')
    doc.transact(() => cells.forEach((cell) => writeCell(getCells(doc, page), cell)))
    doc.transact(() => {
      writeModelField(doc, element(cluster), 'environment', 'prod')
      writeModelField(doc, element(stage), 'environment', 'stage')
    })
    const contents = viewContents(buildModel(doc), rule({ kind: 'deployment', environment: 'prod' }))
    expect(contents.items.map((item) => [item.key, item.role, item.frame])).toEqual([
      [element(cluster), 'node', null],
      [`${element(cluster)}~${element(ns)}`, 'node', element(cluster)],
      [`${element(ns)}~${ids.api}`, 'instance', `${element(cluster)}~${element(ns)}`],
      [`${element(ns)}~${ids.db}`, 'instance', `${element(cluster)}~${element(ns)}`],
    ])
    expect(contents.edges.map((edge) => [edge.source, edge.target, edge.label])).toEqual([[`${element(ns)}~${ids.api}`, `${element(ns)}~${ids.db}`, 'Пишет заказы']])
  })
})

describe('the cells of a view', () => {
  it('makes a page of the containers of a system: the boundary with the containers in it, the neighbours, the edges', () => {
    const { doc, ids, pages } = shop()
    const view = createViewPage(doc, pages.Контейнеры!, rule({ kind: 'containers', scope: ids.shop }), 'Магазин: контейнеры')
    expect(readPage(getPages(doc).get(view)!).view?.rule).toMatchObject({ kind: 'containers', scope: ids.shop })
    expect(shapeNames(doc, view)).toEqual(['API', 'База заказов', 'Банк', 'Магазин', 'Покупатель'])
    expect(edgeLabels(doc, view)).toEqual(['API → База заказов: Пишет заказы', 'API → Банк: Списывает; Возвращает', 'Покупатель → API: Покупает'])
    // Cells of the same elements, computed; the boundary holds the containers.
    const cells = cellsOf(doc, view)
    expect(cells.every((cell) => typeof cell.style[COMPUTED_KEY] === 'string')).toBe(true)
    const boundary = cells.find((cell) => cell.style.codrawShape === 'c4-boundary')!
    expect(boundary.style[ELEMENT_KEY]).toBe(ids.shop)
    expect(boundary.value).toBe('Магазин\n[Software System]')
    const api = boxOf(doc, view, 'API')!
    const frame = boundary.geometry!
    expect(api.x).toBeGreaterThan(frame.x)
    expect(api.x + api.width).toBeLessThan(frame.x + frame.width)
    expect(api.y + api.height).toBeLessThan(frame.y + frame.height)
    // The person who calls stands at the left of the boundary, the bank at its right.
    expect(boxOf(doc, view, 'Покупатель')!.x).toBeLessThan(frame.x)
    expect(boxOf(doc, view, 'Банк')!.x).toBeGreaterThan(frame.x + frame.width)
    // The computed edge has the technologies of its relations.
    const edge = cells.find((cell) => cell.kind === 'edge' && cell.value.startsWith('Списывает'))!
    expect(edge.style.codrawTechnology).toBe('HTTPS, gRPC')
  })

  it('follows a new container drawn on another page, and leaves the places of the others', () => {
    const { doc, ids, pages } = shop()
    const view = createViewPage(doc, pages.Контейнеры!, rule({ kind: 'containers', scope: ids.shop }), 'Вид')
    const before = boxOf(doc, view, 'API')
    const more = new DiagramBuilder()
    more.shape('service', 600, 400, { element: { name: 'Склад' } })
    doc.transact(() => more.build().forEach((cell) => writeCell(getCells(doc, pages.Контейнеры!), cell)))
    doc.transact(() => syncViews(doc), VIEW_ORIGIN)
    expect(shapeNames(doc, view)).toContain('Склад')
    expect(boxOf(doc, view, 'API')).toEqual(before)
    const frame = cellsOf(doc, view).find((cell) => cell.style.codrawShape === 'c4-boundary')!.geometry!
    const store = boxOf(doc, view, 'Склад')!
    expect(store.x + store.width).toBeLessThanOrEqual(frame.x + frame.width)
    expect(store.y + store.height).toBeLessThanOrEqual(frame.y + frame.height)
  })

  it('puts an element that left the view back where it stood', () => {
    const { doc, ids, pages } = shop()
    const view = createViewPage(doc, pages.Контейнеры!, rule({ kind: 'landscape', tags: ['vip'] }), 'Вид')
    expect(shapeNames(doc, view)).toEqual([])
    // The tag brings the bank in; it is moved; the tag goes; the tag comes back.
    const tag = (tags: string[]) => doc.transact(() => getElements(doc).get(ids.bank)!.set('tags', tags))
    tag(['vip'])
    doc.transact(() => syncViews(doc), VIEW_ORIGIN)
    const cell = cellsOf(doc, view).find((candidate) => candidate.style[ELEMENT_KEY] === ids.bank)!
    doc.transact(() => getCells(doc, view).get(cell.id)!.set('geometry', { ...cell.geometry!, x: 777, y: 333 }))
    tag([])
    doc.transact(() => syncViews(doc), VIEW_ORIGIN)
    expect(shapeNames(doc, view)).toEqual([])
    tag(['vip'])
    doc.transact(() => syncViews(doc), VIEW_ORIGIN)
    expect(boxOf(doc, view, 'Банк')).toMatchObject({ x: 777, y: 333 })
  })

  it('leaves what was drawn on the view, which is a part of the model, and gives it no computed cell', () => {
    const { doc, ids, pages } = shop()
    const view = createViewPage(doc, pages.Контейнеры!, rule({ kind: 'containers', scope: ids.shop }), 'Вид')
    const frame = cellsOf(doc, view).find((cell) => cell.style.codrawShape === 'c4-boundary')!.geometry!
    const drawn = new DiagramBuilder()
    const sticker = drawn.shape('sticky', frame.x - 400, frame.y, { value: 'Обсудить' })
    const mail = drawn.shape('service', frame.x + 60, frame.y + frame.height - 140, { value: 'Уведомления' })
    doc.transact(() => drawn.build().forEach((cell) => writeCell(getCells(doc, view), cell)))
    doc.transact(() => syncViews(doc), VIEW_ORIGIN)
    expect(getCells(doc, view).has(sticker)).toBe(true)
    expect(getCells(doc, view).has(mail)).toBe(true)
    const model = buildModel(doc)
    expect(model.elements.get(mail)!.parent).toBe(ids.shop)
    // Only the drawn cell shows it.
    expect(cellsOf(doc, view).filter((cell) => cell.value === 'Уведомления')).toHaveLength(1)
    // Another rule leaves the sticker.
    doc.transact(() => writeViewRule(doc, view, rule({ kind: 'landscape' })))
    doc.transact(() => syncViews(doc), VIEW_ORIGIN)
    expect(getCells(doc, view).has(sticker)).toBe(true)
  })

  it('makes the shapes of a kind elements to show them, and leaves the locked ones out', () => {
    const page = new DiagramBuilder()
    const a = page.shape('c4-system', 0, 0, { value: 'Склад\n[Software System]' })
    const b = page.shape('c4-system', 600, 0, { value: 'Бухгалтерия\n[Software System]', style: { [LOCKED_KEY]: true } as never })
    page.edge(a, b, { value: 'Отчёты' })
    const { doc, pages } = boardOf({ Контекст: page })
    const view = createViewPage(doc, pages.Контекст!, rule({ kind: 'landscape' }), 'Ландшафт')
    expect(shapeNames(doc, view)).toEqual(['Склад'])
    expect(readCell(a, getCells(doc).get(a)!).style[ELEMENT_KEY]).toBe(a)
    expect(readCell(b, getCells(doc).get(b)!).style[ELEMENT_KEY]).toBeUndefined()
  })

  it('leaves locked computed cells, keeps a computed cell an edge is drawn to as a drawn one, and removes doubles', () => {
    const { doc, ids, pages } = shop()
    const view = createViewPage(doc, pages.Контейнеры!, rule({ kind: 'context', scope: ids.shop }), 'Вид')
    const cells = getCells(doc, view)
    const of = (element: string) => cellsOf(doc, view).find((cell) => cell.kind === 'vertex' && cell.style[ELEMENT_KEY] === element)!
    const bank = of(ids.bank)
    const buyer = of(ids.buyer)
    // A note with an edge to the bank; the buyer locked; a double of the shop.
    const note = new DiagramBuilder()
    const sticker = note.shape('sticky', 0, 900, { value: 'Банк меняется' })
    const built = note.build()
    doc.transact(() => {
      built.forEach((cell) => writeCell(cells, cell))
      writeCell(cells, { id: 'note-edge', kind: 'edge', parent: '1', order: 'zz', value: '', geometry: null, source: sticker, target: bank.id, style: {} })
      ;(cells.get(buyer.id)!.get('style') as Y.Map<unknown>).set(LOCKED_KEY, true)
      const shopCell = of(ids.shop)
      writeCell(cells, { ...shopCell, id: 'double' })
    })
    // Nothing is around the shop any longer: its relations go.
    doc.transact(() => {
      for (const page of [pages.Контейнеры!]) {
        const pageCells = getCells(doc, page)
        for (const [id, cell] of Array.from(pageCells.entries())) if (cell.get('kind') === 'edge') pageCells.delete(id)
      }
    })
    doc.transact(() => syncViews(doc), VIEW_ORIGIN)
    expect(cells.has(buyer.id)).toBe(true)
    expect(cells.has(bank.id)).toBe(true)
    expect(readCell(bank.id, cells.get(bank.id)!).style[COMPUTED_KEY]).toBeUndefined()
    expect(cellsOf(doc, view).filter((cell) => cell.style[ELEMENT_KEY] === ids.shop)).toHaveLength(1)
  })

  it('hides what is removed from the view, and shows it again where it stood', () => {
    const { doc, ids, pages } = shop()
    const view = createViewPage(doc, pages.Контейнеры!, rule({ kind: 'containers', scope: ids.shop }), 'Вид')
    const cells = getCells(doc, view)
    const db = cellsOf(doc, view).find((cell) => cell.kind === 'vertex' && cell.style[ELEMENT_KEY] === ids.db)!
    const edges = cellsOf(doc, view).filter((cell) => cell.kind === 'edge' && (cell.source === db.id || cell.target === db.id))
    const removed = [db.id, ...edges.map((edge) => edge.id)]
    const { keys, places } = keysHiddenByRemoval(cells, removed)
    // The edges go with their end: only the database is hidden.
    expect(keys).toEqual([db.style[COMPUTED_KEY]])
    doc.transact(() => {
      removed.forEach((id) => cells.delete(id))
      hideOnView(doc, view, keys, places)
    })
    doc.transact(() => syncViews(doc), VIEW_ORIGIN)
    expect(shapeNames(doc, view)).not.toContain('База заказов')
    expect(viewOf(doc, view)!.hidden).toEqual(keys)
    doc.transact(() => showOnView(doc, view, 'all'))
    doc.transact(() => syncViews(doc), VIEW_ORIGIN)
    expect(boxOf(doc, view, 'База заказов')).toEqual(db.geometry)
    expect(edgeLabels(doc, view)).toContain('API → База заказов: Пишет заказы')
  })

  it('draws the system as a shape on another rule, and as its boundary again where it stood', () => {
    const { doc, ids, pages } = shop()
    const view = createViewPage(doc, pages.Контейнеры!, rule({ kind: 'containers', scope: ids.shop }), 'Вид')
    const boundary = () => cellsOf(doc, view).find((cell) => cell.style[ELEMENT_KEY] === ids.shop)!
    const frame = boundary().geometry
    expect(boundary().style.codrawShape).toBe('c4-boundary')
    doc.transact(() => writeViewRule(doc, view, rule({ kind: 'landscape' })))
    doc.transact(() => syncViews(doc), VIEW_ORIGIN)
    expect(boundary().style.codrawShape).toBe('c4-system')
    doc.transact(() => writeViewRule(doc, view, rule({ kind: 'containers', scope: ids.shop })))
    doc.transact(() => syncViews(doc), VIEW_ORIGIN)
    expect(boundary().style.codrawShape).toBe('c4-boundary')
    expect(boundary().geometry).toEqual(frame)
  })

  it('stops following the model once the page is a page of its own again', () => {
    const { doc, ids, pages } = shop()
    const view = createViewPage(doc, pages.Контейнеры!, rule({ kind: 'containers', scope: ids.shop }), 'Вид')
    doc.transact(() => detachView(doc, view))
    expect(viewOf(doc, view)).toBeNull()
    expect(cellsOf(doc, view).some((cell) => cell.style[COMPUTED_KEY] !== undefined)).toBe(false)
    const more = new DiagramBuilder()
    more.shape('service', 600, 400, { element: { name: 'Склад' } })
    doc.transact(() => more.build().forEach((cell) => writeCell(getCells(doc, pages.Контейнеры!), cell)))
    doc.transact(() => syncViews(doc), VIEW_ORIGIN)
    expect(shapeNames(doc, view)).not.toContain('Склад')
  })

  it('writes the same cells under the same ids for two participants who keep a view at the same time', () => {
    const { doc, ids, pages } = shop()
    const view = createViewPage(doc, pages.Контейнеры!, rule({ kind: 'containers', scope: ids.shop }), 'Вид')
    const other = new Y.Doc()
    Y.applyUpdate(other, Y.encodeStateAsUpdate(doc))
    const more = new DiagramBuilder()
    more.shape('service', 600, 400, { element: { name: 'Склад' } })
    const cells = more.build()
    for (const copy of [doc, other]) {
      copy.transact(() => cells.forEach((cell) => writeCell(getCells(copy, pages.Контейнеры!), cell)))
      copy.transact(() => syncView(copy, view, buildModel(copy)), VIEW_ORIGIN)
    }
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(other))
    Y.applyUpdate(other, Y.encodeStateAsUpdate(doc))
    expect(cellsOf(doc, view).filter((cell) => cell.value.startsWith('Склад'))).toHaveLength(1)
    expect(shapeNames(other, view)).toEqual(shapeNames(doc, view))
  })

  it('draws nothing for a view whose element is gone', () => {
    const { doc, ids, pages } = shop()
    const view = createViewPage(doc, pages.Контейнеры!, rule({ kind: 'components', scope: ids.api }), 'Вид')
    expect(shapeNames(doc, view)).toEqual(['API', 'База заказов', 'Банк', 'Оплата', 'Покупатель'])
    doc.transact(() => syncView(doc, view, { ...buildModel(doc), elements: new Map() }))
    expect(shapeNames(doc, view)).toEqual([])
    expect(syncView(doc, DEFAULT_PAGE_ID, buildModel(doc))).toEqual([])
  })
})
