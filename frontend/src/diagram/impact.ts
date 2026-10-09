import * as Y from 'yjs'
import { ELEMENT_KINDS } from './elementKinds.ts'
import { elementProperties, labelLines } from './elementProps.ts'
import { isFreehandStyle } from './freehand.ts'
import { elementIdOf, getCells, LAYER_CELL_ID, readCell, ROOT_CELL_ID } from './model.ts'
import { listPages } from './pages.ts'
import { isSequenceStyle, sequencePartOf } from './sequence.ts'
import { isTableStyle, type ShapeStyle } from './shapes.ts'

/**
 * Impact analysis: what an element depends on and what depends on it, along the edges of the diagram, and the shortest
 * paths between two elements. An edge is a dependency of its source on its target, as an arrow of a call reads, but a
 * message channel — a queue, a topic of events — is a dependency of whatever is linked to it, whichever way its edge
 * points: an import of AsyncAPI draws receiving as an edge from the topic to the service. A field of a table stands for
 * its table. The rules are data, without maxGraph: the canvas highlights a page with them, and the board lists the
 * dependencies of an element on all pages through the cells of its element.
 */

/** A cell of a page as the analysis reads it: from the document or from the model of the canvas. */
export interface ImpactRecord {
  id: string
  kind: 'vertex' | 'edge'
  parent: string | null
  source: string | null
  target: string | null
  value: string
  style: Record<string, unknown>
}

/** How far the dependencies go: one step, two, or all. */
export type ImpactDepth = 1 | 2 | 'all'

/** `from` depends on `to` through the edge `edge`. */
export interface DependencyLink {
  edge: string
  from: string
  to: string
}

/** The node of a cell: a field or an index of a table is its table; edges, their labels and parts of sequence diagrams are none. */
function nodeOf(id: string | null, byId: Map<string, ImpactRecord>): string | null {
  const record = id === null ? undefined : byId.get(id)
  if (!record || record.kind !== 'vertex') return null
  const parent = record.parent === null ? undefined : byId.get(record.parent)
  if (parent?.kind === 'edge') return null
  if (parent && isTableStyle(parent.style as ShapeStyle)) return parent.id
  if (isSequenceStyle(record.style) || sequencePartOf(record.style) !== null) return null
  return record.id
}

/** A queue or a topic of events: an element of a kind that carries messages. */
function isChannel(record: ImpactRecord | undefined): boolean {
  if (!record) return false
  const kind = elementProperties(record.style, record.value).kind
  return kind !== null && ELEMENT_KINDS[kind]?.variant === 'queue'
}

/** The dependencies the edges of a page tell, between the nodes they connect; lines drawn by hand tell none. */
export function dependencyLinks(records: readonly ImpactRecord[]): DependencyLink[] {
  const byId = new Map(records.map((record) => [record.id, record]))
  const links: DependencyLink[] = []
  for (const edge of records) {
    if (edge.kind !== 'edge' || isFreehandStyle(edge.style)) continue
    const source = nodeOf(edge.source, byId)
    const target = nodeOf(edge.target, byId)
    if (source === null || target === null || source === target) continue
    // What is linked to a channel depends on it, whichever way the edge points.
    const reversed = isChannel(byId.get(source)) && !isChannel(byId.get(target))
    links.push(reversed ? { edge: edge.id, from: target, to: source } : { edge: edge.id, from: source, to: target })
  }
  return links
}

const maxSteps = (depth: ImpactDepth) => (depth === 'all' ? Infinity : depth)

/**
 * The nodes reached from `start` along `links` in one direction, each with the step it is first reached at, up to
 * `depth` steps, and the links that lead from a reached node (or `start`) within the depth to a reached one.
 */
function reach<T extends { from: string; to: string }>(
  links: readonly T[],
  start: string,
  depth: ImpactDepth,
  forward: boolean,
): { nodes: Map<string, number>; links: T[] } {
  const nodes = new Map<string, number>()
  const used: T[] = []
  const limit = maxSteps(depth)
  const step = (link: T) => (forward ? [link.from, link.to] : [link.to, link.from])
  let frontier = [start]
  const seen = new Set([start])
  for (let distance = 1; distance <= limit && frontier.length > 0; distance++) {
    const next: string[] = []
    const current = new Set(frontier)
    for (const link of links) {
      const [here, there] = step(link)
      if (!current.has(here)) continue
      used.push(link)
      if (seen.has(there)) continue
      seen.add(there)
      nodes.set(there, distance)
      next.push(there)
    }
    frontier = next
  }
  return { nodes, links: used }
}

/** What a node depends on and what depends on it, and the edges that tell it. */
export interface DependencyArea {
  /** Nodes `start` depends on, with the step each is reached at. */
  dependencies: Map<string, number>
  /** Nodes that depend on `start`, with the step each is reached at. */
  dependents: Map<string, number>
  dependencyEdges: Set<string>
  dependentEdges: Set<string>
}

/** The dependencies of `start` and its dependents along `links`, up to `depth` steps; `start` is in neither. */
export function dependencyArea(links: readonly DependencyLink[], start: string, depth: ImpactDepth): DependencyArea {
  const down = reach(links, start, depth, true)
  const up = reach(links, start, depth, false)
  down.nodes.delete(start)
  up.nodes.delete(start)
  return {
    dependencies: down.nodes,
    dependents: up.nodes,
    dependencyEdges: new Set(down.links.map((link) => link.edge)),
    dependentEdges: new Set(up.links.map((link) => link.edge)),
  }
}

/** The node of the cell `cellId` of a page for the analysis: a field is its table; `null` for a cell that is none. */
export function impactNode(records: readonly ImpactRecord[], cellId: string): string | null {
  return nodeOf(cellId, new Map(records.map((record) => [record.id, record])))
}

/** The shortest paths between two nodes: their nodes and edges, how many steps they take, and whether they follow the arrows. */
export interface PathResult {
  nodes: Set<string>
  edges: Set<string>
  steps: number
  directed: boolean
}

type Step = { edge: string; from: string; to: string }

/** All shortest paths from `start` to `goal` along `steps`, or `null` when there is none. */
function shortest(steps: readonly Step[], start: string, goal: string): Omit<PathResult, 'directed'> | null {
  const distance = new Map([[start, 0]])
  const before = new Map<string, Step[]>()
  let frontier = [start]
  while (frontier.length > 0 && !distance.has(goal)) {
    const current = new Set(frontier)
    const next: string[] = []
    for (const step of steps) {
      if (!current.has(step.from)) continue
      const known = distance.get(step.to)
      const reached = distance.get(step.from)! + 1
      if (known === undefined) {
        distance.set(step.to, reached)
        next.push(step.to)
      }
      if ((known ?? reached) === reached) before.set(step.to, [...(before.get(step.to) ?? []), step])
    }
    frontier = next
  }
  if (!distance.has(goal)) return null
  const nodes = new Set<string>([goal])
  const edges = new Set<string>()
  const back = [goal]
  while (back.length > 0) {
    const node = back.pop()!
    for (const step of before.get(node) ?? []) {
      edges.add(step.edge)
      if (!nodes.has(step.from)) {
        nodes.add(step.from)
        back.push(step.from)
      }
    }
  }
  return { nodes, edges, steps: distance.get(goal)! }
}

/**
 * The shortest paths between the nodes of the cells `a` and `b` along the edges of a page: along the arrows from `a` to
 * `b`, else from `b` to `a`, else whichever way the edges point. All paths of the least number of steps; `null` when
 * the cells are not connected or are no nodes.
 */
export function shortestPaths(records: readonly ImpactRecord[], a: string, b: string): PathResult | null {
  const byId = new Map(records.map((record) => [record.id, record]))
  const from = nodeOf(a, byId)
  const to = nodeOf(b, byId)
  if (from === null || to === null || from === to) return null
  const drawn: Step[] = []
  for (const edge of records) {
    if (edge.kind !== 'edge' || isFreehandStyle(edge.style)) continue
    const source = nodeOf(edge.source, byId)
    const target = nodeOf(edge.target, byId)
    if (source !== null && target !== null && source !== target) drawn.push({ edge: edge.id, from: source, to: target })
  }
  const forward = shortest(drawn, from, to) ?? shortest(drawn, to, from)
  if (forward) return { ...forward, directed: true }
  const both = [...drawn, ...drawn.map((step) => ({ edge: step.edge, from: step.to, to: step.from }))]
  const any = shortest(both, from, to)
  return any && { ...any, directed: false }
}

/** Where a node of the board is drawn: a cell of a page. */
export interface ImpactPlace {
  pageId: string
  pageName: string
  cellId: string
}

/** An element of the board that the analysed one depends on, or that depends on it. */
export interface BoardImpactItem {
  /** The element, or a cell of a page that is no element: `<page>/<cell>`. */
  key: string
  name: string
  /** The step it is first reached at. */
  depth: number
  /** The cells of it on the pages whose edges tell the dependency, in the order of the pages. */
  places: ImpactPlace[]
}

export interface BoardImpact {
  name: string
  dependencies: BoardImpactItem[]
  dependents: BoardImpactItem[]
  /** The cells of the analysed element by page, in the order of the pages. */
  places: ImpactPlace[]
}

/** The cells of a page as the analysis reads them. */
export function documentRecords(doc: Y.Doc, pageId: string): ImpactRecord[] {
  const records: ImpactRecord[] = []
  getCells(doc, pageId).forEach((map, id) => {
    if (id === ROOT_CELL_ID || id === LAYER_CELL_ID) return
    const cell = readCell(id, map)
    if (cell.kind !== 'vertex' && cell.kind !== 'edge') return
    records.push({ id, kind: cell.kind, parent: cell.parent, source: cell.source, target: cell.target, value: cell.value, style: cell.style })
  })
  return records
}

/** The name of a node: of its element, else the first line of its label. */
function nodeName(record: ImpactRecord): string {
  return elementProperties(record.style, record.value).name || labelLines(record.value, record.style)[0] || 'Без имени'
}

/** The name of the node of the cell `cellId` of a page: of its element, else the first line of its label. */
export function cellName(doc: Y.Doc, pageId: string, cellId: string): string {
  const records = documentRecords(doc, pageId)
  const byId = new Map(records.map((record) => [record.id, record]))
  const node = nodeOf(cellId, byId)
  return node === null ? 'Без имени' : nodeName(byId.get(node)!)
}

/**
 * The dependencies of the element of the cell `cellId` of the page `pageId` and its dependents on all pages of the board:
 * a cell of an element stands for the element on every page, any other cell for itself. Up to `depth` steps; each item
 * names the pages whose edges tell it, closest first, then by name.
 */
export function boardImpact(doc: Y.Doc, pageId: string, cellId: string, depth: ImpactDepth): BoardImpact | null {
  type Link = { from: string; to: string; pageId: string; fromCell: string; toCell: string }
  const pages = listPages(doc)
  const names = new Map<string, string>()
  const cellsOf = new Map<string, ImpactPlace[]>()
  const links: Link[] = []
  let start: string | null = null
  for (const page of pages) {
    const records = documentRecords(doc, page.id)
    const byId = new Map(records.map((record) => [record.id, record]))
    const keyOf = (node: string) => elementIdOf(byId.get(node)!.style) ?? `${page.id}/${node}`
    for (const record of records) {
      if (nodeOf(record.id, byId) !== record.id) continue
      const key = keyOf(record.id)
      if (!names.has(key)) names.set(key, nodeName(record))
      cellsOf.set(key, [...(cellsOf.get(key) ?? []), { pageId: page.id, pageName: page.name, cellId: record.id }])
    }
    if (page.id === pageId) {
      const node = nodeOf(cellId, byId)
      if (node !== null) start = keyOf(node)
    }
    for (const link of dependencyLinks(records)) {
      links.push({ from: keyOf(link.from), to: keyOf(link.to), pageId: page.id, fromCell: link.from, toCell: link.to })
    }
  }
  if (start === null) return null
  const focus = start
  const items = (forward: boolean): BoardImpactItem[] => {
    const { nodes } = reach(links, focus, depth, forward)
    nodes.delete(focus)
    return [...nodes]
      .map(([key, distance]) => {
        // The pages of the links that reach it from a node one step closer.
        const places: ImpactPlace[] = []
        for (const link of links) {
          const [here, there, cell] = forward ? [link.from, link.to, link.toCell] : [link.to, link.from, link.fromCell]
          const closer = here === focus ? 0 : (nodes.get(here) ?? -1)
          if (there !== key || closer !== distance - 1 || places.some((place) => place.pageId === link.pageId)) continue
          places.push({ pageId: link.pageId, pageName: pages.find((page) => page.id === link.pageId)?.name ?? '', cellId: cell })
        }
        places.sort((a, b) => pages.findIndex((page) => page.id === a.pageId) - pages.findIndex((page) => page.id === b.pageId))
        return { key, name: names.get(key) ?? 'Без имени', depth: distance, places }
      })
      .sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name, 'ru') || (a.key < b.key ? -1 : 1))
  }
  return { name: names.get(focus) ?? 'Без имени', dependencies: items(true), dependents: items(false), places: cellsOf.get(focus) ?? [] }
}
