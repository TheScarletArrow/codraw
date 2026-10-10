import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { createDiagramEditor, type DiagramEditor } from '../diagram/editor.ts'
import { elementProperties } from '../diagram/elementProps.ts'
import { ELEMENT_KEY, getElements, initializeDocument, LAYER_CELL_ID, type CellData } from '../diagram/model.ts'
import { TABLE_HEADER_HEIGHT } from '../diagram/shapes.ts'
import { relationOf } from '../diagram/useCase.ts'
import { setLocale } from '../i18n/i18n.ts'
import { DiagramBuilder } from './builder.ts'
import { BOARD_TEMPLATES, templatePage, type TemplateId } from './templates.ts'

const template = (id: TemplateId) => BOARD_TEMPLATES.find((candidate) => candidate.id === id)!

describe('templates', () => {
  it('builds shapes of the palette, tables with fields and edges, ordered as they were added', () => {
    const diagram = new DiagramBuilder()
    const service = diagram.shape('service', 10, 20, { value: 'API' })
    const table = diagram.table('users', 200, 20, ['id uuid PK', 'email text'])
    diagram.edge(service, table.fields[0]!, { style: { endArrow: 'ERmandOne' } })

    const cells = diagram.build()

    const [api, users, id, email, edge] = cells as [CellData, CellData, CellData, CellData, CellData]
    expect(api).toMatchObject({ value: 'API', parent: LAYER_CELL_ID, geometry: { x: 10, y: 20, width: 120, height: 60 } })
    expect(api.style).toMatchObject({ rounded: true, codrawShape: 'service' })
    expect(users.style).toMatchObject({ codrawShape: 'table', childLayout: 'stackLayout' })
    expect(users.geometry!.height).toBe(TABLE_HEADER_HEIGHT + 2 * id.geometry!.height)
    expect([id.parent, email.parent]).toEqual([users.id, users.id])
    expect(id.order < email.order).toBe(true)
    expect(edge).toMatchObject({ kind: 'edge', source: api.id, target: id.id, style: { endArrow: 'ERmandOne' } })
  })

  it('gives every build new ids', () => {
    const ids = (cells: CellData[]) => new Set(cells.map((cell) => cell.id))
    const first = ids(template('er').build())
    const second = ids(template('er').build())

    expect([...first].some((id) => second.has(id))).toBe(false)
  })

  it('connects only cells of the template', () => {
    for (const board of BOARD_TEMPLATES) {
      const cells = board.build()
      const ids = new Set(cells.map((cell) => cell.id))
      for (const cell of cells) {
        if (cell.kind === 'edge') expect([ids.has(cell.source!), ids.has(cell.target!)]).toEqual([true, true])
        if (cell.parent !== LAYER_CELL_ID) expect(ids.has(cell.parent!)).toBe(true)
      }
    }
  })

  it('connects the field owner_id of boards with the field id of users in the ER diagram', () => {
    const cells = template('er').build()
    const byId = new Map(cells.map((cell) => [cell.id, cell]))
    const field = (table: string, name: string) =>
      cells.find((cell) => cell.value.startsWith(name) && byId.get(cell.parent!)?.value === table)!

    expect(cells.filter((cell) => cell.style.codrawShape === 'table').map((cell) => cell.value)).toEqual([
      'users',
      'boards',
      'board_members',
    ])
    expect(cells).toContainEqual(
      expect.objectContaining({ kind: 'edge', source: field('boards', 'owner_id').id, target: field('users', 'id').id }),
    )
  })

  it('gives a shape of an element its properties and the label made of them, and an edge its technology', () => {
    const diagram = new DiagramBuilder()
    const cache = diagram.shape('cache', 0, 0, { element: { name: 'Кэш', technology: 'Redis' }, showTechnology: true })
    const api = diagram.shape('c4-container', 0, 0, { element: { name: 'API', technology: 'Go', description: 'Заказы' } })
    diagram.edge(api, cache, { technology: 'RESP', interaction: 'sync' })

    const [first, second, edge] = diagram.build() as [CellData, CellData, CellData]

    expect(first).toMatchObject({ id: cache, value: 'Кэш\n[Redis]', style: { codrawShowTechnology: true, codrawKind: 'cache', codrawTechnology: 'Redis' } })
    expect(second.value).toBe('API\n[Container: Go]\nЗаказы')
    expect(first.style[ELEMENT_KEY]).not.toBe(second.style[ELEMENT_KEY])
    expect(edge.style).toMatchObject({ codrawTechnology: 'RESP', codrawInteraction: 'sync' })
  })

  it('gives the shapes and edges of «C4: контейнеры» and «Микросервисы» properties, with the labels they had', () => {
    const c4 = template('c4-containers').build()
    const api = c4.find((cell) => cell.value.startsWith('API'))!
    expect(api.value).toBe('API\n[Container: Spring Boot]\nЗаказы, оплата и каталог')
    expect(elementProperties(api.style, api.value)).toMatchObject({ kind: 'c4-container', technology: 'Spring Boot', description: 'Заказы, оплата и каталог' })
    expect(c4.find((cell) => cell.value.startsWith('Интернет-магазин'))!.value).toBe('Интернет-магазин\n[Software System]')
    expect(c4.filter((cell) => cell.kind === 'edge').map((cell) => cell.style.codrawTechnology)).toEqual(['HTTPS', 'JSON/HTTPS', 'JDBC', 'HTTPS'])

    const micro = template('microservices').build()
    const topic = micro.find((cell) => cell.style.codrawShape === 'event-topic')!
    expect(topic.value).toBe('Топик «Заказы»\n[Kafka]')
    expect(micro.find((cell) => cell.value === 'Публикует')!.style).toMatchObject({ codrawTechnology: 'Kafka', codrawInteraction: 'async' })
    expect(micro.filter((cell) => cell.style.codrawShape === 'database').map((cell) => cell.style.codrawTechnology)).toEqual([
      'PostgreSQL',
      'PostgreSQL',
      'PostgreSQL',
    ])
  })

  it('makes the template the only page of a new board, named after it', () => {
    const page = templatePage(template('microservices'))

    expect(page).toMatchObject({ id: null, name: 'Микросервисы' })
    expect(page.cells.length).toBeGreaterThan(10)
  })
})

describe('inserting a template', () => {
  const editors: DiagramEditor[] = []
  afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))

  it('adds every template as one undo step and selects it', () => {
    for (const board of BOARD_TEMPLATES) {
      const doc = new Y.Doc()
      initializeDocument(doc)
      const container = document.createElement('div')
      document.body.append(container)
      const editor = createDiagramEditor(container, doc)
      editors.push(editor)
      const cells = board.build()

      editor.insertCells(cells)

      const layer = editor.graph.getDefaultParent()
      expect(layer.getChildCount()).toBe(cells.filter((cell) => cell.parent === LAYER_CELL_ID).length)
      expect(layer.getChildren().filter((cell) => cell.isEdge()).every((edge) => edge.getTerminal(true) && edge.getTerminal(false))).toBe(
        true,
      )
      expect(editor.graph.getSelectionCount()).toBe(layer.getChildCount())
      expect(editor.getState().hasCells).toBe(true)
      // The elements are new ones, not those of the built cells.
      const elements = cells.flatMap((cell) => (cell.style[ELEMENT_KEY] ? [cell.style[ELEMENT_KEY]] : []))
      expect(getElements(doc).size).toBe(elements.length)
      expect(elements.some((id) => getElements(doc).has(id as string))).toBe(false)
      editor.undo()
      expect(layer.getChildCount()).toBe(0)
      expect(getElements(doc).size).toBe(0)
    }
  })

  it('lays out signing in with OAuth as one numbered sequence diagram with a frame', () => {
    const cells = template('oauth-login').build()
    const top = cells.filter((cell) => cell.parent === LAYER_CELL_ID)
    expect(top).toHaveLength(1)
    expect(top[0]).toMatchObject({ value: 'Вход через OAuth', style: { shape: 'codraw.sequence', codrawSeqNumbers: true } })
    const parts = cells.filter((cell) => cell.parent === top[0]!.id)
    expect(parts.filter((cell) => cell.style.codrawSeq === 'participant').map((cell) => cell.value)).toEqual([
      'Пользователь',
      'Приложение',
      'Сервер авторизации',
      'API',
    ])
    expect(parts.filter((cell) => cell.style.codrawSeq === 'frame').map((cell) => cell.style.codrawSeqFrame)).toEqual(['alt'])
    expect(parts.filter((cell) => cell.style.codrawSeq === 'message')).toHaveLength(11)
  })

  it('draws use cases of an online store with actors, the system boundary and every relation', () => {
    const cells = template('use-cases').build()
    const byId = new Map(cells.map((cell) => [cell.id, cell]))
    const values = (shape: string) => cells.filter((cell) => cell.style.codrawShape === shape).map((cell) => cell.value)
    const name = (id: string | null) => byId.get(id!)!.value

    expect(values('uml-system-boundary')).toEqual(['Интернет-магазин'])
    expect(values('uml-actor')).toEqual(['Покупатель', 'Постоянный покупатель', 'Платёжная система'])
    expect(values('uml-use-case')).toEqual(['Найти товар', 'Оформить заказ', 'Оплатить заказ', 'Войти в систему', 'Применить промокод'])
    // The boundary first, under the use cases.
    expect(cells[0]!.style.codrawShape).toBe('uml-system-boundary')
    const relations = cells
      .filter((cell) => cell.kind === 'edge')
      .map((edge) => [name(edge.source), name(edge.target), relationOf(edge.style, edge.value)])
    expect(relations).toEqual([
      ['Покупатель', 'Найти товар', 'association'],
      ['Покупатель', 'Оформить заказ', 'association'],
      ['Покупатель', 'Оплатить заказ', 'association'],
      ['Платёжная система', 'Оплатить заказ', 'association'],
      ['Оформить заказ', 'Войти в систему', 'include'],
      ['Применить промокод', 'Оформить заказ', 'extend'],
      ['Постоянный покупатель', 'Покупатель', 'generalization'],
    ])
    const include = cells.find((cell) => cell.kind === 'edge' && cell.value === '«include»')!
    expect(include.style).toMatchObject({ dashed: true, endArrow: 'open', edgeStyle: 'none' })
  })

  it('names the template and labels its shapes in the language of the interface when the board is made', () => {
    setLocale('en')
    const page = templatePage(template('use-cases'))

    expect(page.name).toBe('Use cases')
    expect(template('er').description).toBe('Tables with fields and foreign key relationships')
    expect(page.cells.map((cell) => cell.value)).toEqual(expect.arrayContaining(['Online store', 'Customer', 'Place an order']))
    const oauth = templatePage(template('oauth-login')).cells
    expect(oauth.some((cell) => cell.value === 'Sign-in with OAuth')).toBe(true)
    expect(oauth.some((cell) => cell.value === 'Authorization server')).toBe(true)
  })
})
