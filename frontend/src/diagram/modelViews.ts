import * as Y from 'yjs'
import { ancestry, buildModel, isComputedCell, sortedCells, type BoardModel, type ModelElement, type ModelRelation } from './boardModel.ts'
import { EDGE_API_KEY } from './edgeApi.ts'
import { edgePropertiesStyle, ELEMENT_KINDS, type Interaction } from './elementKinds.ts'
import { composeLabel, isC4Boundary } from './elementProps.ts'
import { newId } from './ids.ts'
import { LINK_KEY } from './links.ts'
import { LOCKED_BY_KEY, LOCKED_KEY } from './locks.ts'
import {
  cellElementId,
  dropUnusedElements,
  ELEMENT_KEY,
  getCells,
  getPages,
  isElementStyleKey,
  LAYER_CELL_ID,
  layerIds,
  orderBetween,
  OWN_LINES_KEY,
  readCell,
  readPage,
  writeCell,
  writePage,
  type CellData,
  type CellsMap,
  type PlaceData,
  type StyleValue,
  type ViewData,
} from './model.ts'
import { listPages, orderAfterPage, PAGES_ORIGIN } from './pages.ts'
import { ensureElement, isLockedCell } from './sharedElements.ts'
import { findShape, markedStyle, type ShapeId } from './shapes.ts'
import { COMPUTED_KEY, viewRuleData, type ViewRule, type ViewSlice } from './viewRule.ts'

/**
 * Pages that are views of the model of the board (see `boardModel.ts`): a page keeps a rule — the landscape, a system
 * and what is around it, the containers of a system, the components of a container, the deployment of an environment,
 * with a slice by teams, tags and technologies — and its cells follow the model. The cells a view computed are cells of
 * the same elements as anywhere else, marked with {@link COMPUTED_KEY}; their places, sizes and looks are the view's.
 * Whatever a participant draws on a view stays as it is, and is a part of the model as on any page.
 *
 * {@link viewContents} tells what a view shows, {@link syncView} brings the computed cells of its page in line with it.
 * Both read the document only and write the same for every participant who has the same document: two participants
 * who bring a view in line at the same time write equal cells under equal ids.
 */

/** Origin of the transactions that bring views in line with the model: no history undoes them, nobody is their author. */
export const VIEW_ORIGIN = 'codraw:view'

/** What an item of a view is: what the view is about, a part of it, an element around it, a node, an instance. */
export type ItemRole = 'scope' | 'member' | 'neighbor' | 'node' | 'instance'

/** An item a view shows: one cell of an element. */
export interface ViewItem {
  /**
   * The element, or `<frame>~<element>` for one shown in a frame: a part of what the view is about, a node in a node, an
   * element running on a node. An element that moves into a frame or out of it is another item, with a place of its own.
   */
  key: string
  element: string
  role: ItemRole
  /** The key of the item of the frame it stands in: the boundary of the view, or its node; `null` for none. */
  frame: string | null
}

/** An edge a view shows between two items: the relations of the model between what they stand for. */
export interface ViewEdge {
  /** `<source>><target>` of the keys of the items. */
  key: string
  source: string
  target: string
  relations: ModelRelation[]
  label: string
  technology: string
  interaction: Interaction | null
}

export interface ViewContents {
  items: ViewItem[]
  edges: ViewEdge[]
}

/** The key of an item of the element `element` in the frame of the element `frame`, or of no frame. */
export const itemKey = (frame: string | null, element: string) => (frame === null ? element : `${frame}~${element}`)

/** The element an item of the key shows. */
export const itemElement = (key: string) => key.slice(key.lastIndexOf('~') + 1)

/** The key of the edge of a view between two items. */
export const edgeKey = (source: string, target: string) => `${source}>${target}`

/** The key is of an edge of a view. */
export const isEdgeKey = (key: string) => key.includes('>')

/** The element matches the slice: in each facet with values it has one of them. */
export function inSlice(element: ModelElement, slice: ViewSlice): boolean {
  const { owner, tags, technology } = element.properties
  if (slice.owners.length > 0 && !slice.owners.includes(owner)) return false
  if (slice.tags.length > 0 && !tags.some((tag) => slice.tags.includes(tag))) return false
  if (slice.technologies.length > 0 && !slice.technologies.includes(technology)) return false
  return true
}

/** «Списывает; Возвращает»: the different labels of relations, three at most and how many more. */
export function summaryLabel(relations: readonly ModelRelation[]): string {
  const labels = [...new Set(relations.map((relation) => relation.label.trim()).filter(Boolean))]
  if (labels.length <= 3) return labels.join('; ')
  return `${labels.slice(0, 3).join('; ')}; и ещё ${labels.length - 3}`
}

/** «HTTPS, gRPC»: the different technologies of relations. */
export function summaryTechnology(relations: readonly ModelRelation[]): string {
  return [...new Set(relations.map((relation) => relation.technology.trim()).filter(Boolean))].join(', ')
}

function summaryInteraction(relations: readonly ModelRelation[]): Interaction | null {
  const kinds = new Set(relations.map((relation) => relation.interaction))
  const [only] = kinds
  return kinds.size === 1 && only !== undefined ? only : null
}

/**
 * The item is hidden on its view: by its key, or by its element, which removing a drawn cell of it hides wherever the view
 * shows it.
 */
export const isHidden = (hidden: ReadonlySet<string>, item: Pick<ViewItem, 'key' | 'element'>) => hidden.has(item.key) || hidden.has(item.element)

/** One edge of each pair of items, from the relations between them; those hidden left out. */
function groupEdges(pairs: { source: string; target: string; relation: ModelRelation }[], hidden: ReadonlySet<string>): ViewEdge[] {
  const groups = new Map<string, { source: string; target: string; relations: ModelRelation[] }>()
  for (const { source, target, relation } of pairs) {
    const key = edgeKey(source, target)
    const group = groups.get(key)
    if (group) group.relations.push(relation)
    else groups.set(key, { source, target, relations: [relation] })
  }
  return [...groups.entries()]
    .filter(([key]) => !hidden.has(key))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, { source, target, relations }]) => ({
      key,
      source,
      target,
      relations,
      label: summaryLabel(relations),
      technology: summaryTechnology(relations),
      interaction: summaryInteraction(relations),
    }))
}

/**
 * What the view of `rule` shows of the model. `hidden` are keys of items and edges hidden on the view; `drawn` are the
 * elements a participant drew on the page of the view, which stand there for themselves: the edges of their relations go
 * to them.
 */
export function viewContents(
  model: BoardModel,
  rule: ViewRule,
  hidden: ReadonlySet<string> = new Set(),
  drawn: ReadonlySet<string> = new Set(),
): ViewContents {
  if (rule.kind === 'deployment') return deploymentContents(model, rule, hidden)
  const elements = model.elements
  const scope = rule.scope !== null ? (elements.get(rule.scope) ?? null) : null
  if (rule.kind !== 'landscape' && (scope === null || scope.level === 'node')) return { items: [], edges: [] }
  const root = (id: string) => ancestry(model, id).at(-1) ?? id
  /** The ancestor-or-self of `id` whose parent is `above`, `above` itself, or `null` when `above` is not above it. */
  const childOf = (id: string, above: string) => {
    const chain = ancestry(model, id)
    const at = chain.indexOf(above)
    return at > 0 ? chain[at - 1]! : at === 0 ? above : null
  }
  const system = rule.kind === 'components' ? scope!.parent : null
  /** What stands for the element `id` on the view: the element at the level of the view, above it or itself. */
  const candidate = (id: string): string | null => {
    const element = elements.get(id)
    if (!element || element.level === 'node') return null
    switch (rule.kind) {
      case 'landscape': {
        const top = elements.get(root(id))!
        return top.level === 'person' || top.level === 'system' ? top.id : null
      }
      case 'context':
        return root(id)
      case 'containers':
        return childOf(id, scope!.id) ?? root(id)
      default:
        return childOf(id, scope!.id) ?? (system !== null ? childOf(id, system) : null) ?? root(id)
    }
  }
  /** What stands for the element `id`: the nearest of it and its ancestors drawn on the page, or its candidate. */
  const standsFor = (id: string): string | null => ancestry(model, id).find((above) => drawn.has(above)) ?? candidate(id)

  // The items by their elements: each element is one item of such a view.
  const shown = new Map<string, ViewItem>()
  // The boundary of what the view is about is an item of its own: elsewhere the element is a shape, not a frame.
  const scopeKey = scope ? itemKey(scope.id, scope.id) : null
  const add = (element: string, role: ItemRole) => {
    if (shown.has(element)) return
    // A part of what the view is about stands in its boundary; the landscape has no boundary.
    const framed = role === 'member' && scope !== null
    const key = role === 'scope' ? scopeKey! : framed ? itemKey(scope.id, element) : element
    shown.set(element, { key, element, role, frame: framed ? scopeKey : null })
  }
  const passes = (id: string) => inSlice(elements.get(id)!, rule)
  if (rule.kind === 'landscape') {
    for (const element of elements.values()) {
      if ((element.level === 'person' || element.level === 'system') && element.parent === null && passes(element.id)) add(element.id, 'member')
    }
  } else {
    add(scope!.id, 'scope')
    const core = new Set([scope!.id])
    if (rule.kind === 'containers' || rule.kind === 'components') {
      const level = rule.kind === 'containers' ? 'container' : 'component'
      for (const id of model.children.get(scope!.id) ?? []) {
        if (elements.get(id)!.level !== level || !passes(id)) continue
        add(id, 'member')
        core.add(id)
      }
    }
    // What the core is connected to, at the level of the view.
    const inside = (id: string) => ancestry(model, id).includes(scope!.id)
    for (const relation of model.relations) {
      const ends = [candidate(relation.source), candidate(relation.target)] as const
      for (const [here, there] of [ends, [ends[1], ends[0]]] as const) {
        if (here === null || there === null || !core.has(here) || shown.has(there) || inside(there) || !passes(there)) continue
        add(there, 'neighbor')
      }
    }
  }
  // Drawn elements stand for themselves; those the view shows anyway keep their items.
  for (const id of drawn) {
    const element = elements.get(id)
    if (element && element.level !== 'node' && !shown.has(id)) add(id, 'neighbor')
  }

  const items = [...shown.values()].filter((item) => !isHidden(hidden, item))
  const visible = new Set(items.map((item) => item.element))
  const pairs = model.relations.flatMap((relation) => {
    const source = standsFor(relation.source)
    const target = standsFor(relation.target)
    if (source === null || target === null || source === target || !visible.has(source) || !visible.has(target)) return []
    // An edge between an element and something inside it has no place on the view.
    if (ancestry(model, source).includes(target) || ancestry(model, target).includes(source)) return []
    return [{ source: shown.get(source)!.key, target: shown.get(target)!.key, relation }]
  })
  return { items, edges: groupEdges(pairs, hidden) }
}

/**
 * The deployment of an environment: its nodes, the nodes in them, the elements running on them, and the edges between
 * these of the relations of the elements, of a component as of its container.
 */
function deploymentContents(model: BoardModel, rule: ViewRule, hidden: ReadonlySet<string>): ViewContents {
  const environment = rule.environment ?? ''
  const nodes = [...model.elements.values()].filter((element) => element.level === 'node' && element.environment === environment)
  const inEnvironment = new Set(nodes.map((node) => node.id))
  const parentOf = (id: string) => {
    const parent = model.elements.get(id)!.parent
    return parent !== null && inEnvironment.has(parent) ? parent : null
  }
  const depth = (id: string): number => {
    let count = 0
    for (let current = parentOf(id); current !== null && count < nodes.length; current = parentOf(current)) count++
    return count
  }
  // Parents before the nodes in them; the keys of nodes follow their frames.
  const nodeKeys = new Map<string, string>()
  const items: ViewItem[] = []
  for (const node of [...nodes].sort((a, b) => depth(a.id) - depth(b.id))) {
    const parent = parentOf(node.id)
    if (parent !== null && !nodeKeys.has(parent)) continue
    const frame = parent === null ? null : nodeKeys.get(parent)!
    const key = itemKey(parent, node.id)
    // A hidden node hides what is in it.
    if (isHidden(hidden, { key, element: node.id })) continue
    nodeKeys.set(node.id, key)
    items.push({ key, element: node.id, role: 'node', frame })
  }
  const instancesOf = new Map<string, string[]>()
  for (const instance of model.instances) {
    const frame = nodeKeys.get(instance.node)
    if (frame === undefined) continue
    const key = itemKey(instance.node, instance.element)
    if (!inSlice(model.elements.get(instance.element)!, rule) || isHidden(hidden, { key, element: instance.element })) continue
    items.push({ key, element: instance.element, role: 'instance', frame })
    instancesOf.set(instance.element, [...(instancesOf.get(instance.element) ?? []), key])
  }
  /** The items that stand for the element `id`: a node of the view, or the instances of it or of what it is a part of. */
  const standFor = (id: string): string[] => {
    const node = nodeKeys.get(id)
    if (node !== undefined) return [node]
    const running = ancestry(model, id).find((above) => instancesOf.has(above))
    return running === undefined ? [] : instancesOf.get(running)!
  }
  const pairs = model.relations.flatMap((relation) =>
    standFor(relation.source).flatMap((source) =>
      standFor(relation.target)
        .filter((target) => target !== source)
        .map((target) => ({ source, target, relation })),
    ),
  )
  return { items, edges: groupEdges(pairs, hidden) }
}

// --- The rule of a page ---

/** The `view` of the entry of a page that is a view; `null` for a page that is none. */
function viewEntry(doc: Y.Doc, pageId: string): Y.Map<unknown> | null {
  const entry = getPages(doc).get(pageId)
  const view = entry instanceof Y.Map ? entry.get('view') : undefined
  return view instanceof Y.Map ? view : null
}

/** The page is a view of the model. */
export const isViewPage = (doc: Y.Doc, pageId: string) => viewEntry(doc, pageId) !== null

/** The board has views of its model. */
export function hasViews(doc: Y.Doc): boolean {
  for (const entry of getPages(doc).values()) if (entry instanceof Y.Map && entry.get('view') instanceof Y.Map) return true
  return false
}

/** The view a page is, read; `null` for a page that is none. */
export function viewOf(doc: Y.Doc, pageId: string): ViewData | null {
  const entry = getPages(doc).get(pageId)
  return entry ? (readPage(entry).view ?? null) : null
}

/** A map of the `view` of a page, made when it is missing. */
function viewChild(view: Y.Map<unknown>, key: 'hidden' | 'places'): Y.Map<unknown> {
  let map = view.get(key)
  if (!(map instanceof Y.Map)) {
    map = new Y.Map<unknown>()
    view.set(key, map)
  }
  return map as Y.Map<unknown>
}

/** Sets the rule of a view; returns whether it changed. Call inside a transaction of the page, which makes it an undo step. */
export function writeViewRule(doc: Y.Doc, pageId: string, rule: ViewRule): boolean {
  const view = viewEntry(doc, pageId)
  if (!view) return false
  const data = viewRuleData(rule)
  if (JSON.stringify(view.get('rule')) === JSON.stringify(data)) return false
  view.set('rule', data)
  return true
}

/**
 * Hides the items and edges `keys` on the view, remembering where the items stood by `places`; call inside the
 * transaction that removed their cells.
 */
export function hideOnView(doc: Y.Doc, pageId: string, keys: Iterable<string>, places: ReadonlyMap<string, PlaceData> = new Map()) {
  const view = viewEntry(doc, pageId)
  if (!view) return
  const hidden = viewChild(view, 'hidden')
  for (const key of keys) if (!hidden.has(key)) hidden.set(key, true)
  if (places.size === 0) return
  const remembered = viewChild(view, 'places')
  for (const [key, place] of places) remembered.set(key, { ...place })
}

/** Shows again what was hidden on the view, the keys `keys` or all; returns whether anything was hidden. */
export function showOnView(doc: Y.Doc, pageId: string, keys: Iterable<string> | 'all'): boolean {
  const hidden = viewEntry(doc, pageId)?.get('hidden')
  if (!(hidden instanceof Y.Map)) return false
  const which = keys === 'all' ? Array.from(hidden.keys()) : [...keys].filter((key) => hidden.has(key))
  which.forEach((key) => hidden.delete(key))
  return which.length > 0
}

/**
 * The page stops being a view: its rule goes, and its computed cells become cells drawn on it, of the same elements.
 * Call inside a transaction of the page; returns the cells that changed.
 */
export function detachView(doc: Y.Doc, pageId: string): string[] {
  const entry = getPages(doc).get(pageId)
  if (!(entry instanceof Y.Map) || !(entry.get('view') instanceof Y.Map)) return []
  entry.delete('view')
  const changed: string[] = []
  getCells(doc, pageId).forEach((cell, id) => {
    const style = cell instanceof Y.Map ? cell.get('style') : undefined
    if (style instanceof Y.Map && style.has(COMPUTED_KEY)) {
      style.delete(COMPUTED_KEY)
      changed.push(id)
    }
  })
  return changed
}

/**
 * Adds a page that is a view of `rule` right after `afterId`, filled with the model, and returns its id. Adding it is no
 * undo step, as adding a page is none.
 */
export function createViewPage(doc: Y.Doc, afterId: string | null, rule: ViewRule, name: string): string {
  const id = newId()
  doc.transact(() => writePage(doc, id, { name, order: orderAfterPage(doc, afterId), view: { rule, hidden: [], places: {} } }), PAGES_ORIGIN)
  doc.transact(() => syncView(doc, id, buildModel(doc)), VIEW_ORIGIN)
  return id
}

/**
 * The keys a removal of the cells `removed` of a view hides on it: computed shapes, computed edges whose ends stay, and
 * the elements of drawn cells that have no other cell on the page; and where the computed shapes stood. Read before the
 * cells are removed.
 */
export function keysHiddenByRemoval(cells: CellsMap, removed: readonly string[]): { keys: string[]; places: Map<string, PlaceData> } {
  const places = new Map<string, PlaceData>()
  const gone = new Set(removed)
  const remaining = new Set<string>()
  cells.forEach((cell, id) => {
    if (gone.has(id) || !(cell instanceof Y.Map)) return
    const element = cellElementId(cell)
    if (element !== null) remaining.add(element)
  })
  const keys = new Set<string>()
  for (const id of removed) {
    const cell = cells.get(id)
    if (!(cell instanceof Y.Map)) continue
    const style = cell.get('style')
    const key = style instanceof Y.Map ? style.get(COMPUTED_KEY) : undefined
    if (typeof key === 'string' && key !== '') {
      const ends = cell.get('kind') === 'edge' ? [cell.get('source'), cell.get('target')] : []
      if (ends.some((end) => typeof end === 'string' && gone.has(end))) continue
      keys.add(key)
      const box = boxOf(readCell(id, cell))
      if (box && cell.get('kind') === 'vertex') places.set(key, box)
      continue
    }
    const element = cellElementId(cell)
    if (element !== null && cell.get('kind') === 'vertex' && !remaining.has(element)) keys.add(element)
  }
  return { keys: [...keys], places }
}

// --- The cells of a view ---

/** Room between the cells a view places, and inside its frames. */
const GAP = 60
const FRAME_PAD = { top: 60, left: 40, right: 40, bottom: 40 }
const DEFAULT_SIZE = { width: 160, height: 80 }
const BOUNDARY_SIZE = { width: 640, height: 400 }

/** Keys of the style of an edge that tie it to the sides of its ends on the page it was drawn on. */
const EDGE_PLACE_KEYS = ['exitX', 'exitY', 'exitDx', 'exitDy', 'exitPerimeter', 'entryX', 'entryY', 'entryDx', 'entryDy', 'entryPerimeter']

/** The style of a cell for a copy of it on a view: without its lock, link, the call of an edge and the lines it kept. */
function lookOf(style: Record<string, StyleValue>): Record<string, StyleValue> {
  const {
    [LOCKED_KEY]: _locked,
    [LOCKED_BY_KEY]: _lockedBy,
    [LINK_KEY]: _link,
    [EDGE_API_KEY]: _api,
    [OWN_LINES_KEY]: _own,
    [COMPUTED_KEY]: _computed,
    ...look
  } = style
  return look
}

interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** What a new computed cell of an element is drawn as, and how big. */
interface Look {
  style: Record<string, StyleValue>
  value: string
  width: number
  height: number
}

/** The properties of an element as keys of a style, from one of its cells. */
const propertyKeys = (style: Record<string, StyleValue> | undefined) =>
  Object.fromEntries(Object.entries(style ?? {}).filter(([key]) => isElementStyleKey(key)))

/**
 * The look of a new cell of an item: the boundary of C4 for what the view is about, otherwise that of a cell of its
 * element that is no boundary, or the shape of its kind.
 */
function lookOfItem(doc: Y.Doc, element: ModelElement, item: ViewItem, elementId: string): Look | null {
  const cells = element.cells.flatMap((ref) => {
    const cell = getCells(doc, ref.pageId).get(ref.cellId)
    return cell instanceof Y.Map ? [readCell(ref.cellId, cell)] : []
  })
  const made = (preset: ShapeId, size?: { width: number; height: number }): Look | null => {
    const shape = findShape(preset)
    if (!shape) return null
    const style: Record<string, StyleValue> = { ...(markedStyle(shape) as Record<string, StyleValue>), ...propertyKeys(cells[0]?.style), [ELEMENT_KEY]: elementId }
    return { style, value: composeLabel(element.properties, style), width: size?.width ?? shape.width, height: size?.height ?? shape.height }
  }
  if (item.role === 'scope') return made('c4-boundary', BOUNDARY_SIZE)
  const plain = cells.find((cell) => !isC4Boundary(cell.style))
  if (plain) {
    return {
      style: { ...lookOf(plain.style), [ELEMENT_KEY]: elementId },
      value: plain.value,
      width: plain.geometry?.width ?? DEFAULT_SIZE.width,
      height: plain.geometry?.height ?? DEFAULT_SIZE.height,
    }
  }
  // Drawn as a boundary only: the shape of its kind.
  const kind = element.properties.kind
  return kind !== null && ELEMENT_KINDS[kind] ? made(kind) : null
}

/** The box of a cell, `null` for one without a box of its own. */
const boxOf = (cell: CellData | null | undefined): Box | null =>
  cell?.geometry && !cell.geometry.relative ? { x: cell.geometry.x, y: cell.geometry.y, width: cell.geometry.width, height: cell.geometry.height } : null

/** The smallest box around boxes; `null` around none. */
function around(boxes: readonly Box[]): Box | null {
  if (boxes.length === 0) return null
  const left = Math.min(...boxes.map((box) => box.x))
  const top = Math.min(...boxes.map((box) => box.y))
  const right = Math.max(...boxes.map((box) => box.x + box.width))
  const bottom = Math.max(...boxes.map((box) => box.y + box.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/** A frame grown to hold a box with room around it. */
function grow(frame: Box, box: Box): Box {
  const right = Math.max(frame.x + frame.width, box.x + box.width + FRAME_PAD.right)
  const bottom = Math.max(frame.y + frame.height, box.y + box.height + FRAME_PAD.bottom)
  return { x: frame.x, y: frame.y, width: right - frame.x, height: bottom - frame.y }
}

/** The id of the computed cell of a key: the same for every participant. */
export const computedId = (key: string) => `v-${key}`

/** `id`, or the first of `id-2`, `id-3`, … that the page does not have. */
function freeId(cells: CellsMap, id: string): string {
  if (!cells.has(id)) return id
  for (let index = 2; ; index++) if (!cells.has(`${id}-${index}`)) return `${id}-${index}`
}

/** How many places a view remembers before it forgets those of elements the model no longer has. */
const MAX_PLACES = 500

/**
 * Brings the computed cells of the page `pageId` in line with what its view shows of `model`: makes the cells of new
 * items and edges, changes the labels, properties and ends of edges, and removes what left the view, remembering where
 * it stood. Locked computed cells stay as they are; a computed shape with an edge drawn to it becomes a drawn one rather
 * than go. Returns the ids of the cells of the page it changed. Call inside a transaction, e.g. of {@link VIEW_ORIGIN}.
 */
export function syncView(doc: Y.Doc, pageId: string, model: BoardModel): string[] {
  const entry = getPages(doc).get(pageId)
  const view = entry ? readPage(entry).view : undefined
  if (!view) return []
  const cells = getCells(doc, pageId)
  const data = sortedCells(cells)
  const byId = new Map(data.map((cell) => [cell.id, cell]))
  const layers = layerIds(data)
  const changed = new Set<string>()
  const locked = (id: string) => isLockedCell(cells, id)

  // What a participant drew on the page: elements, and elements running on nodes.
  const drawnElements = new Map<string, string>()
  for (const element of model.elements.values()) {
    const cell = element.cells.find((ref) => ref.pageId === pageId)
    if (cell) drawnElements.set(element.id, cell.cellId)
  }
  const drawnInstances = new Map<string, string>()
  for (const instance of model.instances) {
    const key = itemKey(instance.node, instance.element)
    if (instance.cell.pageId === pageId && !drawnInstances.has(key)) drawnInstances.set(key, instance.cell.cellId)
  }
  const drawnCell = (item: ViewItem) => (item.role === 'instance' ? drawnInstances.get(item.key) : drawnElements.get(item.element))
  const contents = viewContents(model, view.rule, new Set(view.hidden), new Set(drawnElements.keys()))

  /** The cell that shows each item on the page, once this sync is done. */
  const cellOf = new Map<string, string>()
  const wanted = new Map<string, ViewItem>()
  for (const item of contents.items) {
    const drawn = drawnCell(item)
    if (drawn !== undefined) cellOf.set(item.key, drawn)
    else wanted.set(item.key, item)
  }
  // The elements of the wanted items: a shape of a kind becomes an element, as a drag from the panel makes it one; a
  // locked one does not change, and is not shown.
  const elementIds = new Map<string, string>()
  for (const item of wanted.values()) {
    const element = model.elements.get(item.element)!
    if (element.stored) {
      elementIds.set(item.key, element.id)
      continue
    }
    const ref = element.cells[0]!
    if (isLockedCell(getCells(doc, ref.pageId), ref.cellId)) continue
    const id = ensureElement(doc, ref)
    if (id !== null) elementIds.set(item.key, id)
  }

  const computed = new Map<string, CellData[]>()
  for (const cell of data) {
    const key = cell.style[COMPUTED_KEY]
    if (typeof key === 'string' && key !== '') computed.set(key, [...(computed.get(key) ?? []), cell])
  }
  const manualEnds = new Set<string>()
  for (const cell of data) {
    if (cell.kind !== 'edge' || isComputedCell(cell.style, true)) continue
    if (cell.source) manualEnds.add(cell.source)
    if (cell.target) manualEnds.add(cell.target)
  }
  const shown = new Set(contents.items.map((item) => item.key))
  const places = viewChild(viewEntry(doc, pageId)!, 'places')
  const removedElements: (string | null)[] = []
  const removeCell = (cell: CellData) => {
    if (!cells.has(cell.id)) return
    for (const other of data) if (other.parent === cell.id) removeCell(other)
    removedElements.push(cellElementId(cells.get(cell.id)))
    cells.delete(cell.id)
    changed.add(cell.id)
  }
  const styleOf = (id: string) => cells.get(id)!.get('style') as Y.Map<StyleValue>

  // Computed shapes: one for each wanted item; the others go, or stay drawn when an edge is drawn to them.
  for (const [key, list] of computed) {
    const shapes = list.filter((cell) => cell.kind === 'vertex')
    if (shapes.length === 0) continue
    const element = elementIds.get(key)
    const keep = wanted.has(key) && element !== undefined ? (shapes.find((cell) => cell.id === computedId(key)) ?? shapes[0]!) : null
    for (const cell of shapes) {
      if (cell === keep) {
        cellOf.set(key, cell.id)
        // The shape became an element, or another participant made the cell another one's: it shows the item again.
        if (cellElementId(cells.get(cell.id)) !== element) {
          styleOf(cell.id).set(ELEMENT_KEY, element!)
          changed.add(cell.id)
        }
        continue
      }
      if (locked(cell.id)) continue
      if (manualEnds.has(cell.id) || data.some((other) => other.parent === cell.id && manualEnds.has(other.id))) {
        // An edge drawn to it is a relation of the model: the cell stays, as a drawn one.
        styleOf(cell.id).delete(COMPUTED_KEY)
        changed.add(cell.id)
        continue
      }
      const box = boxOf(cell)
      if (!shown.has(key) && box) places.set(key, box)
      removeCell(cell)
    }
  }

  // New shapes, placed.
  const fresh = [...wanted.values()].filter((item) => !cellOf.has(item.key) && elementIds.has(item.key))
  const looks = new Map<string, Look>()
  for (const item of fresh) {
    const look = lookOfItem(doc, model.elements.get(item.element)!, item, elementIds.get(item.key)!)
    if (look) looks.set(item.key, look)
  }
  const placing = fresh.filter((item) => looks.has(item.key))
  const occupied = data.filter((cell) => cells.has(cell.id) && cell.kind === 'vertex' && cell.parent !== null && layers.has(cell.parent)).flatMap((cell) => boxOf(cell) ?? [])
  const { boxes, frames } = placeItems(view.rule, contents, placing, looks, view.places, (key) => {
    const id = cellOf.get(key)
    return id === undefined ? null : boxOf(byId.get(id) ?? (cells.get(id) ? readCell(id, cells.get(id)!) : null))
  }, occupied)
  let lastOrder = data.filter((cell) => cell.parent === LAYER_CELL_ID && cells.has(cell.id)).map((cell) => cell.order).sort().at(-1) ?? null
  const nextOrder = () => (lastOrder = orderBetween(lastOrder, null))
  for (const item of placing) {
    const look = looks.get(item.key)!
    const id = freeId(cells, computedId(item.key))
    writeCell(cells, {
      id,
      kind: 'vertex',
      parent: LAYER_CELL_ID,
      order: nextOrder(),
      value: look.value,
      geometry: boxes.get(item.key)!,
      source: null,
      target: null,
      style: { ...look.style, [COMPUTED_KEY]: item.key },
    })
    cellOf.set(item.key, id)
    changed.add(id)
  }
  // Computed frames grow around the new cells placed in them.
  for (const [key, box] of frames) {
    const id = cellOf.get(key)
    const cell = id === undefined ? undefined : cells.get(id)
    if (!cell || locked(id!) || !isComputedCell(readCell(id!, cell).style, true)) continue
    const geometry = cell.get('geometry') as Box | null
    if (geometry && geometry.x === box.x && geometry.y === box.y && geometry.width === box.width && geometry.height === box.height) continue
    cell.set('geometry', { ...(geometry ?? {}), ...box })
    changed.add(id!)
  }

  // Edges: one for each wanted pair whose items have cells and that no drawn edge joins already.
  const shapeAt = (id: string | null): string | null => {
    for (let cell = id ? byId.get(id) : undefined; cell; cell = cell.parent ? byId.get(cell.parent) : undefined) {
      if (cell.parent !== null && layers.has(cell.parent)) return cell.id
    }
    return id
  }
  const drawnPairs = new Set<string>()
  for (const cell of data) {
    if (cell.kind === 'edge' && !isComputedCell(cell.style, true)) drawnPairs.add(`${shapeAt(cell.source)}>${shapeAt(cell.target)}`)
  }
  const wantedEdges = new Map<string, ViewEdge>()
  for (const edge of contents.edges) {
    const source = cellOf.get(edge.source)
    const target = cellOf.get(edge.target)
    if (source !== undefined && target !== undefined && !drawnPairs.has(`${source}>${target}`)) wantedEdges.set(edge.key, edge)
  }
  for (const [key, list] of computed) {
    const edges = list.filter((cell) => cell.kind === 'edge' && cells.has(cell.id))
    if (edges.length === 0) continue
    const edge = wantedEdges.get(key)
    const keep = edge ? (edges.find((cell) => cell.id === computedId(key)) ?? edges[0]!) : null
    for (const cell of edges) if (cell !== keep && !locked(cell.id)) removeCell(cell)
    if (keep && edge) {
      if (!locked(keep.id)) {
        const write = writeCell(cells, {
          ...readCell(keep.id, cells.get(keep.id)!),
          value: edge.label,
          source: cellOf.get(edge.source)!,
          target: cellOf.get(edge.target)!,
          style: withEdgeProperties(readCell(keep.id, cells.get(keep.id)!).style, edge),
        })
        if (write.fields.length > 0 || write.style.length > 0) changed.add(keep.id)
      }
      wantedEdges.delete(key)
    }
  }
  for (const edge of wantedEdges.values()) {
    const sample = edge.relations[0]!.edge
    const sampleCell = getCells(doc, sample.pageId).get(sample.cellId)
    const style = sampleCell instanceof Y.Map ? lookOf(readCell(sample.cellId, sampleCell).style) : {}
    for (const key of EDGE_PLACE_KEYS) delete style[key]
    const id = freeId(cells, computedId(edge.key))
    writeCell(cells, {
      id,
      kind: 'edge',
      parent: LAYER_CELL_ID,
      order: nextOrder(),
      value: edge.label,
      geometry: { x: 0, y: 0, width: 0, height: 0, relative: true },
      source: cellOf.get(edge.source)!,
      target: cellOf.get(edge.target)!,
      style: { ...withEdgeProperties(style, edge), [COMPUTED_KEY]: edge.key },
    })
    changed.add(id)
  }

  dropUnusedElements(doc, removedElements)
  // A view forgets where the elements stood that the model no longer has, once it remembers many.
  if (places.size > MAX_PLACES) {
    for (const key of Array.from(places.keys())) if (!key.split('~').every((part) => model.elements.has(part))) places.delete(key)
  }
  return [...changed]
}

/** The style of a computed edge with the technology and the kind of its relations. */
function withEdgeProperties(style: Record<string, StyleValue>, edge: ViewEdge): Record<string, StyleValue> {
  const next = { ...style }
  for (const [key, value] of Object.entries(edgePropertiesStyle({ technology: edge.technology, interaction: edge.interaction }))) {
    if (value === undefined) delete next[key]
    else next[key] = value
  }
  return next
}

/**
 * Where the new cells of a view stand. On a page with nothing on it yet, everything is laid out: each frame holds its
 * items in a grid; for a view about an element, what calls it stands at its left and the rest at its right, otherwise
 * the items stand in a grid. On a page with cells, a new cell stands where it stood before, or inside its frame right of
 * what the frame holds, the frame growing around it, or with what it holds right of everything on the page. Returns the
 * boxes of the new cells and the boxes of frames that grew.
 */
function placeItems(
  rule: ViewRule,
  contents: ViewContents,
  fresh: readonly ViewItem[],
  looks: ReadonlyMap<string, Look>,
  remembered: Readonly<Record<string, PlaceData>>,
  existing: (key: string) => Box | null,
  occupied: readonly Box[],
): { boxes: Map<string, Box>; frames: Map<string, Box> } {
  const boxes = new Map<string, Box>()
  const frames = new Map<string, Box>()
  if (fresh.length === 0) return { boxes, frames }
  const freshKeys = new Set(fresh.map((item) => item.key))
  const sizeOf = (item: ViewItem) => {
    const look = looks.get(item.key)
    return { width: look?.width ?? DEFAULT_SIZE.width, height: look?.height ?? DEFAULT_SIZE.height }
  }
  const childrenOf = (key: string) => fresh.filter((item) => item.frame === key)
  /** The size of an item with its new items laid out inside it, and their boxes from its top-left corner. */
  const measure = (item: ViewItem): { width: number; height: number; inner: Map<string, Box> } => {
    const inner = new Map<string, Box>()
    const own = sizeOf(item)
    const children = childrenOf(item.key).map((child) => ({ child, ...measure(child) }))
    if (children.length === 0) return { ...own, inner }
    const columns = Math.ceil(Math.sqrt(children.length))
    const cellWidth = Math.max(...children.map((entry) => entry.width))
    let y = FRAME_PAD.top
    let width = 0
    for (let row = 0; row * columns < children.length; row++) {
      const line = children.slice(row * columns, (row + 1) * columns)
      line.forEach((entry, index) => {
        const x = FRAME_PAD.left + index * (cellWidth + GAP) + (cellWidth - entry.width) / 2
        inner.set(entry.child.key, { x, y, width: entry.width, height: entry.height })
        for (const [key, box] of entry.inner) inner.set(key, { ...box, x: box.x + x, y: box.y + y })
        width = Math.max(width, x + entry.width)
      })
      y += Math.max(...line.map((entry) => entry.height)) + GAP
    }
    return { width: Math.max(own.width, width + FRAME_PAD.right), height: Math.max(own.height, y - GAP + FRAME_PAD.bottom), inner }
  }
  const measureSize = (item: ViewItem) => {
    const { width, height } = measure(item)
    return { width, height }
  }
  /** Puts an item with what it holds at a corner; remembered places win. */
  const put = (item: ViewItem, x: number, y: number) => {
    const { width, height, inner } = measure(item)
    const at = remembered[item.key]
    const origin = at ? { x: at.x, y: at.y } : { x, y }
    boxes.set(item.key, at ? { ...at } : { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) })
    for (const [key, box] of inner) {
      const own = remembered[key]
      boxes.set(key, own ? { ...own } : { x: Math.round(origin.x + box.x), y: Math.round(origin.y + box.y), width: box.width, height: box.height })
    }
    return { width: at?.width ?? width, height: at?.height ?? height }
  }
  // The items that start a block: of no frame, or of a frame already on the page, or of one that is not shown.
  const roots = fresh.filter((item) => item.frame === null || !freshKeys.has(item.frame))

  if (occupied.length === 0) {
    const core = new Set(contents.items.filter((item) => item.role === 'scope' || item.role === 'member').map((item) => item.key))
    const callers = new Set(contents.edges.filter((edge) => core.has(edge.target) && !core.has(edge.source)).map((edge) => edge.source))
    const scoped = rule.kind === 'context' || rule.kind === 'containers' || rule.kind === 'components'
    if (scoped) {
      // Columns: those who call the core, the core, the others; one under another in each.
      const columns = [
        roots.filter((item) => item.role === 'neighbor' && callers.has(item.key)),
        roots.filter((item) => item.role !== 'neighbor'),
        roots.filter((item) => item.role === 'neighbor' && !callers.has(item.key)),
      ]
      let x = 0
      for (const column of columns) {
        if (column.length === 0) continue
        const width = Math.max(...column.map((item) => measure(item).width))
        let y = 0
        for (const item of column) {
          const size = measure(item)
          y += put(item, x + (width - size.width) / 2, y).height + GAP
        }
        x += width + GAP * 2
      }
    } else {
      // A grid of rows.
      const perRow = Math.max(1, Math.ceil(Math.sqrt(roots.length)))
      let y = 0
      for (let row = 0; row * perRow < roots.length; row++) {
        let x = 0
        let height = 0
        for (const item of roots.slice(row * perRow, (row + 1) * perRow)) {
          const size = put(item, x, y)
          x += size.width + GAP
          height = Math.max(height, size.height)
        }
        y += height + GAP
      }
    }
    return { boxes, frames }
  }

  // A page with cells: new items of frames on the page go inside them, the others right of everything, one under another.
  const page = around(occupied)!
  let y = page.y
  for (const item of roots) {
    const frame = item.frame === null ? null : (frames.get(item.frame) ?? existing(item.frame))
    if (frame === null || remembered[item.key]) {
      if (item.frame !== null && remembered[item.key]) {
        put(item, 0, 0)
        continue
      }
      const size = put(item, page.x + page.width + GAP, y)
      y += size.height + GAP
      continue
    }
    const inside = contents.items
      .filter((other) => other.frame === item.frame && other.key !== item.key)
      .flatMap((other) => boxes.get(other.key) ?? existing(other.key) ?? [])
    const content = around(inside)
    const size = measureSize(item)
    let at = { x: frame.x + FRAME_PAD.left, y: frame.y + FRAME_PAD.top }
    if (content) {
      // Right of the last row while the frame is wide enough, else a new row under it: what is around the frame stays
      // clear of it.
      const top = Math.max(...inside.map((box) => box.y))
      const row = inside.filter((box) => box.y + box.height > top)
      const x = Math.max(...row.map((box) => box.x + box.width)) + GAP
      at = x + size.width <= frame.x + frame.width - FRAME_PAD.right ? { x, y: top } : { x: content.x, y: content.y + content.height + GAP }
    }
    put(item, at.x, at.y)
    frames.set(item.frame!, grow(frame, boxes.get(item.key)!))
  }
  return { boxes, frames }
}

/** Brings all views of the board in line with its model; returns the cells changed on each page. */
export function syncViews(doc: Y.Doc): Map<string, string[]> {
  const views = listPages(doc).filter((page) => page.view !== undefined)
  const changed = new Map<string, string[]>()
  if (views.length === 0) return changed
  let model = buildModel(doc)
  for (const page of views) {
    const ids = syncView(doc, page.id, model)
    if (ids.length === 0) continue
    changed.set(page.id, ids)
    // A shape made an element for this view is one for the next.
    model = buildModel(doc)
  }
  return changed
}
