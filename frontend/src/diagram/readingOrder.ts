import * as Y from 'yjs'
import { compareCells, type CellKind, type CellsMap, type GeometryData, type PointData } from './model.ts'

/** What the reading order knows of a cell of a page. */
export interface PageNode {
  id: string
  kind: CellKind
  parent: string | null
  order: string
  value: string
  geometry: GeometryData | null
  source: string | null
  target: string | null
}

const ORIGIN: PointData = { x: 0, y: 0 }
/** `a` moved by `b`; a coordinate a broken document lacks is 0. */
const plus = (a: PointData, b: PointData) => ({ x: a.x + (Number(b.x) || 0), y: a.y + (Number(b.y) || 0) })

/**
 * The shapes and edges of a page in the order of reading: top to bottom and, at one height, left to right, the children
 * of an element — the fields and indexes of a table, the shapes of a group — right after it. The search on the board and
 * the list of statuses go through a page in this order.
 */
export function readingOrder(cells: CellsMap): PageNode[] {
  const nodes = new Map<string, PageNode>()
  const children = new Map<string, PageNode[]>()
  for (const [id, cell] of cells.entries()) {
    if (!(cell instanceof Y.Map)) continue
    const node: PageNode = {
      id,
      kind: cell.get('kind') as CellKind,
      parent: (cell.get('parent') as string | null | undefined) ?? null,
      order: (cell.get('order') as string | undefined) ?? '',
      value: String(cell.get('value') ?? ''),
      geometry: (cell.get('geometry') as GeometryData | null | undefined) ?? null,
      source: (cell.get('source') as string | null | undefined) ?? null,
      target: (cell.get('target') as string | null | undefined) ?? null,
    }
    nodes.set(id, node)
    if (node.parent === null) continue
    const siblings = children.get(node.parent)
    if (siblings) siblings.push(node)
    else children.set(node.parent, [node])
  }

  const positions = new Map<string, PointData>()
  // A broken document may put a cell inside itself or connect two edges to each other.
  const visiting = new Set<string>()
  /** Where a cell is on the page: the top-left corner of a shape, the middle of an edge; nothing for the root and layers. */
  const position = (id: string | null): PointData => {
    const node = id === null ? undefined : nodes.get(id)
    if (!node || (node.kind !== 'vertex' && node.kind !== 'edge')) return ORIGIN
    const known = positions.get(node.id)
    if (known) return known
    if (visiting.has(node.id)) return ORIGIN
    visiting.add(node.id)
    const found = node.kind === 'edge' ? middle(node) : corner(node)
    visiting.delete(node.id)
    positions.set(node.id, found)
    return found
  }
  // The coordinates of a child are those within its parent: a shape, or the middle of an edge for its label.
  const corner = (node: PageNode) => {
    const geometry = node.geometry
    const origin = position(node.parent)
    return geometry && !geometry.relative ? plus(origin, geometry) : origin
  }
  /** The middle of a shape at an end of an edge, or the middle of an edge there. */
  const center = (id: string) => {
    const node = nodes.get(id)
    const point = position(id)
    const geometry = node?.kind === 'vertex' ? node.geometry : null
    return geometry && !geometry.relative ? plus(point, { x: geometry.width / 2, y: geometry.height / 2 }) : point
  }
  const middle = (edge: PageNode) => {
    const origin = position(edge.parent)
    const end = (terminal: string | null, point: PointData | undefined) =>
      terminal !== null && nodes.has(terminal) ? center(terminal) : point ? plus(origin, point) : null
    const ends = [end(edge.source, edge.geometry?.sourcePoint), end(edge.target, edge.geometry?.targetPoint)].filter(
      (point) => point !== null,
    )
    if (ends.length === 0) {
      const bend = edge.geometry?.points?.[0]
      return bend ? plus(origin, bend) : origin
    }
    return { x: ends.reduce((sum, point) => sum + point.x, 0) / ends.length, y: ends.reduce((sum, point) => sum + point.y, 0) / ends.length }
  }

  const ordered: PageNode[] = []
  const visit = (siblings: PageNode[]) => {
    const placed = siblings
      .filter((node) => node.kind === 'vertex' || node.kind === 'edge')
      .map((node) => ({ node, at: position(node.id) }))
      .sort((a, b) => a.at.y - b.at.y || a.at.x - b.at.x || compareCells(a.node, b.node))
    for (const { node } of placed) {
      ordered.push(node)
      visit(children.get(node.id) ?? [])
    }
  }
  // The elements of every layer are on one page together.
  visit([...nodes.values()].filter((node) => node.kind === 'layer').flatMap((layer) => children.get(layer.id) ?? []))
  return ordered
}
