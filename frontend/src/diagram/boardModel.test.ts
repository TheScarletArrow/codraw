import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { DiagramBuilder } from '../templates/builder.ts'
import { ancestry, buildModel, childrenOf, environments, parentCandidates, sliceValues, writeModelField } from './boardModel.ts'
import { getCells, getPages, initializeDocument, writeCell } from './model.ts'
import type { ShapeStyle } from './shapes.ts'
import { boardOf } from './testing.ts'
import { COMPUTED_KEY } from './viewRule.ts'

const names = (doc: Y.Doc, ids: readonly string[]) => {
  const model = buildModel(doc)
  return ids.map((id) => model.elements.get(id)?.properties.name ?? id)
}

describe('the model of a board', () => {
  it('takes the elements and the relations of all pages, and leaves stickers, text and shapes of no level out', () => {
    const context = new DiagramBuilder()
    const buyer = context.shape('c4-person', 0, 0, { value: 'Покупатель\n[Person]' })
    const shop = context.shape('c4-system', 400, 0, { value: 'Магазин\n[Software System]' })
    context.shape('sticky', 0, 400, { value: 'Обсудить' })
    context.shape('rectangle', 400, 400, { value: 'Блок' })
    context.edge(buyer, shop, { value: 'Покупает', technology: 'HTTPS' })
    const stock = new DiagramBuilder()
    const rest = stock.shape('c4-container', 0, 0, { value: 'Остатки\n[Container: Go]' })
    const orders = stock.shape('service', 400, 0, { value: 'Заказы' })
    stock.edge(rest, orders, { value: 'Читает\nзаказы', interaction: 'async' })
    const { doc } = boardOf({ Контекст: context, Склад: stock })

    const model = buildModel(doc)
    expect([...model.elements.values()].map((element) => [element.properties.name, element.level])).toEqual([
      ['Покупатель', 'person'],
      ['Магазин', 'system'],
      ['Остатки', 'container'],
      ['Заказы', 'container'],
    ])
    expect(model.relations.map(({ source, target, label, technology, interaction }) => [source, target, label, technology, interaction])).toEqual([
      [buyer, shop, 'Покупает', 'HTTPS', null],
      [rest, orders, 'Читает заказы', '', 'async'],
    ])
  })

  it('makes one element of the cells of one element on several pages', () => {
    const first = new DiagramBuilder()
    first.shape('c4-system', 0, 0, { element: { name: 'Магазин' } })
    const cells = first.build()
    const element = cells[0]!.style.codrawElement as string
    const second = new DiagramBuilder()
    second.shape('c4-system', 100, 100, { value: 'Магазин\n[Software System]', style: { codrawElement: element } as ShapeStyle })
    const { doc, pages } = boardOf({ А: first, Б: second })
    const model = buildModel(doc)
    expect(model.elements.size).toBe(1)
    expect(model.elements.get(element)!.cells.map((ref) => ref.pageId)).toEqual([pages.А, pages.Б])
  })

  it('places containers in the boundary of their system and components in the boundary of their container', () => {
    const page = new DiagramBuilder()
    const shop = page.shape('c4-boundary', 0, 0, { value: 'Магазин\n[Software System]', width: 1000, height: 600 })
    const api = page.shape('c4-boundary', 40, 60, { value: 'API\n[Container]', width: 500, height: 400 })
    const pay = page.shape('c4-component', 80, 120, { value: 'Оплата\n[Component]' })
    const db = page.shape('database', 700, 100, { value: 'База заказов' })
    const outside = page.shape('service', 1200, 0, { value: 'Почта' })
    const { doc } = boardOf({ Магазин: page })
    const model = buildModel(doc)
    expect(model.elements.get(pay)!.parent).toBe(api)
    expect(model.elements.get(api)!.parent).toBe(shop)
    expect(model.elements.get(db)!.parent).toBe(shop)
    expect(model.elements.get(outside)!.parent).toBeNull()
    expect(model.elements.get(shop)!.parent).toBeNull()
    expect(names(doc, ancestry(model, pay))).toEqual(['Оплата', 'API', 'Магазин'])
    expect(childrenOf(model, shop)).toEqual([api, db])
  })

  it('lets the field «Входит в» win over the drawing, when it names an element of a higher level', () => {
    const page = new DiagramBuilder()
    const shop = page.shape('c4-boundary', 0, 0, { value: 'Магазин\n[Software System]', width: 600, height: 400 })
    const pay = page.shape('c4-system', 1000, 0, { element: { name: 'Платежи' } })
    const gateway = page.shape('c4-container', 40, 60, { element: { name: 'Шлюз' } })
    const person = page.shape('c4-person', 1000, 400, { element: { name: 'Кассир' } })
    const cells = page.build()
    const elementOf = (id: string) => cells.find((cell) => cell.id === id)!.style.codrawElement as string
    const { doc } = boardOf({ Магазин: page })
    doc.transact(() => writeModelField(doc, elementOf(gateway), 'parent', elementOf(pay)))
    let model = buildModel(doc)
    expect(model.elements.get(elementOf(gateway))!.parent).toBe(elementOf(pay))
    expect(model.elements.get(elementOf(gateway))!.drawnParent).toBe(shop)

    // A person is no system: the drawing wins again.
    doc.transact(() => writeModelField(doc, elementOf(gateway), 'parent', elementOf(person)))
    model = buildModel(doc)
    expect(model.elements.get(elementOf(gateway))!.parent).toBe(shop)
    expect(parentCandidates(model, 'container').map((element) => element.properties.name)).toEqual(['Магазин', 'Платежи'])
    expect(parentCandidates(model, 'component').map((element) => element.properties.name)).toEqual(['Магазин', 'Платежи', 'Шлюз'])
  })

  it('takes nodes in nodes, their environments and the containers and systems that run on them', () => {
    const page = new DiagramBuilder()
    const cluster = page.shape('c4-deployment-node', 0, 0, { element: { name: 'k8s-prod' }, width: 1000, height: 700 })
    const namespace = page.shape('c4-deployment-node', 40, 60, { value: 'payments-ns', width: 600, height: 400 })
    const api = page.shape('c4-container', 80, 120, { value: 'API\n[Container]' })
    const db = page.shape('database', 700, 100, { value: 'База' })
    const stage = page.shape('c4-deployment-node', 1200, 0, { element: { name: 'stage' }, width: 600, height: 400 })
    page.shape('c4-container', 1240, 60, { value: 'API\n[Container]' })
    const cells = page.build()
    const elementOf = (id: string) => cells.find((cell) => cell.id === id)!.style.codrawElement as string
    const { doc } = boardOf({ Деплой: page })
    doc.transact(() => {
      writeModelField(doc, elementOf(cluster), 'environment', 'prod')
      writeModelField(doc, elementOf(stage), 'environment', ' stage ')
    })
    const model = buildModel(doc)
    expect(model.elements.get(namespace)!.parent).toBe(elementOf(cluster))
    expect(model.elements.get(namespace)!.environment).toBe('prod')
    expect(model.elements.get(namespace)!.ownEnvironment).toBe('')
    expect(model.elements.get(elementOf(stage))!.environment).toBe('stage')
    expect(model.instances.filter((instance) => instance.node !== elementOf(stage)).map(({ node, element }) => [node, element])).toEqual([
      [namespace, api],
      [elementOf(cluster), db],
    ])
    expect(environments(model)).toEqual(['prod', 'stage'])
  })

  it('leaves the computed cells of views out, but their boundaries frame what is drawn in them', () => {
    const page = new DiagramBuilder()
    page.shape('c4-system', 0, 0, { element: { name: 'Магазин' } })
    const source = page.build()
    const shop = source[0]!.style.codrawElement as string
    const view = new DiagramBuilder()
    const boundary = view.shape('c4-boundary', 0, 0, {
      value: 'Магазин\n[Software System]',
      width: 800,
      height: 500,
      style: { codrawElement: shop, [COMPUTED_KEY]: shop } as ShapeStyle,
    })
    const ghost = view.shape('c4-container', 40, 60, { element: { name: 'Призрак' }, style: { [COMPUTED_KEY]: 'x' } as ShapeStyle })
    const drawn = view.shape('service', 400, 60, { value: 'Уведомления' })
    view.edge(ghost, drawn, { value: 'Пишет' })
    const { doc, pages } = boardOf({ Контекст: new DiagramBuilder(), Вид: view })
    doc.transact(() => source.forEach((cell) => writeCell(getCells(doc, pages.Контекст!), cell)))
    // The page is a view: its rule makes the cells with the key computed ones.
    doc.transact(() => {
      const entry = getPages(doc).get(pages.Вид!) as Y.Map<unknown>
      const viewEntry = new Y.Map<unknown>()
      viewEntry.set('rule', { kind: 'containers', scope: shop })
      entry.set('view', viewEntry)
    })
    const model = buildModel(doc)
    expect([...model.elements.values()].map((element) => element.properties.name)).toEqual(['Магазин', 'Уведомления'])
    expect(model.elements.get(shop)!.cells).toEqual([{ pageId: pages.Контекст, cellId: source[0]!.id }])
    expect(model.elements.get(drawn)!.parent).toBe(shop)
    expect(boundary).toBeTruthy()
    // The edge from a computed cell whose element is no part of the model is no relation.
    expect(model.relations).toEqual([])
  })

  it('offers the teams, tags and technologies of its elements to slices', () => {
    const page = new DiagramBuilder()
    page.shape('c4-container', 0, 0, { element: { name: 'API', owner: 'Платежи', tags: ['pci', 'core'], technology: 'Kotlin' } })
    page.shape('c4-container', 400, 0, { element: { name: 'Отчёты', owner: 'Аналитика', technology: 'Python' } })
    const { doc } = boardOf({ Страница: page })
    expect(sliceValues(buildModel(doc))).toEqual({ owners: ['Аналитика', 'Платежи'], tags: ['core', 'pci'], technologies: ['Kotlin', 'Python'] })
  })

  it('lifts the ends of an edge to the elements they are parts of, as a field of a table or a label is', () => {
    const page = new DiagramBuilder()
    const a = page.shape('service', 0, 0, { value: 'A' })
    const b = page.shape('service', 400, 0, { value: 'B' })
    page.edge(a, b, { value: '' })
    page.edge(a, a, { value: 'сам себе' })
    const cells = page.build()
    cells.push({ id: 'inner', kind: 'vertex', parent: b, order: 'a0', value: 'часть', geometry: { x: 0, y: 0, width: 10, height: 10 }, source: null, target: null, style: { fillColor: 'none', strokeColor: 'none' } })
    cells.push({ id: 'e2', kind: 'edge', parent: '1', order: 'z0', value: 'к части', geometry: null, source: a, target: 'inner', style: {} })
    const doc = new Y.Doc()
    initializeDocument(doc)
    doc.transact(() => cells.forEach((cell) => writeCell(getCells(doc), cell)))
    const model = buildModel(doc)
    expect(model.relations.map(({ source, target, label }) => [source, target, label])).toEqual([
      [a, b, ''],
      [a, b, 'к части'],
    ])
  })
})
