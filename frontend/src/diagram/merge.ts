import * as Y from 'yjs'
import {
  cellOrigin,
  diffSnapshots,
  isTableRow,
  snapshotDocument,
  VOLATILE_KEYS,
  type BoardDiff,
  type BoardSnapshot,
  type CellDiff,
  type CellSnapshot,
  type PageDiff,
  type PageSnapshot,
} from './diff.ts'
import {
  compareCells,
  getCells,
  getPages,
  LAYER_CELL_ID,
  writeAttrs,
  writeCell,
  writePage,
  type CellMap,
  type CellsMap,
  type GeometryData,
} from './model.ts'
import { cellsToRestore } from './restore.ts'
import { isTableIndexStyle, isTableStyle, TABLE_FIELD_HEIGHT, TABLE_INDEX_GAP } from './shapes.ts'

/**
 * Merging a proposal of changes into the board: the changes of its draft since its base, applied to the board as it is
 * now, which others may have changed since the base too. The merge is three-way and by elements: what the draft added
 * comes, what it removed goes, and a changed element gets exactly the fields and keys that the draft changed, keeping
 * the others as the board has them. Where both changed the same key, the draft wins.
 */

/** Origin of the transaction that merges a proposal; the undo histories of the pages do not track it. */
export const MERGE_ORIGIN = 'codraw:merge'

/** Elements and pages that a proposal changes and that the board changed as well since the base of the proposal. */
export interface MergeConflicts {
  /** Pages that one side removed while the other changed them, or that both renamed or both moved. */
  pages: ReadonlySet<string>
  /** By page, the elements that both sides changed, the one maybe by removing them. */
  cells: ReadonlyMap<string, ReadonlySet<string>>
}

/** The conflicts of a proposal: what it changes since its base (`proposal`) and the board changed since it (`board`). */
export function mergeConflicts(proposal: BoardDiff, board: BoardDiff): MergeConflicts {
  const boardPages = new Map(board.pages.map((page) => [page.id, page]))
  const pages = new Set<string>()
  const cells = new Map<string, Set<string>>()
  for (const page of proposal.pages) {
    const other = boardPages.get(page.id)
    if (!other) continue
    if (page.type === 'removed' || other.type === 'removed' || (page.renamed && other.renamed) || (page.moved && other.moved)) {
      pages.add(page.id)
    }
    const changedOnBoard = new Set(other.cells.map((change) => change.id))
    const both = page.cells.filter((change) => changedOnBoard.has(change.id)).map((change) => change.id)
    if (both.length > 0) cells.set(page.id, new Set(both))
  }
  return { pages, cells }
}

/**
 * Merges the changes of a proposal from its `base` to its `draft` into the board document `live`, in one transaction
 * that no undo history tracks:
 *
 * - pages that the draft added come with their elements; those it removed go, but the last page of the board stays;
 *   those it renamed or moved get the name or the place of the draft; a page that the draft changed and the board
 *   removed comes back as the draft has it;
 * - elements are merged page by page, see {@link mergeCells}.
 *
 * Merged elements keep the marks of the draft of who changed them last: its author made the change. Locked elements are
 * merged like any other: accepting a proposal is a decision of whoever accepts it, like restoring a version.
 */
export function mergeProposal(live: Y.Doc, base: BoardSnapshot, draft: BoardSnapshot) {
  const board = snapshotDocument(live)
  const diff = diffSnapshots(base, draft)
  live.transact(() => {
    // Pages come before others go, so that the board never runs out of pages on the way.
    for (const page of diff.pages) {
      if (page.type !== 'removed') mergePage(live, page, board.get(page.id) ?? null)
    }
    for (const page of diff.pages) {
      if (page.type === 'removed' && board.has(page.id) && getPages(live).size > 1) removePage(live, page.id)
    }
  }, MERGE_ORIGIN)
}

/**
 * The board as accepting the proposal now would make it, as plain data: a copy of the board document with the proposal
 * merged into it. The board itself does not change.
 */
export function mergedSnapshot(live: Y.Doc, base: BoardSnapshot, draft: BoardSnapshot): BoardSnapshot {
  const copy = new Y.Doc()
  try {
    Y.applyUpdate(copy, Y.encodeStateAsUpdate(live))
    mergeProposal(copy, base, draft)
    return snapshotDocument(copy)
  } finally {
    copy.destroy()
  }
}

function mergePage(live: Y.Doc, page: PageDiff, current: PageSnapshot | null) {
  const draft = page.after!
  if (!current) {
    // Added by the draft, or changed by it and removed from the board meanwhile: the page comes as the draft has it.
    writePage(live, page.id, { name: draft.name, order: draft.order })
    const cells = getCells(live, page.id)
    for (const cell of draft.cells.values()) writeSnapshot(cells, cell)
    return
  }
  const entry = getPages(live).get(page.id)
  if (entry instanceof Y.Map) {
    if (page.renamed && entry.get('name') !== draft.name) entry.set('name', draft.name)
    if (page.moved && entry.get('order') !== draft.order) entry.set('order', draft.order)
  }
  const merged = mergeCells(page.cells, current.cells, draft.cells)
  const cells = getCells(live, page.id)
  for (const [id, cell] of merged) {
    const before = current.cells.get(id)
    if (!before || !sameValue(before, cell)) writeSnapshot(cells, cell)
  }
  for (const id of current.cells.keys()) if (!merged.has(id)) cells.delete(id)
}

function removePage(live: Y.Doc, pageId: string) {
  getPages(live).delete(pageId)
  // A top-level type cannot be removed from the document, so the cells are cleared instead.
  const cells = getCells(live, pageId)
  Array.from(cells.keys()).forEach((cellId) => cells.delete(cellId))
}

/**
 * The cells of a page of the board with the `changes` of the draft since the base merged into them:
 *
 * - removed elements go, if the board still has them, with what the board holds in them and with the edges of the
 *   board that end at them, as a removal on the canvas takes them;
 * - changed elements that the board has get exactly the changed fields and keys of geometry, style and properties;
 *   a new parent that the board does not have is the layer, with the place of the draft, and a new end of an edge that
 *   the board does not have is not taken;
 * - added elements come with their descendants as the draft has them, see {@link cellsToRestore}: on the layer where the
 *   draft has them when their parent is not on the board, without edges whose ends are not on the board; so do changed
 *   elements that the board removed meanwhile;
 * - the rows of the tables that the merge touched are stacked again as the editor lays them out.
 */
export function mergeCells(
  changes: CellDiff[],
  board: Map<string, CellSnapshot>,
  draft: Map<string, CellSnapshot>,
): Map<string, CellSnapshot> {
  const merged = new Map(board)
  /** Tables whose rows the merge may have changed, by the ids of their cells on the board or in the draft. */
  const touched = new Set<string>()
  const touch = (cell: CellSnapshot | undefined) => {
    if (!cell) return
    touched.add(cell.id)
    if (cell.parent !== null) touched.add(cell.parent)
  }

  for (const change of changes) {
    if (change.type !== 'removed' || !merged.has(change.id)) continue
    for (const id of removal(merged, change.id)) {
      touch(merged.get(id))
      merged.delete(id)
    }
  }

  const restored: string[] = []
  const changed: string[] = []
  for (const change of changes) {
    if (change.type === 'added') {
      restored.push(change.id)
    } else if (change.type === 'changed') {
      const current = merged.get(change.id)
      if (!current) {
        // Removed from the board meanwhile: the draft wins, and it comes back as the draft has it.
        restored.push(change.id)
        continue
      }
      touch(current)
      merged.set(change.id, withChanges(current, change, draft))
      changed.push(change.id)
    }
  }
  for (const cell of cellsToRestore(draft, restored, (id) => merged.has(id))) {
    if (merged.has(cell.id)) continue
    merged.set(cell.id, cell)
    touch(cell)
  }

  for (const id of changed) settle(merged, id, board.get(id)!, draft)
  for (const id of touched) {
    const cell = merged.get(id)
    if (cell && isTable(cell)) stackTable(merged, cell)
    const holder = cell?.parent != null ? merged.get(cell.parent) : undefined
    if (holder && isTable(holder)) stackTable(merged, holder)
  }
  return merged
}

/** The cell `id` with the cells inside it and the edges that end at any of them, as removing it on the canvas goes. */
function removal(cells: Map<string, CellSnapshot>, id: string): Set<string> {
  const removed = new Set<string>()
  const add = (cellId: string) => {
    if (removed.has(cellId)) return
    removed.add(cellId)
    for (const cell of cells.values()) if (cell.parent === cellId) add(cell.id)
  }
  add(id)
  for (let grown = true; grown; ) {
    grown = false
    for (const cell of cells.values()) {
      const ends = cell.kind === 'edge' && !removed.has(cell.id)
      if (ends && ((cell.source !== null && removed.has(cell.source)) || (cell.target !== null && removed.has(cell.target)))) {
        add(cell.id)
        grown = true
      }
    }
  }
  return removed
}

/** The cell of the board with the changes of the draft: exactly the fields and keys that differ between base and draft. */
function withChanges(
  current: CellSnapshot,
  change: Extract<CellDiff, { type: 'changed' }>,
  draft: Map<string, CellSnapshot>,
): CellSnapshot {
  const { before, after, changes } = change
  const merged: CellSnapshot = { ...current, style: { ...current.style }, attrs: { ...current.attrs }, extra: { ...current.extra } }
  for (const field of changes.fields) {
    switch (field) {
      case 'kind':
        merged.kind = after.kind
        break
      case 'value':
        merged.value = after.value
        break
      case 'parent':
        merged.parent = after.parent
        break
      case 'source':
        merged.source = after.source
        break
      case 'target':
        merged.target = after.target
        break
      case 'order':
        merged.order = after.order
        break
      default:
        setKey(merged.extra, field, after.extra[field])
    }
  }
  // The size of the text of a row of a table is its height, which the layout of the table does not set.
  const rowHeight = isTableRow(before, draft) && before.geometry?.height !== after.geometry?.height ? ['height'] : []
  const geometryKeys = [...changes.geometry, ...rowHeight]
  if (geometryKeys.length > 0) {
    const geometry: Record<string, unknown> = { ...(current.geometry ?? EMPTY_GEOMETRY) }
    for (const key of geometryKeys) setKey(geometry, key, (after.geometry as Record<string, unknown> | null)?.[key])
    merged.geometry = geometry as unknown as GeometryData
  }
  for (const key of changes.style) setKey(merged.style, key, after.style[key])
  for (const key of changes.attrs) setKey(merged.attrs, key, after.attrs[key])
  // The author of the proposal changed it, when the draft says.
  for (const key of VOLATILE_KEYS) if (key in after.extra) merged.extra[key] = after.extra[key]
  return merged
}

/**
 * Puts a changed cell where it can stand on the board after the merge: an end of an edge that the board does not have
 * stays the one of the board, or the edge goes when that one is gone too; a parent that the board does not have, or
 * that the cell holds itself, is the layer, with the place the cell has in the draft.
 */
function settle(cells: Map<string, CellSnapshot>, id: string, onBoard: CellSnapshot, draft: Map<string, CellSnapshot>) {
  const cell = cells.get(id)
  if (!cell) return
  const present = (end: string | null) => end === null || cells.has(end)
  if (cell.kind === 'edge') {
    const source = present(cell.source) ? cell.source : onBoard.source
    const target = present(cell.target) ? cell.target : onBoard.target
    if (!present(source) || !present(target)) {
      removal(cells, id).forEach((gone) => cells.delete(gone))
      return
    }
    if (source !== cell.source || target !== cell.target) cells.set(id, { ...cell, source, target })
  }
  const parent = cells.get(id)!.parent
  if (parent === null || parent === LAYER_CELL_ID || (cells.has(parent) && !holds(cells, id, parent))) return
  const drafted = draft.get(id)
  const origin = (drafted && cellOrigin(draft, drafted)) ?? { x: 0, y: 0 }
  const geometry = cell.geometry && { ...cell.geometry, x: cell.geometry.x + origin.x, y: cell.geometry.y + origin.y }
  cells.set(id, { ...cells.get(id)!, parent: LAYER_CELL_ID, geometry })
}

/** Whether the cell `id` holds `other`, itself or deeper: a parent it holds would make a loop. */
function holds(cells: Map<string, CellSnapshot>, id: string, other: string): boolean {
  const seen = new Set<string>()
  for (let current: string | null = other; current !== null && !seen.has(current); current = cells.get(current)?.parent ?? null) {
    if (current === id) return true
    seen.add(current)
  }
  return false
}

const isTable = (cell: CellSnapshot) => cell.kind === 'vertex' && isTableStyle(cell.style)

/** The start size of a swimlane without one in its style, as maxGraph has it. */
const DEFAULT_START_SIZE = 40

/**
 * Stacks the rows of a table as the editor lays them out (`TableLayout` in `editor.ts`): the fields under the header in
 * the order of their keys, then the indexes after a gap, across the width of the table, and the height of the table to
 * the last row, or to the header without rows. Other transactions than its own the editor lays out on its canvas only,
 * so a merge that adds a row to a table where the board added another one would leave them on top of each other in the
 * document, and in its `.drawio`.
 */
function stackTable(cells: Map<string, CellSnapshot>, table: CellSnapshot) {
  const geometry = table.geometry
  if (!geometry) return
  const rows = [...cells.values()].filter((cell) => cell.parent === table.id && cell.kind === 'vertex').sort(compareCells)
  const ordered = [...rows.filter((row) => !isTableIndexStyle(row.style)), ...rows.filter((row) => isTableIndexStyle(row.style))]
  const header =
    table.style.shape === 'swimlane' ? Math.min(Number(table.style.startSize ?? DEFAULT_START_SIZE), geometry.height) : 0
  let y = header
  let indexes = false
  for (const row of ordered) {
    if (!indexes && isTableIndexStyle(row.style)) {
      y += TABLE_INDEX_GAP
      indexes = true
    }
    const height = row.geometry?.height ?? TABLE_FIELD_HEIGHT
    cells.set(row.id, { ...row, geometry: { ...(row.geometry ?? EMPTY_GEOMETRY), x: 0, y, width: geometry.width, height } })
    y += height
  }
  const height = ordered.length > 0 ? y : Number(table.style.startSize ?? DEFAULT_START_SIZE)
  cells.set(table.id, { ...table, geometry: { ...geometry, height } })
}

const EMPTY_GEOMETRY: GeometryData = { x: 0, y: 0, width: 0, height: 0 }

/** Sets the key of a record, or deletes it for `undefined`: a key that the draft removed. */
function setKey(record: Record<string, unknown>, key: string, value: unknown) {
  if (value === undefined) delete record[key]
  else record[key] = value
}

/**
 * Writes a cell as the merge has it into the cells of a page, changing only what differs, so that concurrent changes of
 * other keys merge: its fields and style, its properties key by key, and the fields the model does not know, the marks
 * of who changed it last among them.
 */
function writeSnapshot(cells: CellsMap, cell: CellSnapshot) {
  const { id, kind, parent, order, value, geometry, source, target, style } = cell
  writeCell(cells, { id, kind, parent, order, value, geometry, source, target, style })
  const entry = cells.get(id)!
  writeProperties(entry, cell.attrs as Record<string, string>)
  for (const key of Array.from(entry.keys())) {
    if (!MODEL_FIELDS.has(key) && !Object.hasOwn(cell.extra, key)) entry.delete(key)
  }
  for (const [key, value] of Object.entries(cell.extra)) {
    if (!sameValue(toPlain(entry.get(key)), value)) entry.set(key, structuredClone(value))
  }
}

/** Fields of a cell that the model writes; any other is one it does not know. */
const MODEL_FIELDS = new Set(['kind', 'parent', 'order', 'value', 'geometry', 'source', 'target', 'style', 'attrs'])

function writeProperties(entry: CellMap, attrs: Record<string, string>) {
  const current = entry.get('attrs')
  if (!(current instanceof Y.Map)) {
    if (Object.keys(attrs).length > 0) writeAttrs(entry, attrs)
    return
  }
  for (const key of Array.from(current.keys())) if (!Object.hasOwn(attrs, key)) current.delete(key)
  for (const [key, value] of Object.entries(attrs)) if (current.get(key) !== value) current.set(key, value)
  if (current.size === 0) entry.delete('attrs')
}

const toPlain = (value: unknown) => (value instanceof Y.AbstractType ? (value.toJSON() as unknown) : value)

function sameValue(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b)
}
