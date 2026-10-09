import * as Y from 'yjs'
import { edgeProperties, ELEMENT_KINDS, type ElementProperties, type Interaction } from './elementKinds.ts'
import { elementProperties, labelLines, shapeIdOf } from './elementProps.ts'
import { isFreehandStyle } from './freehand.ts'
import {
  compareCells,
  elementIdOf,
  getCells,
  getElements,
  layerIds,
  readCell,
  type CellData,
  type CellsMap,
  type ModelField,
} from './model.ts'
import { listPages } from './pages.ts'
import { mayBeElement, type CellRef } from './sharedElements.ts'
import { COMPUTED_KEY } from './viewRule.ts'

/**
 * The model of the architecture of a board, made of what is drawn on its pages, as Structurizr and LikeC4 keep one apart
 * from their diagrams: the elements with what they are a part of — a system of containers, a container of components —,
 * the nodes of deployment with their environments and the elements that run on them, and the relations between the
 * elements. The pages that are views of the model (see `modelViews.ts`) show it; their computed cells are no part of it:
 * a view would keep itself, e.g. a container moved out of its system on its page would stay in it by its cell inside the
 * computed boundary. What a participant drew on a view is a part of it, as on any page.
 *
 * Everything here reads the document, without a canvas, in an order that is the same for every participant.
 */

/** What an element of the model is: a person, a software system, a container, a component, or a node of deployment. */
export type ModelLevel = 'person' | 'system' | 'container' | 'component' | 'node'

/** The shape of a node of deployment: a frame whose shapes run on it. */
export const DEPLOYMENT_NODE_SHAPE = 'c4-deployment-node'

export const isDeploymentNodeStyle = (style: Record<string, unknown>) => shapeIdOf(style) === DEPLOYMENT_NODE_SHAPE

/** How high a level of C4 is: an element is a part of one of a higher level. */
const RANK: Readonly<Record<Exclude<ModelLevel, 'node'>, number>> = { person: 3, system: 3, container: 2, component: 1 }

export interface ModelElement {
  /**
   * The element of the document, or the id of a shape of a kind that is no element yet: the element `ensureElement`
   * makes of it gets that id.
   */
  id: string
  /** The document has the element; otherwise its properties are those its label tells. */
  stored: boolean
  properties: ElementProperties
  level: ModelLevel
  external: boolean
  /** The element it is a part of: the one its field names, otherwise the one it is drawn in; `null` for none. */
  parent: string | null
  /** The element its field «Входит в» names, when the model has it at a higher level. */
  explicitParent: string | null
  /** The element it is drawn in: the boundary of the smallest frame of a higher level around its first such cell. */
  drawnParent: string | null
  /** Of a node: the environment of its own, or of the node it lies in; `''` for none. */
  environment: string
  /** Of a node: the environment its field names. */
  ownEnvironment: string
  /** Its cells drawn on the pages, the computed ones aside: the pages in their order, a page in the order of its cells. */
  cells: CellRef[]
}

/** A relation of the model: an edge between two elements of it, drawn on a page. */
export interface ModelRelation {
  /** The page and the id of the edge, as `pageId/edgeId`. */
  id: string
  source: string
  target: string
  /** The text of the label of the edge on one line. */
  label: string
  technology: string
  interaction: Interaction | null
  edge: CellRef
}

/** An element running on a node of deployment: a cell of a container or a system drawn inside the node. */
export interface ModelInstance {
  node: string
  element: string
  cell: CellRef
}

export interface BoardModel {
  /** The elements in the order of their first cells. */
  elements: Map<string, ModelElement>
  relations: ModelRelation[]
  instances: ModelInstance[]
  /** The elements that are parts of each element, in the order of the elements; `''` holds those of none. */
  children: Map<string, string[]>
}

/** What a shape is in the model: its level and whether it is external; `null` for a shape of no level. */
export function levelOfShape(style: Record<string, unknown>, value: string): { level: ModelLevel; external: boolean } | null {
  if (isDeploymentNodeStyle(style)) return { level: 'node', external: false }
  const kind = elementProperties(style, value).kind
  const info = kind === null ? undefined : ELEMENT_KINDS[kind]
  return info ? { level: info.c4, external: info.external } : null
}

/** The cell of a page is a computed one of a view: it has the key of what it shows, and its page is a view. */
export const isComputedCell = (style: Record<string, unknown>, onView: boolean) =>
  onView && typeof style[COMPUTED_KEY] === 'string' && style[COMPUTED_KEY] !== ''

/** The value of a field of the model of an element of the document: a non-empty string, or `''`. */
export function modelFieldOf(doc: Y.Doc, elementId: string, field: ModelField): string {
  const element = getElements(doc).get(elementId)
  const value = element instanceof Y.Map ? element.get(field) : undefined
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Sets a field of the model of the element `elementId`, or removes it for an empty value. Call inside a transaction;
 * returns whether it changed. An element the document lacks gets nothing.
 */
export function writeModelField(doc: Y.Doc, elementId: string, field: ModelField, value: string): boolean {
  const element = getElements(doc).get(elementId)
  if (!(element instanceof Y.Map)) return false
  const next = value.trim()
  const current = element.get(field)
  if (next === '') {
    if (current === undefined) return false
    element.delete(field)
    return true
  }
  if (current === next) return false
  element.set(field, next)
  return true
}

interface Box {
  x: number
  y: number
  width: number
  height: number
}

const area = (box: Box) => box.width * box.height
const holds = (frame: Box, box: Box) => {
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  return x >= frame.x && x <= frame.x + frame.width && y >= frame.y && y <= frame.y + frame.height
}

/** A shape of a page that is an element of the model, as the model reads its page. */
interface PageShape {
  cell: CellData
  key: string
  level: ModelLevel
  external: boolean
  box: Box | null
  computed: boolean
  /** A frame whose centre-held shapes are parts of it: a boundary of C4, or a node of deployment. */
  frame: 'boundary' | 'node' | null
}

/** The cells of a page in an order that every participant has: by their order keys, then by their ids. */
export function sortedCells(cells: CellsMap): CellData[] {
  return Array.from(cells.entries(), ([id, cell]) => readCell(id, cell)).sort(compareCells)
}

/** The model of the board. */
export function buildModel(doc: Y.Doc): BoardModel {
  const elements = new Map<string, ModelElement>()
  const relations: ModelRelation[] = []
  const instances: ModelInstance[] = []
  const nodeParents = new Map<string, string>()
  const seenInstances = new Set<string>()
  const pageEdges: { pageId: string; edge: CellData; keys: Map<string, string>; byId: Map<string, CellData> }[] = []

  for (const page of listPages(doc)) {
    const onView = page.view !== undefined
    const cells = getCells(doc, page.id)
    const data = sortedCells(cells)
    const byId = new Map(data.map((cell) => [cell.id, cell]))
    const layers = layerIds(data)
    /** Where a cell is on the page: its geometry with the offsets of the groups it is in. */
    const boxOf = (cell: CellData): Box | null => {
      if (!cell.geometry || cell.geometry.relative) return null
      let { x, y } = cell.geometry
      for (let parent = cell.parent ? byId.get(cell.parent) : undefined; parent && !layers.has(parent.id); parent = parent.parent ? byId.get(parent.parent) : undefined) {
        if (parent.kind === 'vertex' && parent.geometry && !parent.geometry.relative) {
          x += parent.geometry.x
          y += parent.geometry.y
        }
      }
      return { x, y, width: cell.geometry.width, height: cell.geometry.height }
    }
    const shapes: PageShape[] = []
    const keys = new Map<string, string>()
    for (const cell of data) {
      if (cell.kind !== 'vertex' || !mayBeElement(cells, cell.id)) continue
      const what = levelOfShape(cell.style, cell.value)
      if (!what) continue
      const key = elementIdOf(cell.style) ?? cell.id
      keys.set(cell.id, key)
      const shape = shapeIdOf(cell.style)
      shapes.push({
        cell,
        key,
        ...what,
        box: boxOf(cell),
        computed: isComputedCell(cell.style, onView),
        frame: shape === 'c4-boundary' ? 'boundary' : what.level === 'node' ? 'node' : null,
      })
    }
    const frames = shapes.filter((shape) => shape.frame !== null && shape.box !== null).sort((a, b) => area(a.box!) - area(b.box!))
    /** The smallest frame of the kind around the shape, larger than it and of another element. */
    const frameOf = (shape: PageShape, kind: 'boundary' | 'node', fits: (frame: PageShape) => boolean) =>
      shape.box === null
        ? undefined
        : frames.find(
            (frame) =>
              frame.frame === kind &&
              frame.key !== shape.key &&
              area(frame.box!) > area(shape.box!) &&
              holds(frame.box!, shape.box!) &&
              fits(frame),
          )

    for (const shape of shapes) {
      if (shape.computed) continue
      let element = elements.get(shape.key)
      if (!element) {
        element = {
          id: shape.key,
          stored: elementIdOf(shape.cell.style) !== null,
          properties: elementProperties(shape.cell.style, shape.cell.value),
          level: shape.level,
          external: shape.external,
          parent: null,
          explicitParent: null,
          drawnParent: null,
          environment: '',
          ownEnvironment: '',
          cells: [],
        }
        elements.set(shape.key, element)
      }
      element.cells.push({ pageId: page.id, cellId: shape.cell.id })
      if (element.level === 'node') {
        const above = frameOf(shape, 'node', () => true)
        if (above && !nodeParents.has(shape.key)) nodeParents.set(shape.key, above.key)
        continue
      }
      if ((element.level === 'container' || element.level === 'component') && element.drawnParent === null) {
        const rank = RANK[element.level]
        const above = frameOf(shape, 'boundary', (frame) => frame.level !== 'node' && RANK[frame.level] > rank && frame.level !== 'person')
        if (above) element.drawnParent = above.key
      }
      if (element.level === 'container' || element.level === 'system') {
        const node = frameOf(shape, 'node', () => true)
        const id = node ? `${node.key}\n${shape.key}` : null
        if (node && !seenInstances.has(id!)) {
          seenInstances.add(id!)
          instances.push({ node: node.key, element: shape.key, cell: { pageId: page.id, cellId: shape.cell.id } })
        }
      }
    }
    for (const cell of data) {
      if (cell.kind !== 'edge' || isComputedCell(cell.style, onView) || isFreehandStyle(cell.style)) continue
      pageEdges.push({ pageId: page.id, edge: cell, keys, byId })
    }
  }

  // The fields of the elements of the document: what they are a part of, and the environments of nodes.
  const documentElements = getElements(doc)
  for (const element of elements.values()) {
    if (!element.stored) continue
    const stored = documentElements.get(element.id)
    if (!(stored instanceof Y.Map)) continue
    if (element.level === 'node') {
      const environment = stored.get('environment')
      element.ownEnvironment = typeof environment === 'string' ? environment.trim() : ''
      continue
    }
    const parent = stored.get('parent')
    const named = typeof parent === 'string' ? elements.get(parent) : undefined
    if (named && fitsParent(element.level, named.level)) element.explicitParent = named.id
  }
  for (const element of elements.values()) {
    if (element.level === 'node') {
      element.parent = nodeParents.get(element.id) ?? null
      if (element.parent !== null && !elements.has(element.parent)) element.parent = null
    } else {
      const drawn = element.drawnParent === null ? undefined : elements.get(element.drawnParent)
      element.parent = element.explicitParent ?? (drawn && fitsParent(element.level, drawn.level) ? drawn.id : null)
    }
  }
  // The environment of a node without one of its own is that of the node it lies in.
  const environmentOf = (id: string, seen = new Set<string>()): string => {
    const node = elements.get(id)
    if (!node || seen.has(id)) return ''
    seen.add(id)
    return node.ownEnvironment || (node.parent ? environmentOf(node.parent, seen) : '')
  }
  for (const element of elements.values()) if (element.level === 'node') element.environment = environmentOf(element.id)

  for (const { pageId, edge, keys, byId } of pageEdges) {
    const end = (id: string | null): string | null => {
      for (let cell = id ? byId.get(id) : undefined; cell; cell = cell.parent ? byId.get(cell.parent) : undefined) {
        const key = keys.get(cell.id)
        if (key !== undefined) return elements.has(key) ? key : null
      }
      return null
    }
    const source = end(edge.source)
    const target = end(edge.target)
    if (source === null || target === null || source === target) continue
    const { technology, interaction } = edgeProperties(edge.style)
    relations.push({
      id: `${pageId}/${edge.id}`,
      source,
      target,
      label: labelLines(edge.value, edge.style).join(' '),
      technology,
      interaction,
      edge: { pageId, cellId: edge.id },
    })
  }

  const children = new Map<string, string[]>()
  for (const element of elements.values()) {
    const parent = element.parent ?? ''
    children.set(parent, [...(children.get(parent) ?? []), element.id])
  }
  return { elements, relations, instances: instances.filter((instance) => elements.has(instance.node) && elements.has(instance.element)), children }
}

/** An element of `level` may be a part of one of `parent`: a container of a system, a component of a container or system. */
export function fitsParent(level: ModelLevel, parent: ModelLevel): boolean {
  if (level === 'node' || parent === 'node' || parent === 'person') return false
  if (level === 'person' || level === 'system') return false
  return RANK[parent] > RANK[level]
}

/** The element itself and those it is a part of, up to the top. */
export function ancestry(model: BoardModel, id: string): string[] {
  const chain: string[] = []
  const seen = new Set<string>()
  for (let current: string | null = id; current !== null && !seen.has(current); current = model.elements.get(current)?.parent ?? null) {
    if (!model.elements.has(current)) break
    seen.add(current)
    chain.push(current)
  }
  return chain
}

/** The elements that are parts of the element `id`, or of none for `null`. */
export const childrenOf = (model: BoardModel, id: string | null) => model.children.get(id ?? '') ?? []

/** The environments of the nodes of the model, sorted; `''` stands for the nodes of none. */
export function environments(model: BoardModel): string[] {
  const names = new Set<string>()
  for (const element of model.elements.values()) if (element.level === 'node') names.add(element.environment)
  return [...names].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'ru')))
}

/** The values of the elements of the model a slice may choose: teams, tags and technologies, sorted. */
export function sliceValues(model: BoardModel): { owners: string[]; tags: string[]; technologies: string[] } {
  const owners = new Set<string>()
  const tags = new Set<string>()
  const technologies = new Set<string>()
  for (const { properties, level } of model.elements.values()) {
    if (level === 'node') continue
    if (properties.owner) owners.add(properties.owner)
    properties.tags.forEach((tag) => tags.add(tag))
    if (properties.technology) technologies.add(properties.technology)
  }
  const sorted = (values: Set<string>) => [...values].sort((a, b) => a.localeCompare(b, 'ru'))
  return { owners: sorted(owners), tags: sorted(tags), technologies: sorted(technologies) }
}

/** The elements of the model that may be parts of others of `level`: systems for containers, containers and systems for components. */
export function parentCandidates(model: BoardModel, level: ModelLevel, except: string | null = null): ModelElement[] {
  return [...model.elements.values()]
    .filter((element) => element.id !== except && fitsParent(level, element.level))
    .sort((a, b) => a.properties.name.localeCompare(b.properties.name, 'ru'))
}
