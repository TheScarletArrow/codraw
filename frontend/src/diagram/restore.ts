import * as Y from 'yjs'
import { cellOrigin, treeOrder, VOLATILE_KEYS, type CellSnapshot } from './diff.ts'
import {
  cellElementId,
  dropUnusedElements,
  getCells,
  getElements,
  getPages,
  LAYER_CELL_ID,
  readPage,
  writeAttrs,
  writePage,
  type CellMap,
  type ElementData,
  type GeometryData,
  type PointData,
} from './model.ts'
import { elementData, relabelElementCells } from './sharedElements.ts'

/** Origin of the transaction that restores a version or a page; the undo histories of the pages do not track it. */
export const RESTORE_ORIGIN = 'codraw:restore'

/**
 * Makes the board document `live` equal to the document of a version, in one transaction. Every top-level map (`meta`,
 * `pages`, `cells:<pageId>`) is brought to the content of the version: keys that the version lacks are deleted, nested
 * maps are compared key by key, and plain values are written only when they differ. So cells that the version shares
 * with the live document stay the same Yjs objects, and concurrent changes of them by other participants merge.
 */
export function restoreDocument(live: Y.Doc, version: Y.Doc) {
  const names = new Set([...topLevelNames(live), ...topLevelNames(version)])
  live.transact(() => {
    for (const name of names) syncMap(live.getMap(name), version.getMap(name))
  }, RESTORE_ORIGIN)
}

/** Names of the top-level types of a document; every one of the board document is a map. */
function topLevelNames(doc: Y.Doc): string[] {
  return Array.from(doc.share.keys())
}

/**
 * Makes a page of the board document `live` equal to the page of a version, in one transaction: its cells as
 * {@link restoreDocument} brings them, and the elements they show as the version has them; elements that only the
 * cells the page had showed go. The board keeps the name and the place of the page; a page deleted since comes back
 * with the name and the order key of the version, so among the pages left it stands where it stood. Other pages stay as
 * they are, but for the labels of the cells of the elements of the page, which tell their properties as the version
 * has them. Returns `false` when the version has no such page.
 */
export function restorePage(live: Y.Doc, version: Y.Doc, pageId: string): boolean {
  const entry = getPages(version).get(pageId)
  if (!entry) return false
  live.transact(() => {
    if (!getPages(live).has(pageId)) writePage(live, pageId, readPage(entry))
    const cells = getCells(live, pageId)
    const shown = Array.from(cells.values(), (cell) => cellElementId(cell))
    syncMap(cells as Y.Map<unknown>, getCells(version, pageId) as Y.Map<unknown>)
    const elements = getElements(live)
    const versionElements = getElements(version)
    const before = new Map<string, ElementData | undefined>()
    for (const cell of getCells(version, pageId).values()) {
      const id = cellElementId(cell)
      const element = id === null ? undefined : versionElements.get(id)
      if (!(element instanceof Y.Map)) continue
      // Only the elements that the version changes relabel their cells elsewhere.
      if (!before.has(id!) && JSON.stringify(elementData(live, id!)) !== JSON.stringify(element.toJSON())) {
        before.set(id!, elementData(live, id!))
      }
      const current = elements.get(id!)
      if (current instanceof Y.Map) syncMap(current, element)
      else elements.set(id!, copyMap(element))
    }
    // The cells of these elements on other pages show their properties as the version has them.
    relabelElementCells(live, before, (ref) => ref.pageId === pageId)
    dropUnusedElements(live, shown)
  }, RESTORE_ORIGIN)
  return true
}

/**
 * The cells of a page of a version that restoring its cells `ids` brings back, parents before their children: each of
 * them with its descendants, and the edges of the version that start or end at any of these, as long as every connected
 * end of an edge is on the page then — there already (`exists`) or restored with it. A cell whose parent is neither on
 * the page nor restored goes to the layer, where the version had it; a shape placed along an edge, e.g. its label, does
 * not come back without its edge.
 *
 * Restoring is a change like any other, so what the page holds locked (`fixed`: the cell itself or a group or a table
 * above it is locked) stays as it is: such a cell does not come back with its descendants, and neither does a cell whose
 * parent is fixed, e.g. a field of a locked table. A fixed cell is on the page, so the edges of restored cells may end
 * at it.
 */
export function cellsToRestore(
  cells: Map<string, CellSnapshot>,
  ids: Iterable<string>,
  exists: (id: string) => boolean,
  fixed: (id: string) => boolean = () => false,
): CellSnapshot[] {
  const children = new Map<string, string[]>()
  for (const cell of cells.values()) {
    if (cell.parent === null) continue
    const list = children.get(cell.parent)
    if (list) list.push(cell.id)
    else children.set(cell.parent, [cell.id])
  }
  const subtree = (id: string): string[] => {
    const found: string[] = []
    const stack = [id]
    const seen = new Set<string>()
    while (stack.length > 0) {
      const next = stack.pop()!
      if (seen.has(next)) continue
      seen.add(next)
      found.push(next)
      stack.push(...(children.get(next) ?? []))
    }
    return found
  }

  const restored = new Set<string>()
  for (const id of ids) if (cells.has(id)) subtree(id).forEach((cell) => restored.add(cell))
  const leaveFixed = () => {
    const kept = (cell: CellSnapshot) => fixed(cell.id) || (cell.parent !== null && fixed(cell.parent))
    for (const id of treeOrder(cells)) {
      if (restored.has(id) && kept(cells.get(id)!)) subtree(id).forEach((cell) => restored.delete(cell))
    }
  }
  leaveFixed()
  // The edges of the restored cells come with them, e.g. the foreign keys of a table.
  const attached = (end: string | null) => end !== null && restored.has(end)
  for (const cell of cells.values()) {
    if (cell.kind === 'edge' && !restored.has(cell.id) && (attached(cell.source) || attached(cell.target))) {
      subtree(cell.id).forEach((id) => restored.add(id))
    }
  }
  leaveFixed()

  // Dropping a cell may leave an edge that ends at it without that end, so it goes on until nothing more is dropped.
  const present = (id: string | null) => id === null || id === LAYER_CELL_ID || restored.has(id) || exists(id)
  const stranded = (cell: CellSnapshot) =>
    cell.kind === 'edge'
      ? !present(cell.source) || !present(cell.target)
      : !!cell.geometry?.relative && !present(cell.parent)
  for (let dropped = true; dropped; ) {
    const gone = [...restored].filter((id) => stranded(cells.get(id)!))
    gone.forEach((id) => subtree(id).forEach((cell) => restored.delete(cell)))
    dropped = gone.length > 0
  }

  return treeOrder(cells)
    .filter((id) => restored.has(id))
    .map((id) => {
      const cell = cells.get(id)!
      if (present(cell.parent)) return cell
      // The parent is gone: the cell stands on the layer where the version had it.
      return { ...cell, parent: LAYER_CELL_ID, geometry: moved(cell, cellOrigin(cells, cell) ?? { x: 0, y: 0 }) }
    })
}

/** The geometry of a cell moved by `by`: the position of a shape, the bends and loose ends of an edge. */
function moved(cell: CellSnapshot, by: PointData): GeometryData | null {
  const geometry = cell.geometry
  if (!geometry) return null
  const shift = (point: PointData): PointData => ({ x: point.x + by.x, y: point.y + by.y })
  if (cell.kind !== 'edge') return { ...geometry, x: geometry.x + by.x, y: geometry.y + by.y }
  return {
    ...geometry,
    ...(geometry.points && { points: geometry.points.map(shift) }),
    ...(geometry.sourcePoint && { sourcePoint: shift(geometry.sourcePoint) }),
    ...(geometry.targetPoint && { targetPoint: shift(geometry.targetPoint) }),
  }
}

/** Fields of a cell that the canvas holds; {@link writeRestoredFields} writes the others. */
const CANVAS_FIELDS = new Set(['kind', 'parent', 'order', 'value', 'geometry', 'source', 'target', 'style'])

/**
 * Writes into a restored cell of the document what the canvas does not hold, as the version has it: its custom
 * properties and the fields that the model does not know. Keys that say who changed the cell last are left alone: the
 * restore is a change of whoever restores, which the caller writes. Returns whether anything was written.
 */
export function writeRestoredFields(entry: CellMap, cell: CellSnapshot): boolean {
  let written = false
  for (const key of Array.from(entry.keys())) {
    const kept = CANVAS_FIELDS.has(key) || key === 'attrs' || VOLATILE_KEYS.has(key) || Object.hasOwn(cell.extra, key)
    if (!kept) {
      entry.delete(key)
      written = true
    }
  }
  for (const [key, value] of Object.entries(cell.extra)) {
    if (!VOLATILE_KEYS.has(key) && !sameValue(toPlain(entry.get(key)), value)) {
      entry.set(key, structuredClone(value))
      written = true
    }
  }
  if (!sameValue(toPlain(entry.get('attrs')) ?? {}, cell.attrs)) {
    writeAttrs(entry, cell.attrs as Record<string, string>)
    written = true
  }
  return written
}

const toPlain = (value: unknown) => (value instanceof Y.AbstractType ? (value.toJSON() as unknown) : value)

function syncMap(target: Y.Map<unknown>, source: Y.Map<unknown>) {
  for (const key of Array.from(target.keys())) {
    if (!source.has(key)) target.delete(key)
  }
  source.forEach((value, key) => {
    const current = target.get(key)
    if (value instanceof Y.Map) {
      if (current instanceof Y.Map) syncMap(current, value)
      else target.set(key, copyMap(value))
    } else if (current instanceof Y.AbstractType || !sameValue(current, value)) {
      target.set(key, structuredClone(value))
    }
  })
}

/** A detached copy of a map of another document, with its nested maps. */
function copyMap(source: Y.Map<unknown>): Y.Map<unknown> {
  const copy = new Y.Map<unknown>()
  source.forEach((value, key) => copy.set(key, value instanceof Y.Map ? copyMap(value) : structuredClone(value)))
  return copy
}

function sameValue(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b)
}
