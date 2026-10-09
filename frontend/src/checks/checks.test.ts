import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { ELEMENT_KEY, getCells, initializeDocument, ROOT_CELL_ID, writeCell, type CellData } from '../diagram/model.ts'
import { addPage } from '../diagram/pages.ts'
import { connect } from '../diagram/testing.ts'
import { DiagramBuilder } from '../templates/builder.ts'
import {
  boardChecks,
  CHECKS_ORIGIN,
  issuesLabel,
  readCheckSettings,
  setIssueHidden,
  setRuleEnabled,
  visibleIssues,
  type CheckIssue,
  type CheckRule,
} from './checks.ts'

/** A board of pages, each of the cells a builder made; the first page is the default one. */
function board(...pages: DiagramBuilder[]): { doc: Y.Doc; pageIds: string[] } {
  const doc = new Y.Doc()
  initializeDocument(doc)
  const pageIds = ['page-1']
  for (let index = 1; index < pages.length; index++) pageIds.push(addPage(doc, pageIds.at(-1), `Страница ${index + 1}`))
  doc.transact(() => pages.forEach((builder, index) => builder.build().forEach((cell) => writeCell(getCells(doc, pageIds[index]), cell))))
  return { doc, pageIds }
}

/** A builder whose shapes `ids` are cells of the element `elementId`. */
function sharing(builder: DiagramBuilder, elementId: string, ...ids: string[]): DiagramBuilder {
  const build = builder.build.bind(builder)
  builder.build = (): CellData[] =>
    build().map((cell) => (ids.includes(cell.id) ? { ...cell, style: { ...cell.style, [ELEMENT_KEY]: elementId } } : cell))
  return builder
}

const of = (issues: CheckIssue[], ...rules: CheckRule[]) =>
  issues.filter((issue) => rules.includes(issue.rule)).map((issue) => [issue.rule, issue.subject, issue.detail].filter(Boolean).join(' '))

/** A builder whose shapes and edges `ids` lie in a second layer of the page, over the main one. */
function inLayer(builder: DiagramBuilder, ...ids: string[]): DiagramBuilder {
  const build = builder.build.bind(builder)
  builder.build = (): CellData[] => [
    { id: 'layer-2', kind: 'layer', parent: ROOT_CELL_ID, order: 'b0', value: 'Слой 2', geometry: null, source: null, target: null, style: {} },
    ...build().map((cell) => (ids.includes(cell.id) ? { ...cell, parent: 'layer-2' } : cell)),
  ]
  return builder
}

describe('checks of the architecture', () => {
  it('checks the elements of every layer of a page, connected across the layers', () => {
    const page = new DiagramBuilder()
    const api = page.shape('service', 0, 0, { value: 'API' })
    const db = page.shape('database', 300, 0, { value: 'БД' })
    const edge = page.edge(api, db)
    const alone = page.shape('service', 0, 300, { value: 'Одинокий' })
    const { doc } = board(inLayer(page, db, edge, alone))

    expect(of(boardChecks(doc), 'isolated')).toEqual(['isolated «Одинокий»'])
  })

  it('finds what elements and edges of C4 lack and the elements outside their frames', () => {
    const page = new DiagramBuilder()
    page.shape('c4-boundary', 0, 0, { value: 'Магазин\n[Software System]', width: 800, height: 400 })
    const api = page.shape('c4-container', 40, 60, { value: 'API\n[Container]' })
    const db = page.shape('c4-database', 400, 60, { value: 'БД\n[Container: PostgreSQL]\nЗаказы' })
    page.edge(api, db)
    // Inside the system, but in no container.
    const payments = page.shape('c4-component', 40, 220, { value: 'Платежи\n[Component: Kotlin]\nСписывает деньги' })
    const buyer = page.shape('c4-person', 900, 60, { value: 'Покупатель\n[Person]\nПокупает' })
    page.edge(buyer, api, { value: 'Покупает', technology: 'HTTPS' })
    const { doc } = board(page)

    const issues = boardChecks(doc)

    expect(of(issues, 'edge-label', 'edge-technology', 'technology', 'description', 'isolated', 'nesting')).toEqual([
      'edge-label «API» → «БД»',
      'edge-technology «API» → «БД»',
      'technology «API» Контейнер',
      'description «API»',
      'isolated «Платежи»',
      'nesting «Платежи» Компонент вне границы контейнера',
    ])
    expect(issues.find((issue) => issue.rule === 'nesting')!.places).toEqual([{ pageId: 'page-1', pageName: 'Страница 1', cellId: payments }])
    // Containers have owners; persons and components do not need them.
    expect(of(issues, 'owner')).toEqual(['owner «API»', 'owner «БД»'])
    expect(of(issues, 'cycle', 'shared-database', 'duplicate')).toEqual([])
  })

  it('takes a label of its own on an edge and a technology in brackets for the label and the technology of the edge', () => {
    const page = new DiagramBuilder()
    const web = page.shape('service', 0, 0, { value: 'Web' })
    const api = page.shape('service', 300, 0, { value: 'API' })
    const db = page.shape('database', 600, 0, { value: 'Orders' })
    page.edge(web, api, { value: '[HTTPS]' })
    const edge = page.edge(api, db, { technology: 'JDBC' })
    const cells = page.build()
    cells.push({
      id: 'label',
      kind: 'vertex',
      parent: edge,
      order: 'a0',
      value: 'Пишет заказы',
      geometry: { x: 0, y: 0, width: 0, height: 0, relative: true },
      source: null,
      target: null,
      style: {},
    })
    const doc = new Y.Doc()
    initializeDocument(doc)
    doc.transact(() => cells.forEach((cell) => writeCell(getCells(doc), cell)))

    expect(of(boardChecks(doc), 'edge-label', 'edge-technology')).toEqual(['edge-label «Web» → «API»'])
  })

  it('finds cycles between services and a database of several services, a queue and a person aside', () => {
    const page = new DiagramBuilder()
    const [a, b, c] = ['Заказы', 'Склад', 'Доставка'].map((name, index) => page.shape('service', index * 200, 0, { value: name }))
    const db = page.shape('database', 0, 300, { value: 'Общая БД' })
    const queue = page.shape('queue', 400, 300, { value: 'События' })
    const user = page.shape('user', 0, -200, { value: 'Клиент' })
    page.edge(a!, b!)
    page.edge(b!, c!)
    page.edge(c!, a!)
    page.edge(a!, db)
    page.edge(db, b!)
    // Through a queue and a person no cycle goes, nor does a person use the database.
    page.edge(c!, queue)
    page.edge(queue, a!)
    page.edge(user, a!)
    page.edge(a!, user)
    page.edge(user, db)
    const { doc } = board(page)

    const issues = boardChecks(doc)

    expect(of(issues, 'cycle', 'shared-database')).toEqual([
      'cycle «Заказы» → «Склад» → «Доставка» → «Заказы»',
      'shared-database «Общая БД» В неё ходят «Заказы», «Склад»',
    ])
    expect(issues.find((issue) => issue.rule === 'cycle')!.places.map((place) => place.cellId)).toEqual([a, b, c])
  })

  it('takes the cells of a shared element on all pages for one element, and finds elements of one name as duplicates', () => {
    const first = new DiagramBuilder()
    const payments = first.shape('service', 0, 0, { value: 'Payments' })
    const ledger = first.shape('service', 300, 0, { value: 'Ledger', element: { technology: 'Kotlin' } })
    first.edge(payments, ledger, { value: 'Проводит', technology: 'gRPC' })
    first.shape('service', 0, 300, { value: 'Сервис' })
    const second = new DiagramBuilder()
    // The same element alone on another page, and another «Ledger» and «Сервис».
    const again = second.shape('service', 0, 0, { value: 'Payments' })
    const other = second.shape('service', 300, 0, { value: 'ledger', element: { technology: 'Go' } })
    second.edge(again, other, { value: 'Читает', technology: 'HTTPS' })
    second.shape('service', 0, 300, { value: 'Сервис' })
    const { doc, pageIds } = board(sharing(first, 'pay', payments), sharing(second, 'pay', again))

    const issues = boardChecks(doc)

    const technology = issues.filter((issue) => issue.rule === 'technology' && issue.subject === '«Payments»')
    expect(technology.map((issue) => issue.places.map((place) => [place.pageName, place.cellId]))).toEqual([
      [
        ['Страница 1', payments],
        ['Страница 2', again],
      ],
    ])
    expect(of(issues, 'duplicate')).toEqual(['duplicate «Ledger» Разные элементы на страницах «Страница 1», «Страница 2»'])
    const duplicate = issues.find((issue) => issue.rule === 'duplicate')!
    expect(duplicate.choices!.map((choice) => [choice.ref, choice.properties.technology, choice.pages])).toEqual([
      [{ pageId: pageIds[0], cellId: ledger }, 'Kotlin', 1],
      [{ pageId: pageIds[1], cellId: other }, 'Go', 1],
    ])
    // Connected on one page, the element is connected; it is not isolated on the other.
    expect(issues.filter((issue) => issue.subject === '«Payments»').map((issue) => issue.rule)).toEqual(['technology', 'owner'])
  })

  it('keeps the rules turned off and the remarks hidden in the document, for all participants', () => {
    const page = new DiagramBuilder()
    const api = page.shape('service', 0, 0, { value: 'API' })
    const db = page.shape('database', 300, 0, { value: 'БД', element: { technology: 'PostgreSQL' } })
    page.edge(api, db)
    const { doc } = board(page)
    const other = new Y.Doc()
    connect(doc, other)

    const settings = readCheckSettings(doc)
    expect([...settings.disabled]).toEqual(['owner'])
    const { shown } = visibleIssues(boardChecks(doc), settings)
    expect(shown.map((issue) => issue.rule)).toEqual(['edge-label', 'edge-technology', 'technology'])
    expect(issuesLabel(shown.length)).toBe('3 замечания')

    const origins: unknown[] = []
    doc.on('afterTransaction', (transaction: Y.Transaction) => origins.push(transaction.origin))
    setRuleEnabled(doc, 'edge-technology', false)
    setRuleEnabled(doc, 'owner', true)
    setIssueHidden(doc, shown[0]!.key, true)
    expect(origins).toEqual([CHECKS_ORIGIN, CHECKS_ORIGIN, CHECKS_ORIGIN])

    const theirs = readCheckSettings(other)
    const seen = visibleIssues(boardChecks(other), theirs)
    expect(seen.shown.map((issue) => issue.rule)).toEqual(['technology', 'owner', 'owner'])
    expect(seen.hidden.map((issue) => issue.rule)).toEqual(['edge-label'])

    setIssueHidden(other, shown[0]!.key, false)
    expect(readCheckSettings(doc).hidden.size).toBe(0)
  })
})
