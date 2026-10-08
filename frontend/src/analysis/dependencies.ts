import type * as Y from 'yjs'
import { canBeElement, elementProperties } from '../diagram/elementProps.ts'
import { elementIdOf, getCells, readCell, type CellData } from '../diagram/model.ts'
import { listPages } from '../diagram/pages.ts'
import { isTableStyle } from '../diagram/shapes.ts'

export interface Place { pageId: string; pageName: string; cellId: string }
export interface DependencyNode { key: string; name: string; kind: string | null; places: Place[] }
export interface DependencyEdge extends Place { key: string; from: string; to: string }
export interface DependencyGraph { nodes: Map<string, DependencyNode>; edges: DependencyEdge[]; cells: Map<string, string> }
export const placeKey = (pageId: string, cellId: string) => `${pageId}:${cellId}`
const broker = (node: DependencyNode) => ['queue', 'event-topic', 'c4-container-queue', 'message-broker'].includes(node.kind ?? '')

/** Each shared element is one node; unnamed shapes remain independent even when their labels match. */
export function dependencyGraph(doc: Y.Doc, pageId?: string, brokerBothWays = true): DependencyGraph {
  const result: DependencyGraph = { nodes: new Map(), edges: [], cells: new Map() }
  const pages = listPages(doc).filter((page) => pageId === undefined || page.id === pageId)
  const byPage = new Map<string, Map<string, CellData>>()
  for (const page of pages) {
    const cells = new Map(Array.from(getCells(doc, page.id), ([id, entry]) => [id, readCell(id, entry)]))
    byPage.set(page.id, cells)
    for (const cell of cells.values()) {
      if (cell.kind !== 'vertex' || !(canBeElement(cell.style) || isTableStyle(cell.style))) continue
      const parent = cell.parent ? cells.get(cell.parent) : undefined
      if (parent?.kind === 'edge' || (parent && isTableStyle(parent.style))) continue
      const key = elementIdOf(cell.style) ? `element:${elementIdOf(cell.style)}` : `cell:${placeKey(page.id, cell.id)}`
      const props = elementProperties(cell.style, cell.value)
      const node = result.nodes.get(key) ?? { key, name: props.name || 'Без названия', kind: props.kind, places: [] }
      node.places.push({ pageId: page.id, pageName: page.name, cellId: cell.id })
      result.nodes.set(key, node)
      result.cells.set(placeKey(page.id, cell.id), key)
    }
  }
  for (const page of pages) {
    const cells = byPage.get(page.id)!
    const endpoint = (id: string | null): string | null => {
      const visited = new Set<string>()
      while (id && !visited.has(id)) {
        visited.add(id)
        const key = result.cells.get(placeKey(page.id, id))
        if (key) return key
        id = cells.get(id)?.parent ?? null
      }
      return null
    }
    for (const cell of cells.values()) {
      if (cell.kind !== 'edge') continue
      const from = endpoint(cell.source)
      const to = endpoint(cell.target)
      if (!from || !to || from === to) continue
      const edge = { key: placeKey(page.id, cell.id), pageId: page.id, pageName: page.name, cellId: cell.id, from, to }
      result.edges.push(edge)
      // AsyncAPI arrows represent data flow. Both producer and consumer depend on the transport, not its drawing direction.
      if (brokerBothWays && (broker(result.nodes.get(from)!) || broker(result.nodes.get(to)!))) {
        result.edges.push({ ...edge, from: to, to: from })
      }
    }
  }
  return result
}

export interface Reachable { nodes: Set<string>; edges: Set<string> }
const empty = (): Reachable => ({ nodes: new Set(), edges: new Set() })

/** Breadth-first traversal stays linear even with cycles and parallel edges. */
export function dependencies(graph: DependencyGraph, start: string, depth: number, incoming = false): Reachable {
  const result = empty()
  if (!graph.nodes.has(start)) return result
  const adjacency = new Map<string, DependencyEdge[]>()
  for (const edge of graph.edges) {
    const from = incoming ? edge.to : edge.from
    const list = adjacency.get(from) ?? []
    list.push(edge)
    adjacency.set(from, list)
  }
  const seen = new Set([start])
  const queue: { key: string; distance: number }[] = [{ key: start, distance: 0 }]
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i]!
    if (current.distance >= depth) continue
    for (const edge of adjacency.get(current.key) ?? []) {
      const next = incoming ? edge.from : edge.to
      result.edges.add(edge.key)
      if (next !== start) result.nodes.add(next)
      if (!seen.has(next)) {
        seen.add(next)
        queue.push({ key: next, distance: current.distance + 1 })
      }
    }
  }
  return result
}

/** Selects the DAG of all shortest paths without enumerating an exponential number of individual paths. */
export function shortestPaths(graph: DependencyGraph, start: string, finish: string): Reachable {
  const result = empty()
  if (!graph.nodes.has(start) || !graph.nodes.has(finish)) return result
  const adjacency = new Map<string, DependencyEdge[]>()
  for (const edge of graph.edges) {
    const list = adjacency.get(edge.from) ?? []
    list.push(edge)
    adjacency.set(edge.from, list)
  }
  const distance = new Map([[start, 0]])
  const parents = new Map<string, DependencyEdge[]>()
  const queue = [start]
  for (let i = 0; i < queue.length; i++) {
    const key = queue[i]!
    const nextDistance = distance.get(key)! + 1
    if (distance.has(finish) && nextDistance > distance.get(finish)!) break
    for (const edge of adjacency.get(key) ?? []) {
      if (!distance.has(edge.to)) {
        distance.set(edge.to, nextDistance)
        queue.push(edge.to)
      }
      if (distance.get(edge.to) === nextDistance) {
        const list = parents.get(edge.to) ?? []
        list.push(edge)
        parents.set(edge.to, list)
      }
    }
  }
  if (!distance.has(finish)) return result
  const back = [finish]
  result.nodes.add(finish)
  for (let i = 0; i < back.length; i++) {
    for (const edge of parents.get(back[i]!) ?? []) {
      result.edges.add(edge.key)
      if (!result.nodes.has(edge.from)) { result.nodes.add(edge.from); back.push(edge.from) }
    }
  }
  return result
}
