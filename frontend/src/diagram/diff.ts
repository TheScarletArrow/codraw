import * as Y from 'yjs'
import { MODIFIED_AT_KEY, MODIFIED_BY_KEY, MODIFIED_BY_NAME_KEY } from './attribution.ts'
import {
  compareCells,
  getCells,
  getPages,
  LAYER_CELL_ID,
  readPage,
  ROOT_CELL_ID,
  withElementProperties,
  type CellKind,
  type GeometryData,
  type PointData,
  type StyleValue,
} from './model.ts'
import { isLegendStyle } from './legendKeys.ts'
import { isSequenceStyle, sequencePartOf } from './sequence.ts'
import { isTableStyle } from './shapes.ts'

/**
 * Comparison of two states of a board document, e.g. of a version and of the board now. Pages and cells are matched by
 * their ids. Both states are read once into plain snapshots and compared by maps, so boards of thousands of cells take
 * milliseconds and nothing observes the cells.
 *
 * Only content counts: keys that record who changed a cell and when, order keys rewritten without reordering, the noise
 * of floating-point coordinates, the geometry that the layouts of a table and of a sequence diagram set and the layers
 * of a page themselves are not changes.
 */

/** Keys that say who changed a cell last and when: they change with every edit, but they are not its content. */
export const VOLATILE_KEYS: ReadonlySet<string> = new Set([MODIFIED_BY_KEY, MODIFIED_BY_NAME_KEY, MODIFIED_AT_KEY])

/** Coordinates closer than this are equal: the difference is the noise of floating-point arithmetic. */
export const GEOMETRY_EPSILON = 0.01

/** Fields of a cell that the snapshot reads into properties of their own; any other field goes to `extra`. */
const KNOWN_FIELDS = new Set(['kind', 'parent', 'order', 'value', 'geometry', 'source', 'target', 'style', 'attrs'])

/** A cell of a page as plain data. */
export interface CellSnapshot {
  id: string
  kind: CellKind
  parent: string | null
  order: string
  value: string
  geometry: GeometryData | null
  source: string | null
  target: string | null
  style: Record<string, StyleValue>
  /** Custom properties (attributes of `<object>` in `.drawio`). */
  attrs: Record<string, unknown>
  /** Fields the model does not know, e.g. written by a newer CoDraw; they are compared as they are. */
  extra: Record<string, unknown>
}

export interface PageSnapshot {
  id: string
  name: string
  order: string
  /** The cells of the page by id, without its root and layers. */
  cells: Map<string, CellSnapshot>
}

/** A board document as plain data: its pages by id. */
export type BoardSnapshot = Map<string, PageSnapshot>

/** What differs in a cell that both states have; each list names fields or keys. */
export interface CellChanges {
  /** `kind`, `value`, `parent`, `source`, `target`, `order` (among its siblings) and fields the model does not know. */
  fields: string[]
  /** `x`, `y`, `width`, `height`, `points`, `offset`, `sourcePoint`, `targetPoint`, `relative`. */
  geometry: string[]
  /** Style keys added, removed or changed. */
  style: string[]
  /** Custom properties added, removed or changed. */
  attrs: string[]
}

export type CellDiff =
  | { type: 'added'; id: string; after: CellSnapshot }
  | { type: 'removed'; id: string; before: CellSnapshot }
  | { type: 'changed'; id: string; before: CellSnapshot; after: CellSnapshot; changes: CellChanges }

export type ChangeType = CellDiff['type']

export interface PageDiff {
  id: string
  /** `added` and `removed` pages are in one state only; a `changed` page is in both, and it or its cells differ. */
  type: ChangeType
  before: PageSnapshot | null
  after: PageSnapshot | null
  /** The page has another name. */
  renamed: boolean
  /** The page stands elsewhere among the pages that both states have. */
  moved: boolean
  /**
   * Added cells, then changed ones in the order of the page (parents before their children, siblings in their order),
   * then removed ones in the order of the page they were on. Every cell of an added or removed page is here.
   */
  cells: CellDiff[]
}

export interface BoardDiff {
  /** Pages that differ: those of the later state in their order, then those of the earlier one only, in theirs. */
  pages: PageDiff[]
}

/** Reads the pages and cells of a board document into plain data. */
export function snapshotDocument(doc: Y.Doc): BoardSnapshot {
  const pages: BoardSnapshot = new Map()
  getPages(doc).forEach((entry, id) => pages.set(id, { id, ...readPage(entry), cells: snapshotCells(doc, id) }))
  return pages
}

/** Reads one page of a board document into plain data; `null` when the document has no such page. */
export function snapshotPage(doc: Y.Doc, pageId: string): PageSnapshot | null {
  const entry = getPages(doc).get(pageId)
  return entry ? { id: pageId, ...readPage(entry), cells: snapshotCells(doc, pageId) } : null
}

function snapshotCells(doc: Y.Doc, pageId: string): Map<string, CellSnapshot> {
  const cells = new Map<string, CellSnapshot>()
  getCells(doc, pageId).forEach((cell, cellId) => {
    // The root and the layers are no elements: a change of a layer is no change of the page, moving an element into
    // another layer changes its parent.
    if (cellId === ROOT_CELL_ID || cellId === LAYER_CELL_ID || !(cell instanceof Y.Map) || cell.get('kind') === 'layer') return
    const snapshot = snapshotCell(cellId, cell.toJSON() as Record<string, unknown>)
    // The properties of the element of a cell are compared, merged and restored as keys of its style.
    snapshot.style = withElementProperties(doc, snapshot.style)
    cells.set(cellId, snapshot)
  })
  return cells
}

function snapshotCell(id: string, data: Record<string, unknown>): CellSnapshot {
  const extra: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) if (!KNOWN_FIELDS.has(key)) extra[key] = value
  return {
    id,
    kind: data.kind as CellKind,
    parent: (data.parent as string | null | undefined) ?? null,
    order: (data.order as string | undefined) ?? '',
    value: String(data.value ?? ''),
    geometry: (data.geometry as GeometryData | null | undefined) ?? null,
    source: (data.source as string | null | undefined) ?? null,
    target: (data.target as string | null | undefined) ?? null,
    style: isRecord(data.style) ? (data.style as Record<string, StyleValue>) : {},
    attrs: isRecord(data.attrs) ? data.attrs : {},
    extra,
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Compares two board documents: what `after` has added, changed and removed since `before`. */
export function diffDocuments(before: Y.Doc, after: Y.Doc): BoardDiff {
  return diffSnapshots(snapshotDocument(before), snapshotDocument(after))
}

/** Compares two snapshots of a board: what `after` has added, changed and removed since `before`. */
export function diffSnapshots(before: BoardSnapshot, after: BoardSnapshot): BoardDiff {
  const common = [...after.values()].filter((page) => before.has(page.id))
  const moved = outOfOrder(
    common.map((page) => before.get(page.id)!),
    common,
  )
  const pages: PageDiff[] = []
  for (const page of [...after.values()].sort(compareCells)) {
    const earlier = before.get(page.id)
    if (!earlier) {
      const cells = diffCells(new Map(), page.cells)
      pages.push({ id: page.id, type: 'added', before: null, after: page, renamed: false, moved: false, cells })
      continue
    }
    const cells = diffCells(earlier.cells, page.cells)
    const renamed = earlier.name !== page.name
    if (cells.length > 0 || renamed || moved.has(page.id)) {
      pages.push({ id: page.id, type: 'changed', before: earlier, after: page, renamed, moved: moved.has(page.id), cells })
    }
  }
  for (const page of [...before.values()].sort(compareCells)) {
    if (after.has(page.id)) continue
    const cells = diffCells(page.cells, new Map())
    pages.push({ id: page.id, type: 'removed', before: page, after: null, renamed: false, moved: false, cells })
  }
  return { pages }
}

function diffCells(before: Map<string, CellSnapshot>, after: Map<string, CellSnapshot>): CellDiff[] {
  const reordered = reorderedCells(before, after)
  const added: CellDiff[] = []
  const changed: CellDiff[] = []
  for (const id of treeOrder(after)) {
    const cell = after.get(id)!
    const earlier = before.get(id)
    if (!earlier) {
      added.push({ type: 'added', id, after: cell })
      continue
    }
    const changes = cellChanges(earlier, cell, before, after, reordered.has(id))
    if (changes) changed.push({ type: 'changed', id, before: earlier, after: cell, changes })
  }
  const removed: CellDiff[] = treeOrder(before)
    .filter((id) => !after.has(id))
    .map((id) => ({ type: 'removed', id, before: before.get(id)! }))
  return [...added, ...changed, ...removed]
}

function cellChanges(
  before: CellSnapshot,
  after: CellSnapshot,
  beforeCells: Map<string, CellSnapshot>,
  afterCells: Map<string, CellSnapshot>,
  reordered: boolean,
): CellChanges | null {
  const fields: string[] = []
  if (before.kind !== after.kind) fields.push('kind')
  if (before.value !== after.value) fields.push('value')
  if (before.parent !== after.parent) fields.push('parent')
  if (before.source !== after.source) fields.push('source')
  if (before.target !== after.target) fields.push('target')
  if (reordered) fields.push('order')
  fields.push(...differentKeys(before.extra, after.extra))
  const geometry = geometryChanges(before, after, beforeCells, afterCells)
  const style = differentKeys(before.style, after.style)
  const attrs = differentKeys(before.attrs, after.attrs)
  if (fields.length + geometry.length + style.length + attrs.length === 0) return null
  return { fields, geometry, style, attrs }
}

/** Keys whose values differ between two records, the volatile ones aside: those of `a` first, then the new ones. */
function differentKeys(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  return [...keys].filter((key) => !VOLATILE_KEYS.has(key) && !sameValue(a[key], b[key]))
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  return JSON.stringify(a) === JSON.stringify(b)
}

const isTable = (cell: CellSnapshot) => cell.kind === 'vertex' && isTableStyle(cell.style)

/** A field or an index of a table: the table lays it out, so its geometry is not its own. */
export function isTableRow(cell: CellSnapshot, cells: Map<string, CellSnapshot>): boolean {
  const parent = cell.parent === null ? undefined : cells.get(cell.parent)
  return cell.kind === 'vertex' && parent !== undefined && isTable(parent)
}

const isSequence = (cell: CellSnapshot) => cell.kind === 'vertex' && isSequenceStyle(cell.style)

const isLegend = (cell: CellSnapshot) => cell.kind === 'vertex' && isLegendStyle(cell.style)

/** A part of a sequence diagram: the diagram lays it out, so its geometry is not its own either. */
export function isSequencePart(cell: CellSnapshot, cells: Map<string, CellSnapshot>): boolean {
  const parent = cell.parent === null ? undefined : cells.get(cell.parent)
  return cell.kind === 'vertex' && parent !== undefined && isSequence(parent) && sequencePartOf(cell.style) !== null
}

/** A cell whose layout is that of its parent. */
const isLaidOut = (cell: CellSnapshot, cells: Map<string, CellSnapshot>) => isTableRow(cell, cells) || isSequencePart(cell, cells)

function geometryChanges(
  before: CellSnapshot,
  after: CellSnapshot,
  beforeCells: Map<string, CellSnapshot>,
  afterCells: Map<string, CellSnapshot>,
): string[] {
  if (isLaidOut(before, beforeCells) && isLaidOut(after, afterCells)) return []
  const a = before.geometry ?? EMPTY_GEOMETRY
  const b = after.geometry ?? EMPTY_GEOMETRY
  // The rows of a table set its height, the parts of a sequence diagram its size, the items of a legend its.
  const bounds =
    (isSequence(before) && isSequence(after)) || (isLegend(before) && isLegend(after))
      ? (['x', 'y'] as const)
      : isTable(before) && isTable(after)
        ? (['x', 'y', 'width'] as const)
        : (['x', 'y', 'width', 'height'] as const)
  const changed: string[] = bounds.filter((key) => !sameNumber(a[key], b[key]))
  if (!samePoints(a.points ?? [], b.points ?? [])) changed.push('points')
  if (!samePoint(a.offset ?? ORIGIN, b.offset ?? ORIGIN)) changed.push('offset')
  if (!sameOptionalPoint(a.sourcePoint, b.sourcePoint)) changed.push('sourcePoint')
  if (!sameOptionalPoint(a.targetPoint, b.targetPoint)) changed.push('targetPoint')
  if (!!a.relative !== !!b.relative) changed.push('relative')
  return changed
}

const EMPTY_GEOMETRY: GeometryData = { x: 0, y: 0, width: 0, height: 0 }
const ORIGIN: PointData = { x: 0, y: 0 }

const sameNumber = (a: unknown, b: unknown) => Math.abs(Number(a ?? 0) - Number(b ?? 0)) < GEOMETRY_EPSILON || a === b

const samePoint = (a: PointData, b: PointData) => sameNumber(a?.x, b?.x) && sameNumber(a?.y, b?.y)

const sameOptionalPoint = (a: PointData | undefined, b: PointData | undefined) => (a && b ? samePoint(a, b) : !a === !b)

const samePoints = (a: PointData[], b: PointData[]) => a.length === b.length && a.every((point, index) => samePoint(point, b[index]!))

/**
 * Cells that stand elsewhere among their siblings: of the cells that have the same parent in both states, those outside
 * the longest run that keeps its order. Bringing one shape to the front moves that shape, not every shape it passed.
 */
function reorderedCells(before: Map<string, CellSnapshot>, after: Map<string, CellSnapshot>): Set<string> {
  const siblings = new Map<string, [CellSnapshot[], CellSnapshot[]]>()
  for (const cell of before.values()) {
    const later = after.get(cell.id)
    if (!later || later.parent !== cell.parent) continue
    const group = siblings.get(cell.parent ?? '') ?? [[], []]
    group[0].push(cell)
    group[1].push(later)
    siblings.set(cell.parent ?? '', group)
  }
  const moved = new Set<string>()
  for (const [earlier, later] of siblings.values()) {
    if (earlier.length > 1) outOfOrder(earlier, later).forEach((id) => moved.add(id))
  }
  return moved
}

/**
 * Ids of the items that changed their place: `before` and `after` are the same items as each state has them. Taken in
 * the order of `before`, their places in `after` keep increasing along the largest run that stays in order; the items
 * outside it moved. Items with the same order key in both states keep their order among themselves, so the run prefers
 * them: when one of two pages is put before the other, the one with the new key moved, not the other.
 */
function outOfOrder(before: { id: string; order: string }[], after: { id: string; order: string }[]): Set<string> {
  const earlier = [...before].sort(compareCells)
  const later = new Map(after.map((item) => [item.id, item]))
  const place = new Map([...after].sort(compareCells).map((item, index) => [item.id, index]))
  const kept = heaviestIncreasing(
    earlier.map((item) => place.get(item.id)!),
    earlier.map((item) => (later.get(item.id)!.order === item.order ? earlier.length + 1 : 1)),
  )
  return new Set(earlier.filter((_, index) => !kept.has(index)).map((item) => item.id))
}

/**
 * Indices of a strictly increasing subsequence of `places` with the largest sum of `weights`, in O(n log n). `places` are
 * distinct numbers from 0 to n - 1.
 */
export function heaviestIncreasing(places: number[], weights: number[]): Set<number> {
  const size = places.length
  // A Fenwick tree over places: the heaviest run that ends at a place up to the given one, and the index it ends at.
  const tree: { weight: number; index: number }[] = Array.from({ length: size + 1 }, () => ({ weight: 0, index: -1 }))
  const previous: number[] = new Array(size)
  let best = { weight: 0, index: -1 }
  places.forEach((place, index) => {
    let before = { weight: 0, index: -1 }
    for (let node = place; node > 0; node -= node & -node) if (tree[node]!.weight > before.weight) before = tree[node]!
    const run = { weight: before.weight + weights[index]!, index }
    previous[index] = before.index
    for (let node = place + 1; node <= size; node += node & -node) if (run.weight > tree[node]!.weight) tree[node] = run
    if (run.weight > best.weight) best = run
  })
  const kept = new Set<number>()
  for (let index = best.index; index >= 0; index = previous[index]!) kept.add(index)
  return kept
}

/**
 * The point that the geometry of a cell is relative to: the position of its parent shape on the page, or the top left
 * corner of the page for a cell of the layer. `null` inside an edge and in a loop of parents.
 */
export function cellOrigin(cells: Map<string, CellSnapshot>, cell: CellSnapshot): PointData | null {
  const origin = { x: 0, y: 0 }
  const seen = new Set([cell.id])
  for (let parent = parentOf(cells, cell); parent; parent = parentOf(cells, parent)) {
    const geometry = parent.geometry
    if (seen.has(parent.id) || parent.kind !== 'vertex' || !geometry || geometry.relative) return null
    seen.add(parent.id)
    origin.x += geometry.x
    origin.y += geometry.y
  }
  return origin
}

const parentOf = (cells: Map<string, CellSnapshot>, cell: CellSnapshot) =>
  cell.parent === null ? undefined : cells.get(cell.parent)

/** Ids of the cells in the order of the page: parents before their children, siblings by order. */
export function treeOrder(cells: Map<string, CellSnapshot>): string[] {
  const children = new Map<string, CellSnapshot[]>()
  for (const cell of cells.values()) {
    // Cells of the layer, and cells whose parent is missing, are at the top.
    const parent = cell.parent !== null && cells.has(cell.parent) ? cell.parent : ''
    const list = children.get(parent)
    if (list) list.push(cell)
    else children.set(parent, [cell])
  }
  const order: string[] = []
  const stack = [...(children.get('') ?? [])].sort(compareCells).reverse()
  while (stack.length > 0) {
    const cell = stack.pop()!
    order.push(cell.id)
    stack.push(...[...(children.get(cell.id) ?? [])].sort(compareCells).reverse())
  }
  // Cells in a loop of parents never reach the top; they come last.
  if (order.length < cells.size) {
    const seen = new Set(order)
    order.push(...[...cells.keys()].filter((id) => !seen.has(id)).sort())
  }
  return order
}

/** A change as a list shows it: a cell with the cells added or removed together with it, inside it. */
export interface ChangeEntry {
  change: CellDiff
  /** Cells added (removed) with this one: its descendants that were added (removed) as well. */
  nested: CellDiff[]
}

/**
 * The changes of a page as entries: a cell added together with its parent, e.g. a field of a new table, belongs to the
 * entry of the parent, and so does a cell removed together with its parent. Changed cells are entries of their own.
 */
export function groupChanges(page: PageDiff): ChangeEntry[] {
  const types = new Map(page.cells.map((change) => [change.id, change.type]))
  const holders = new Map<string, ChangeEntry>()
  const entries: ChangeEntry[] = []
  for (const change of page.cells) {
    const parent = change.type === 'added' ? change.after.parent : change.type === 'removed' ? change.before.parent : null
    // Parents come before their children, so the entry of the parent is known.
    const holder = parent !== null && types.get(parent) === change.type ? holders.get(parent) : undefined
    if (holder) {
      holder.nested.push(change)
      holders.set(change.id, holder)
    } else {
      const entry = { change, nested: [] }
      entries.push(entry)
      holders.set(change.id, entry)
    }
  }
  return entries
}

/** The number of entries of each kind on all pages, as {@link groupChanges} makes them. */
export function countChanges(diff: BoardDiff): Record<ChangeType, number> {
  const counts: Record<ChangeType, number> = { added: 0, changed: 0, removed: 0 }
  for (const page of diff.pages) for (const { change } of groupChanges(page)) counts[change.type]++
  return counts
}
