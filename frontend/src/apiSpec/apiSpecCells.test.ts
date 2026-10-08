import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { readAttribution } from '../diagram/attribution.ts'
import { parseDrawio } from '../drawio/parse.ts'
import { exportDrawioPage } from '../drawio/serialize.ts'
import { createDiagramEditor, type DiagramEditor } from '../diagram/editor.ts'
import { DEFAULT_PAGE_ID, getCells, initializeDocument, LAYER_CELL_ID, type CellData } from '../diagram/model.ts'
import { isTableStyle, type ShapeStyle } from '../diagram/shapes.ts'
import { diagramSchema, parseFieldLabel, schemaSql } from '../sql/erDiagram.ts'
import { apiGraph, apiGraphError, apiSpecCells, apiSummary, MAX_MODELS, serviceLabel, type ApiGraph } from './apiSpecCells.ts'
import { parseApiSpec, type ApiSpec } from './parseApiSpec.ts'
import {
  ACCOUNT_ASYNCAPI_YAML,
  BILLING_ASYNCAPI_YAML,
  ORDERS_ASYNCAPI_YAML,
  PETSTORE_JSON,
  PETSTORE_YAML,
  STORE_YAML,
} from './testDocuments.ts'

const parse = (text: string, name = 'api.yaml') => parseApiSpec({ name, text })
const byValue = (cells: CellData[], value: string) => {
  const found = cells.find((cell) => cell.value === value)
  if (!found) throw new Error(`No cell ${value}`)
  return found
}
const top = (cells: CellData[]) => cells.filter((cell) => cell.parent === LAYER_CELL_ID && cell.kind === 'vertex')
const edges = (cells: CellData[]) => cells.filter((cell) => cell.kind === 'edge')
/** The value of the cell, or of the table of a field as `table.field`. */
const nameOf = (cells: CellData[], id: string | null) => {
  const cell = cells.find((candidate) => candidate.id === id)!
  return cell.parent === LAYER_CELL_ID ? cell.value : `${cells.find((candidate) => candidate.id === cell.parent)!.value}.${cell.value}`
}
const links = (cells: CellData[]) => edges(cells).map((edge) => [nameOf(cells, edge.source), nameOf(cells, edge.target), edge.value])

describe('apiGraph', () => {
  it('counts what Petstore adds: a service, its endpoints, its models and its links to them', async () => {
    const graph = apiGraph([await parse(PETSTORE_YAML)], { models: true })

    expect(apiSummary(graph)).toBe('Сервисов: 1, эндпоинтов: 3, топиков: 0, моделей: 2, связей: 2, пропущено ссылок: 0')
    expect(graph.services).toEqual([
      { title: 'Petstore', endpoints: ['GET /pets', 'POST /pets', 'GET /pets/{petId}'], description: '', technology: '' },
    ])
  })

  it('adds no models and no links to them without the models', async () => {
    const graph = apiGraph([await parse(PETSTORE_YAML), await parse(ACCOUNT_ASYNCAPI_YAML)], { models: false })

    expect(apiSummary(graph)).toBe('Сервисов: 2, эндпоинтов: 3, топиков: 3, моделей: 0, связей: 3, пропущено ссылок: 0')
  })

  it('makes one topic of the channels of one address and one table of the same model of several documents', async () => {
    const graph = apiGraph([await parse(ORDERS_ASYNCAPI_YAML), await parse(BILLING_ASYNCAPI_YAML)], { models: true })

    expect(graph.topics).toEqual(['orders.created', 'orderEvents', 'invoices.issued'])
    expect(graph.models.map((model) => model.name)).toEqual(['OrderCreatedPayload', 'InvoiceIssued'])
    expect(apiSummary(graph)).toBe('Сервисов: 2, эндпоинтов: 0, топиков: 3, моделей: 2, связей: 5, пропущено ссылок: 0')
  })

  it('makes one link of the operations of a service in one direction of a channel, with the labels of all', async () => {
    const twice = await parse(
      [
        'asyncapi: 3.0.0',
        'info: {title: Audit}',
        'channels:',
        '  log: {address: audit.log}',
        'operations:',
        "  writeLogin: {action: send, channel: {$ref: '#/channels/log'}}",
        "  writeLogout: {action: send, channel: {$ref: '#/channels/log'}}",
        "  readAll: {action: receive, channel: {$ref: '#/channels/log'}}",
      ].join('\n'),
    )

    const graph = apiGraph([twice], { models: true })

    expect(graph.links.map((link) => [link.source, link.target, link.label])).toEqual([
      [{ kind: 'service', index: 0 }, { kind: 'topic', index: 0 }, 'writeLogin, writeLogout'],
      [{ kind: 'topic', index: 0 }, { kind: 'service', index: 0 }, 'readAll'],
    ])
  })

  it('refuses more models than one import adds', () => {
    const spec: ApiSpec = {
      kind: 'openapi',
      source: 'big.yaml',
      title: 'Big',
      endpoints: [],
      channels: [],
      operations: [],
      models: Array.from({ length: MAX_MODELS + 1 }, (_, index) => ({ name: `M${index}`, fields: [], bases: [] })),
      skippedRefs: 0,
    }

    expect(apiGraphError(apiGraph([spec], { models: true }))).toBe(
      'Слишком много моделей: 301, за раз можно добавить не больше 300 — снимите «Модели таблицами» или откройте меньше файлов',
    )
    expect(apiGraphError(apiGraph([spec], { models: false }))).toBeNull()
  })
})

describe('apiSpecCells', () => {
  const cellsOf = async (graph: ApiGraph) => apiSpecCells(graph, { x: 100, y: 50 })

  it('draws the service as a shape «Сервис» listing its endpoints, which is not a table', async () => {
    const cells = await cellsOf(apiGraph([await parse(PETSTORE_YAML)], { models: true }))

    const service = byValue(cells, 'Petstore\nGET /pets\nPOST /pets\nGET /pets/{petId}')
    expect(service.style).toMatchObject({ codrawShape: 'service', rounded: true, align: 'left', verticalAlign: 'top' })
    expect(isTableStyle(service.style as ShapeStyle)).toBe(false)
    expect(cells.some((cell) => cell.parent === service.id)).toBe(false)
    expect(service.geometry!.height).toBeGreaterThanOrEqual(4 * 16)
    expect(service.geometry!.width).toBeGreaterThanOrEqual(120)
    // Only the models are tables, for SQL and the other tools of tables.
    expect(diagramSchema(cells).tables.map((table) => table.name)).toEqual(['Pet', 'Error'])
    expect(schemaSql(diagramSchema(cells))).toContain('CREATE TABLE "Pet" (\n    id integer(int64) NOT NULL,')
    expect(links(cells)).toEqual([
      ['Petstore\nGET /pets\nPOST /pets\nGET /pets/{petId}', 'Pet', ''],
      ['Petstore\nGET /pets\nPOST /pets\nGET /pets/{petId}', 'Error', ''],
    ])
    expect(edges(cells).every((edge) => edge.style.dashed === true)).toBe(true)
  })

  it('writes fields that parse as fields of a table and links them to their models with markers', async () => {
    const cells = await cellsOf(apiGraph([await parse(PETSTORE_JSON)], { models: true }))

    const pet = byValue(cells, 'Pet')
    const fields = cells.filter((cell) => cell.parent === pet.id).map((cell) => cell.value)
    expect(fields).toEqual([
      'id integer(int64) NOT NULL',
      'name string NOT NULL',
      'category Category NOT NULL',
      'tags Tag[]',
      'photoUrls string(uri)[]',
      'status string',
    ])
    expect(fields.map((field) => parseFieldLabel(field))).toMatchObject([
      { name: 'id', type: 'integer(int64)', notNull: true },
      { name: 'name', type: 'string', notNull: true },
      { name: 'category', type: 'category', notNull: true },
      { name: 'tags', type: 'tag[]', notNull: false },
      { name: 'photoUrls', type: 'string(uri)[]' },
      { name: 'status', type: 'string' },
    ])
    const field = (table: string, name: string) => edges(cells).find((edge) => nameOf(cells, edge.source).startsWith(`${table}.${name} `))!
    expect(nameOf(cells, field('Pet', 'category').target)).toBe('Category')
    expect(field('Pet', 'category').style).toEqual({ endArrow: 'ERmandOne' })
    expect(field('Pet', 'tags').style).toEqual({ endArrow: 'ERzeroToMany' })
    // `Category.parent` refers to its own table: no edge.
    expect(edges(cells)).toHaveLength(3)
  })

  it('quotes names of fields that would not parse and labels the links of allOf and oneOf', async () => {
    const cells = await cellsOf(apiGraph([await parse(STORE_YAML)], { models: true }))

    const order = byValue(cells, 'Order')
    expect(cells.filter((cell) => cell.parent === order.id).map((cell) => cell.value)).toContain('"x-trace-id" string')
    expect(links(cells)).toEqual(
      expect.arrayContaining([
        ['GiftOrder', 'Order', 'allOf'],
        ['Payment', 'Card', 'oneOf'],
        ['Payment', 'Transfer', 'oneOf'],
        ['Order.items LineItem[] NOT NULL', 'LineItem', ''],
      ]),
    )
    expect(edges(cells).find((edge) => nameOf(cells, edge.source) === 'Order.items LineItem[] NOT NULL')!.style).toEqual({ endArrow: 'ERoneToMany' })
  })

  it('draws a map of messages: services, topics with their addresses, sending and receiving, the models of messages', async () => {
    const cells = await cellsOf(apiGraph([await parse(ORDERS_ASYNCAPI_YAML), await parse(BILLING_ASYNCAPI_YAML)], { models: true }))

    const topic = byValue(cells, 'orders.created')
    expect(topic.style.codrawShape).toBe('event-topic')
    expect(byValue(cells, 'Orders').style).not.toHaveProperty('align')
    expect(links(cells)).toEqual([
      ['Orders', 'orders.created', 'OrderCreated'],
      ['orders.created', 'OrderCreatedPayload', ''],
      ['orders.created', 'Billing', 'OrderCreated'],
      ['Billing', 'invoices.issued', 'InvoiceIssued'],
      ['invoices.issued', 'InvoiceIssued', ''],
    ])
    // Layers along the links: the sender, the topic, the receiver.
    const right = (cell: CellData) => cell.geometry!.x + cell.geometry!.width
    expect(right(byValue(cells, 'Orders'))).toBeLessThanOrEqual(topic.geometry!.x)
    expect(right(topic)).toBeLessThanOrEqual(byValue(cells, 'Billing').geometry!.x)
    expect(Math.min(...top(cells).map((cell) => cell.geometry!.x))).toBe(100)
    expect(Math.min(...top(cells).map((cell) => cell.geometry!.y))).toBe(50)
  })

  it('gives services, topics and links of messages the properties of elements and edges', async () => {
    const cells = await cellsOf(apiGraph([await parse(ORDERS_ASYNCAPI_YAML), await parse(BILLING_ASYNCAPI_YAML)], { models: true }))

    expect(byValue(cells, 'Orders').style).toMatchObject({
      codrawElement: expect.any(String),
      codrawName: 'Orders',
      codrawKind: 'service',
      codrawDescription: 'Заказы магазина: создание и отмена.',
      codrawTechnology: 'Kafka',
    })
    // The topic gets the protocols of the documents that have it; another document without servers adds none.
    expect(byValue(cells, 'orders.created').style).toMatchObject({ codrawName: 'orders.created', codrawKind: 'event-topic', codrawTechnology: 'Kafka' })
    expect(byValue(cells, 'invoices.issued').style).not.toHaveProperty('codrawTechnology')
    const sent = edges(cells).find((edge) => edge.value === 'OrderCreated' && nameOf(cells, edge.source) === 'Orders')!
    expect(sent.style).toMatchObject({ codrawTechnology: 'Kafka', codrawInteraction: 'async' })
    const received = edges(cells).find((edge) => nameOf(cells, edge.target) === 'Billing')!
    expect(received.style).toMatchObject({ codrawInteraction: 'async' })
    expect(received.style).not.toHaveProperty('codrawTechnology')
    // The label of a service stays its title and endpoints.
    const petstore = await cellsOf(apiGraph([await parse(PETSTORE_YAML)], { models: false }))
    expect(byValue(petstore, 'Petstore\nGET /pets\nPOST /pets\nGET /pets/{petId}').style).toMatchObject({ codrawName: 'Petstore' })
  })

  it('widens a topic for a long address', async () => {
    const spec = await parse('asyncapi: 2.6.0\ninfo: {title: A}\nchannels:\n  smartylighting/streetlights/1/0/event/{streetlightId}/lighting/measured: {}\n')

    const cells = await cellsOf(apiGraph([spec], { models: true }))

    expect(byValue(cells, 'smartylighting/streetlights/1/0/event/{streetlightId}/lighting/measured').geometry!.width).toBe(320)
  })
})

const BOB = '0199a000-0000-7000-8000-00000000000b'

describe('the service on the board', () => {
  const editors: DiagramEditor[] = []
  afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))

  async function board() {
    const doc = new Y.Doc()
    initializeDocument(doc)
    const container = document.createElement('div')
    document.body.append(container)
    const editor = createDiagramEditor(container, doc, { participantName: 'Боб', participantId: BOB })
    editors.push(editor)
    const graph = apiGraph([await parse(PETSTORE_YAML), await parse(ACCOUNT_ASYNCAPI_YAML)], { models: true })
    editor.insertCells(await apiSpecCells(graph, { x: 0, y: 0 }))
    return { doc, editor, graph }
  }

  it('is added with everything else in one undo step', async () => {
    const { doc, editor } = await board()
    const layer = () => editor.graph.getDefaultParent().getChildCount()
    expect(layer()).toBeGreaterThan(10)

    editor.undo()

    expect(layer()).toBe(0)
    // The root and the layer of the page.
    expect(getCells(doc, DEFAULT_PAGE_ID).size).toBe(2)
  })

  it('is marked with the participant who adds it, as everything it comes with', async () => {
    const { doc } = await board()

    const cells = [...getCells(doc, DEFAULT_PAGE_ID).values()].filter((cell) => cell.get('parent') !== undefined && cell.get('parent') !== '0')
    expect(cells.length).toBeGreaterThan(10)
    for (const cell of cells) expect(readAttribution(cell)).toMatchObject({ by: BOB, name: 'Боб' })
  })

  it('goes through .drawio with its label of many lines and no layout of a table', async () => {
    const { doc, graph } = await board()

    const [page] = await parseDrawio(exportDrawioPage(doc, DEFAULT_PAGE_ID)!)

    const service = page!.cells.find((cell) => cell.value === serviceLabel(graph.services[0]!))!
    expect(service.style).toMatchObject({ align: 'left', verticalAlign: 'top', rounded: true })
    expect(service.style).not.toHaveProperty('childLayout')
  })

  it('draws every endpoint in SVG and PNG', async () => {
    const { editor } = await board()

    const { svg } = editor.exportSvg()!

    for (const line of ['Petstore', 'GET /pets', 'POST /pets', 'GET /pets/{petId}']) expect(svg).toContain(`>${line}<`)
  })
})
