import type { Interaction } from '../diagram/elementKinds.ts'
import { LAYER_CELL_ID, type CellData, type StyleValue } from '../diagram/model.ts'
import { layoutShapes, type LayoutEngine } from '../diagram/layout.ts'
import { findShape, type ShapeStyle } from '../diagram/shapes.ts'
import { SOURCE_KEY } from '../diagram/sources.ts'
import { CARDINALITY_MARKERS } from '../mermaid/mermaidCells.ts'
import { tableWidth } from '../sql/erDiagram.ts'
import { DiagramBuilder } from '../templates/builder.ts'
import { fieldName, type ApiModel, type ApiSpec } from './parseApiSpec.ts'
import { apiSpecMessages } from './messages.ts'

/** Models and topics one import adds at most: more would not fit a page that people read. */
export const MAX_MODELS = 300
export const MAX_TOPICS = 300

export interface ApiImportOptions {
  /** Schemas of data become tables. */
  models: boolean
}

/** A service of a document: its title and its endpoints as `METHOD /path`, its description and protocols. */
export interface ApiService {
  title: string
  endpoints: string[]
  description?: string
  /** The protocols of its servers, e.g. `Kafka`. */
  technology?: string
}

/** An end of a link: a service, a topic, a model, or a field of a model, by their indexes in the graph. */
export type ApiNode = { kind: 'service' | 'topic' | 'model'; index: number } | { kind: 'field'; index: number; field: number }

export interface ApiLink {
  source: ApiNode
  target: ApiNode
  label: string
  style: Record<string, StyleValue>
  /** The protocol of a message sent or received. */
  technology?: string
  /** Messages of AsyncAPI are asynchronous. */
  interaction?: Interaction
}

/**
 * What an import adds to the page: a service per document, a topic per address of a channel of any of them, the models
 * (the same model of several documents once) and the links between them.
 */
export interface ApiGraph {
  services: ApiService[]
  topics: string[]
  /** The protocols of the topics, by their indexes: of the servers of the documents that have them. */
  topicTechnologies?: string[]
  models: ApiModel[]
  links: ApiLink[]
  skippedRefs: number
}

/** A link of a service or a topic to a model it takes, returns or carries. */
const USES: Record<string, StyleValue> = { dashed: true }

/**
 * The graph of what the documents describe. Sending is a link from the service to the topic, receiving from the topic to
 * the service, one per service, topic and direction with the labels of all its operations. With models: a link from a
 * field to each model it refers to with the marker of how many it holds, from a model to the models of its `allOf`,
 * `oneOf` and `anyOf`, and from a service or a topic to the models of its endpoints or messages.
 */
export function apiGraph(specs: ApiSpec[], { models: withModels }: ApiImportOptions): ApiGraph {
  const graph: ApiGraph = { services: [], topics: [], topicTechnologies: [], models: [], links: [], skippedRefs: 0 }
  const topics = new Map<string, number>()
  const topicProtocols: Set<string>[] = []
  const models = new Map<string, number>()
  const linked = new Set<string>()
  const flows = new Map<string, { link: ApiLink; labels: string[] }>()
  const topicOf = (address: string, protocols: string[] = []) => {
    let index = topics.get(address)
    if (index === undefined) {
      index = graph.topics.push(address) - 1
      topics.set(address, index)
      topicProtocols.push(new Set())
    }
    protocols.forEach((name) => topicProtocols[index!]!.add(name))
    graph.topicTechnologies![index] = [...topicProtocols[index]!].join(', ')
    return index
  }
  const once = (key: string, link: ApiLink) => {
    if (linked.has(key)) return
    linked.add(key)
    graph.links.push(link)
  }

  for (const spec of specs) {
    const endpoints = spec.endpoints.map((endpoint) => `${endpoint.method} ${endpoint.path}`)
    const protocols = spec.protocols ?? []
    const technology = protocols.join(', ')
    const service = graph.services.push({ title: spec.title, endpoints, description: spec.description ?? '', technology }) - 1
    graph.skippedRefs += spec.skippedRefs
    for (const channel of spec.channels) topicOf(channel.address, protocols)
    for (const operation of spec.operations) {
      const topic = topicOf(operation.channel, protocols)
      const key = `${service}:${topic}:${operation.action}`
      const flow = flows.get(key)
      if (flow) {
        if (operation.label && !flow.labels.includes(operation.label)) flow.labels.push(operation.label)
        flow.link.label = flow.labels.join(', ')
        continue
      }
      const ends: [ApiNode, ApiNode] = [
        { kind: 'service', index: service },
        { kind: 'topic', index: topic },
      ]
      const [source, target] = operation.action === 'send' ? ends : [ends[1], ends[0]]
      const link: ApiLink = { source, target, label: operation.label, style: {}, technology, interaction: 'async' }
      flows.set(key, { link, labels: operation.label ? [operation.label] : [] })
      graph.links.push(link)
    }
    if (!withModels) continue

    // Models of the document by name; one that another document has as well is the same table.
    const local = new Map<string, number>()
    for (const model of spec.models) {
      const signature = JSON.stringify([model.name, model.fields, model.bases])
      let index = models.get(signature)
      if (index === undefined) {
        index = graph.models.push(model) - 1
        models.set(signature, index)
      }
      local.set(model.name, index)
    }
    const modelNode = (name: string, except?: number): ApiNode | null => {
      const index = local.get(name)
      return index === undefined || index === except ? null : { kind: 'model', index }
    }
    for (const model of spec.models) {
      const index = local.get(model.name)!
      model.fields.forEach((field, fieldIndex) => {
        for (const reference of field.references) {
          // A model that refers to itself shows it in the type of the field.
          const target = modelNode(reference.model, index)
          if (!target) continue
          const style = { endArrow: CARDINALITY_MARKERS[reference.cardinality] }
          const source: ApiNode = { kind: 'field', index, field: fieldIndex }
          once(`field:${index}:${fieldIndex}:${target.index}`, { source, target, label: '', style })
        }
      })
      for (const base of model.bases) {
        const target = modelNode(base.model, index)
        if (!target) continue
        once(`base:${index}:${target.index}:${base.kind}`, { source: { kind: 'model', index }, target, label: base.kind, style: {} })
      }
    }
    for (const name of new Set(spec.endpoints.flatMap((endpoint) => endpoint.models))) {
      const target = modelNode(name)
      if (target) once(`uses:${service}:${target.index}`, { source: { kind: 'service', index: service }, target, label: '', style: USES })
    }
    for (const channel of spec.channels) {
      const topic = topicOf(channel.address)
      for (const name of channel.models) {
        const target = modelNode(name)
        if (target) once(`carries:${topic}:${target.index}`, { source: { kind: 'topic', index: topic }, target, label: '', style: USES })
      }
    }
  }
  return graph
}

const endpointCount = (graph: ApiGraph) => graph.services.reduce((sum, service) => sum + service.endpoints.length, 0)

/** What the import adds, for the summary before it. */
export function apiSummary(graph: ApiGraph): string {
  return apiSpecMessages.summary(
    graph.services.length,
    endpointCount(graph),
    graph.topics.length,
    graph.models.length,
    graph.links.length,
    graph.skippedRefs,
  )
}

/** Why the graph is too large to add, or `null`. */
export function apiGraphError(graph: ApiGraph): string | null {
  if (graph.models.length > MAX_MODELS) {
    return apiSpecMessages.tooManyModels(graph.models.length, MAX_MODELS)
  }
  if (graph.topics.length > MAX_TOPICS) {
    return apiSpecMessages.tooManyTopics(graph.topics.length, MAX_TOPICS)
  }
  return null
}

/** Width of text estimated from its length, where the canvas cannot measure it; 16 px a line of the default font. */
const CHAR_WIDTH = 7.5
const LINE_HEIGHT = 16

/** The label of a service: its title, then an endpoint a line. */
export function serviceLabel(service: ApiService): string {
  return [service.title, ...service.endpoints].join('\n')
}

/** A service with endpoints lists them from the top left; one without them is captioned as a shape of the palette. */
const LISTING: ShapeStyle = { align: 'left', verticalAlign: 'top', spacingLeft: 10, spacingTop: 6 }

/**
 * Cells of the graph laid out from left to right along its links, with the top-left corner at `origin`: a «Сервис»
 * with its endpoints per service, a «Топик событий» per topic, a table per model with a field per property.
 */
export async function apiSpecCells(
  graph: ApiGraph,
  origin: { x: number; y: number },
  engine?: () => Promise<LayoutEngine>,
  sourcePrefix?: string,
): Promise<CellData[]> {
  const builder = new DiagramBuilder()
  const service = findShape('service')!
  const topic = findShape('event-topic')!
  const services = graph.services.map((item) => {
    const label = serviceLabel(item)
    const lines = label.split('\n')
    const width = Math.min(560, Math.max(service.width, Math.ceil(Math.max(...lines.map((line) => line.length)) * CHAR_WIDTH) + 32))
    const height = Math.max(service.height, lines.length * LINE_HEIGHT + 20)
    // The label stays as it is: the title, then the endpoints, which the properties do not change.
    const element = { name: item.title, kind: 'service' as const, description: item.description, technology: item.technology }
    return builder.shape('service', 0, 0, { value: label, width, height, element, ...(item.endpoints.length > 0 && { style: LISTING }) })
  })
  // The address is written under the topic: a long one widens it, so that the layout keeps it clear of its neighbours.
  const topics = graph.topics.map((address, index) => {
    const width = Math.min(320, Math.max(topic.width, Math.ceil(address.length * CHAR_WIDTH) + 16))
    const element = { name: address, technology: graph.topicTechnologies?.[index] }
    return builder.shape('event-topic', 0, 0, { value: address, width, element })
  })
  const tables = graph.models.map((model) => {
    const labels = model.fields.map((field) => [fieldName(field.name), field.type, field.notNull && 'NOT NULL'].filter(Boolean).join(' '))
    return builder.table(model.name, 0, 0, labels, tableWidth(model.name, labels))
  })
  const nodeSource = (node: ApiNode): string => {
    if (node.kind === 'field') return `${sourcePrefix}:model:${graph.models[node.index]!.name}.${graph.models[node.index]!.fields[node.field]!.name}`
    if (node.kind === 'model') return `${sourcePrefix}:model:${graph.models[node.index]!.name}`
    if (node.kind === 'topic') return `${sourcePrefix}:topic:${graph.topics[node.index]!}`
    return `${sourcePrefix}:service:${graph.services[node.index]!.title}`
  }
  const cellOf = (node: ApiNode): string => {
    if (node.kind === 'field') return tables[node.index]!.fields[node.field]!
    if (node.kind === 'model') return tables[node.index]!.id
    return (node.kind === 'service' ? services : topics)[node.index]!
  }
  /** The shape an end of a link is on: a field is on its table. */
  const shapeOf = (node: ApiNode) => (node.kind === 'field' ? tables[node.index]!.id : cellOf(node))
  const sourceMarks = new Map<string, string>()
  for (const link of graph.links) {
    const { label: value, style, technology, interaction } = link
    const edge = builder.edge(cellOf(link.source), cellOf(link.target), { value, style, technology, interaction })
    if (sourcePrefix) sourceMarks.set(edge, `${sourcePrefix}:edge:${nodeSource(link.source)}->${nodeSource(link.target)}:${value}`)
  }

  const cells = builder.build()
  const byId = new Map(cells.map((cell) => [cell.id, cell]))
  if (sourcePrefix) {
    graph.services.forEach((item, index) => sourceMarks.set(services[index]!, `${sourcePrefix}:service:${item.title}`))
    graph.topics.forEach((address, index) => sourceMarks.set(topics[index]!, `${sourcePrefix}:topic:${address}`))
    graph.models.forEach((model, index) => {
      const table = tables[index]!
      sourceMarks.set(table.id, `${sourcePrefix}:model:${model.name}`)
      model.fields.forEach((field, fieldIndex) => sourceMarks.set(table.fields[fieldIndex]!, `${sourcePrefix}:model:${model.name}.${field.name}`))
    })
    for (const [id, source] of sourceMarks) {
      const cell = byId.get(id)
      if (cell) cell.style = { ...cell.style, [SOURCE_KEY]: source }
    }
  }
  const shapes = cells.filter((cell) => cell.parent === LAYER_CELL_ID && cell.kind === 'vertex')
  const boxes = await layoutShapes(
    shapes.map((cell) => ({ id: cell.id, ...cell.geometry!, frame: false })),
    graph.links.map((link, index) => ({ id: `link-${index}`, source: shapeOf(link.source), target: shapeOf(link.target) })),
    'right',
    engine,
  )
  // The shapes were built at (0, 0), which the layout keeps as its top-left corner.
  for (const cell of shapes) {
    const box = boxes.get(cell.id)
    if (box) cell.geometry = { ...cell.geometry!, x: box.x + origin.x, y: box.y + origin.y }
  }
  return cells
}
