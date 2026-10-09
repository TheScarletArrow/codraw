import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { DiagramBuilder } from '../templates/builder.ts'
import { canDetail, createDetailPage, detailCrumbs, detailLevel, detailPageOf } from './detail.ts'
import { elementProperties } from './elementProps.ts'
import { LINK_KEY, pageLink } from './links.ts'
import { LOCKED_KEY } from './locks.ts'
import { DEFAULT_PAGE_ID, ELEMENT_KEY, getCells, initializeDocument, readCell, writeCell, type CellData } from './model.ts'
import { addPage, listPages } from './pages.ts'
import { findShape, markedStyle, type ShapeStyle } from './shapes.ts'

const style = (id: Parameters<typeof findShape>[0]) => markedStyle(findShape(id)!) as Record<string, unknown>

/** A board whose first page has the cells of the builder, and a page after it. */
function board(builder: DiagramBuilder) {
  const doc = new Y.Doc()
  initializeDocument(doc)
  const last = addPage(doc, DEFAULT_PAGE_ID, 'Деплой')
  doc.transact(() => builder.build().forEach((cell) => writeCell(getCells(doc), cell)))
  return { doc, last }
}

const cellsOf = (doc: Y.Doc, pageId: string): CellData[] =>
  Array.from(getCells(doc, pageId).entries(), ([id, cell]) => readCell(id, cell)).filter((cell) => cell.kind === 'vertex' || cell.kind === 'edge')

describe('detail of an element', () => {
  it('gives systems containers and containers that call others components, and nothing to stores, frames and outsiders', () => {
    expect(detailLevel(style('c4-system'), 'Магазин\n[Software System]')).toBe('containers')
    expect(detailLevel(style('c4-container'), 'API\n[Container]')).toBe('components')
    expect(detailLevel(style('service'), 'Заказы')).toBe('components')
    expect(detailLevel(style('c4-external-system'), 'Банк\n[Software System]')).toBeNull()
    expect(detailLevel(style('database'), 'БД')).toBeNull()
    expect(detailLevel(style('queue'), 'События')).toBeNull()
    expect(detailLevel(style('c4-boundary'), 'Магазин\n[Software System]')).toBeNull()
    expect(detailLevel(style('rectangle'), 'Блок')).toBeNull()
  })

  it('makes the page of a system with its boundary and the elements around it, linked both ways', () => {
    const page = new DiagramBuilder()
    const shop = page.shape('c4-system', 300, 300, { value: 'Магазин\n[Software System]\nПродаёт товары' })
    const buyer = page.shape('c4-person', 300, 0, { value: 'Покупатель\n[Person]\nПокупает' })
    const bank = page.shape('c4-external-system', 700, 300, { value: 'Банк\n[Software System]\nПроводит платежи' })
    const sticky = page.shape('sticky', 0, 0, { value: 'Обсудить' })
    page.edge(buyer, shop, { value: 'Заказывает', technology: 'HTTPS', from: 'bottom', to: 'top' })
    const pays = page.edge(shop, bank, { value: 'Списывает деньги' })
    page.edge(sticky, shop)
    const cells = page.build()
    cells.push({ ...cells.find((cell) => cell.id === pays)!, id: 'label', kind: 'vertex', parent: pays, value: 'async', source: null, target: null, style: {} })
    const doc = new Y.Doc()
    initializeDocument(doc)
    const deploy = addPage(doc, DEFAULT_PAGE_ID, 'Деплой')
    doc.transact(() => cells.forEach((cell) => writeCell(getCells(doc), cell)))
    expect(canDetail(doc, { pageId: DEFAULT_PAGE_ID, cellId: shop })).toBe(true)
    expect(canDetail(doc, { pageId: DEFAULT_PAGE_ID, cellId: bank })).toBe(false)

    let made: ReturnType<typeof createDetailPage> = null
    doc.transact(() => {
      made = createDetailPage(doc, { pageId: DEFAULT_PAGE_ID, cellId: shop })
    })

    const { pageId, changed } = made!
    expect(changed.sort()).toEqual([shop, buyer, bank].sort())
    // Right after the page of the system, named by it and by what it shows.
    expect(listPages(doc).map((item) => [item.id, item.name])).toEqual([
      [DEFAULT_PAGE_ID, 'Страница 1'],
      [pageId, 'Магазин: контейнеры'],
      [deploy, 'Деплой'],
    ])
    const shopCell = readCell(shop, getCells(doc).get(shop)!)
    const element = shopCell.style[ELEMENT_KEY]
    expect(listPages(doc)[1]!.detailOf).toEqual({ pageId: DEFAULT_PAGE_ID, cellId: shop, elementId: element })
    expect(shopCell.style[LINK_KEY]).toBe(pageLink(pageId))

    const detail = cellsOf(doc, pageId)
    const boundary = detail.find((cell) => cell.style.codrawShape === 'c4-boundary')!
    expect(boundary.style[ELEMENT_KEY]).toBe(element)
    expect(boundary.value).toBe('Магазин\n[Software System]')
    expect(elementProperties(boundary.style, boundary.value)).toMatchObject({ name: 'Магазин', description: 'Продаёт товары' })
    expect(boundary.style[LINK_KEY]).toBe(pageLink(DEFAULT_PAGE_ID))

    // The buyer, who calls the system, at the left of the boundary; the bank at the right; no sticky.
    const shapes = detail.filter((cell) => cell.kind === 'vertex' && cell.parent === '1' && cell.id !== boundary.id)
    expect(shapes.map((cell) => cell.value)).toEqual(['Покупатель\n[Person]\nПокупает', 'Банк\n[Software System]\nПроводит платежи'])
    const [buyerCopy, bankCopy] = shapes
    expect(buyerCopy!.style[ELEMENT_KEY]).toBe(readCell(buyer, getCells(doc).get(buyer)!).style[ELEMENT_KEY])
    expect(bankCopy!.style[ELEMENT_KEY]).toBe(readCell(bank, getCells(doc).get(bank)!).style[ELEMENT_KEY])
    expect(buyerCopy!.geometry!.x + buyerCopy!.geometry!.width).toBeLessThan(boundary.geometry!.x)
    expect(bankCopy!.geometry!.x).toBeGreaterThan(boundary.geometry!.x + boundary.geometry!.width)

    // The edges go to the boundary with their labels, technologies and labels of their own, not their old ends.
    const edges = detail.filter((cell) => cell.kind === 'edge')
    expect(edges.map((edge) => [edge.source, edge.target, edge.value, edge.style.codrawTechnology ?? null])).toEqual([
      [buyerCopy!.id, boundary.id, 'Заказывает', 'HTTPS'],
      [boundary.id, bankCopy!.id, 'Списывает деньги', null],
    ])
    expect(edges[0]!.style.exitX).toBeUndefined()
    expect(detail.filter((cell) => cell.parent === edges[1]!.id).map((cell) => cell.value)).toEqual(['async'])

    // Again, the system has its page: the link of the shape, or a page about its element.
    expect(detailPageOf(doc, { pageId: DEFAULT_PAGE_ID, cellId: shop })).toBe(pageId)
    ;(getCells(doc).get(shop)!.get('style') as Y.Map<unknown>).delete(LINK_KEY)
    expect(detailPageOf(doc, { pageId: DEFAULT_PAGE_ID, cellId: shop })).toBe(pageId)
    expect(detailPageOf(doc, { pageId, cellId: boundary.id })).toBeNull()
    expect(detailPageOf(doc, { pageId: DEFAULT_PAGE_ID, cellId: bank })).toBeNull()
  })

  it('leaves a locked neighbour as it is, and makes no page of a locked shape', () => {
    const page = new DiagramBuilder()
    const api = page.shape('service', 0, 0, { value: 'API' })
    const db = page.shape('database', 300, 0, { value: 'БД', style: { [LOCKED_KEY]: true } as ShapeStyle })
    page.edge(api, db, { value: 'Пишет' })
    const { doc } = board(page)
    const lockedBefore = readCell(db, getCells(doc).get(db)!)

    let made: ReturnType<typeof createDetailPage> = null
    doc.transact(() => {
      made = createDetailPage(doc, { pageId: DEFAULT_PAGE_ID, cellId: api })
    })

    expect(made!.changed).toEqual([api])
    expect(readCell(db, getCells(doc).get(db)!)).toEqual(lockedBefore)
    const copy = cellsOf(doc, made!.pageId).find((cell) => cell.value === 'БД')!
    expect(copy.style[ELEMENT_KEY]).toBeUndefined()
    expect(copy.style[LOCKED_KEY]).toBeUndefined()
    expect(listPages(doc).find((item) => item.id === made!.pageId)!.name).toBe('API: компоненты')

    ;(getCells(doc).get(api)!.get('style') as Y.Map<unknown>).set(LOCKED_KEY, true)
    ;(getCells(doc).get(api)!.get('style') as Y.Map<unknown>).delete(LINK_KEY)
    doc.transact(() => expect(createDetailPage(doc, { pageId: DEFAULT_PAGE_ID, cellId: api })).toBeNull())
  })

  it('tells the way down through the pages of detail by the names of the elements', () => {
    const page = new DiagramBuilder()
    const shop = page.shape('c4-system', 0, 0, { value: 'Payments\n[Software System]' })
    const { doc } = board(page)
    let containers = ''
    doc.transact(() => {
      containers = createDetailPage(doc, { pageId: DEFAULT_PAGE_ID, cellId: shop })!.pageId
    })
    doc.transact(() => writeCell(getCells(doc, containers), apiCell()))
    let components = ''
    doc.transact(() => {
      components = createDetailPage(doc, { pageId: containers, cellId: 'api' })!.pageId
    })

    expect(detailCrumbs(doc, components)).toEqual([
      { pageId: DEFAULT_PAGE_ID, label: 'Страница 1' },
      { pageId: containers, label: 'Payments' },
      { pageId: components, label: 'API' },
    ])
    expect(detailCrumbs(doc, DEFAULT_PAGE_ID)).toEqual([])
  })
})

/** A Container of C4 named API with the id `api`. */
function apiCell(): CellData {
  const builder = new DiagramBuilder()
  builder.shape('c4-container', 0, 0, { value: 'API\n[Container: Kotlin]' })
  return { ...builder.build()[0]!, id: 'api' }
}
