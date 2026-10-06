import * as Y from 'yjs'
import { compareCells, getCells, type CellKind, type GeometryData, type PointData } from './model.ts'
import { listPages } from './pages.ts'

/** An element of a page whose text has what is searched: a shape, an edge, a table, or a field or index of a table. */
export interface CanvasMatch {
  pageId: string
  cellId: string
}

/** Whether two matches are the same element; ids of cells repeat on pages of one `.drawio` file. */
export const sameMatch = (a: CanvasMatch, b: CanvasMatch) => a.pageId === b.pageId && a.cellId === b.cellId

/** A text as the search compares it: lower case, «ё» as «е», every run of spaces and line breaks as one space. */
export function searchText(text: string): string {
  return text.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ')
}

/** What the search reads of a cell. */
interface Node {
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
 * Elements of all pages of the board whose text has `query`, as {@link searchText} compares them, one match per element:
 * the pages in their order; on a page top to bottom and, at one height, left to right, the children of an element —
 * the fields and indexes of a table, the shapes of a group — right after it. Empty for a blank query.
 */
export function searchCanvas(doc: Y.Doc, query: string): CanvasMatch[] {
  const wanted = searchText(query).trim()
  if (!wanted) return []
  return listPages(doc).flatMap((page) =>
    searchPage(getCells(doc, page.id), wanted).map((cellId) => ({ pageId: page.id, cellId })),
  )
}

/** Ids of the elements of a page whose text has `wanted`, in the order of {@link searchCanvas}. */
function searchPage(cells: Y.Map<Y.Map<unknown>>, wanted: string): string[] {
  const nodes = new Map<string, Node>()
  const children = new Map<string, Node[]>()
  for (const [id, cell] of cells.entries()) {
    if (!(cell instanceof Y.Map)) continue
    const node: Node = {
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
  const corner = (node: Node) => {
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
  const middle = (edge: Node) => {
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

  const found: string[] = []
  const visit = (siblings: Node[]) => {
    const placed = siblings
      .filter((node) => node.kind === 'vertex' || node.kind === 'edge')
      .map((node) => ({ node, at: position(node.id) }))
      .sort((a, b) => a.at.y - b.at.y || a.at.x - b.at.x || compareCells(a.node, b.node))
    for (const { node } of placed) {
      if (searchText(node.value).includes(wanted)) found.push(node.id)
      visit(children.get(node.id) ?? [])
    }
  }
  // The elements of every layer are on one page together.
  visit([...nodes.values()].filter((node) => node.kind === 'layer').flatMap((layer) => children.get(layer.id) ?? []))
  return found
}

/**
 * The index of the match to go to from the current one (`current`, -1 without one): the next one with `direction` 1,
 * the previous one with -1, from the last to the first and back. Without a current one, the first match on the page
 * `pageId` or on a page after it, or with -1 the last one on it or before it, wrapping around the pages `pageIds`
 * in their order; -1 when there are no matches.
 */
export function stepMatch(
  matches: CanvasMatch[],
  current: number,
  direction: 1 | -1,
  pageIds: string[],
  pageId: string | null,
): number {
  const count = matches.length
  if (count === 0) return -1
  if (current >= 0 && current < count) return (current + direction + count) % count
  const page = pageId === null ? -1 : pageIds.indexOf(pageId)
  const pageOf = (match: CanvasMatch) => pageIds.indexOf(match.pageId)
  if (direction === 1) {
    const next = matches.findIndex((match) => pageOf(match) >= page)
    return next >= 0 ? next : 0
  }
  const previous = matches.findLastIndex((match) => pageOf(match) <= page)
  return previous >= 0 ? previous : count - 1
}
