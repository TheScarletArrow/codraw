import {
  Cell,
  ChildChange,
  Geometry,
  GeometryChange,
  GraphDataModel,
  InternalEvent,
  Point,
  StyleChange,
  TerminalChange,
  ValueChange,
  type CellStyle,
  type EventObject,
} from '@maxgraph/core'
import * as Y from 'yjs'
import { isAttributedWrite, writeAttribution, writeTextAuthor, type Author } from './attribution.ts'
import { newId } from './ids.ts'
import {
  cellElementId,
  compareCells,
  deleteCell,
  dropUnusedElements,
  ELEMENT_KEY,
  elementIdOf,
  getCells,
  getElements,
  isElementStyleKey,
  LAYER_CELL_ID,
  orderBetween,
  readCell,
  ROOT_CELL_ID,
  writeCell,
  type CellData,
  type CellsMap,
  type ElementData,
  type GeometryData,
  type PointData,
  type StyleValue,
} from './model.ts'
import { isStickyStyle } from './shapes.ts'
import { elementData, healLabels, relabelElementCells, RELABEL_ORIGIN } from './sharedElements.ts'

/** Origin of transactions made by this client through the editor. Undo tracks only these. */
export const LOCAL_ORIGIN = 'codraw:local'

/**
 * Origin of transactions made by this client through the editor of a page. Each page has its own, so that the history
 * of a page tracks only what was done on it: elements are shared by the pages (see `getElements`), and with one origin
 * the history of another page would take a change of an element made here.
 */
export function localOrigin(pageId: string): string {
  return `${LOCAL_ORIGIN}:${pageId}`
}

const isStructural = (id: string) => id === ROOT_CELL_ID || id === LAYER_CELL_ID

/**
 * Keeps a maxGraph model and the cells of a Yjs page in sync. Yjs is the source of truth:
 *
 * - local edits (model `CHANGE` events) are written to Yjs in one transaction with {@link LOCAL_ORIGIN}, and every
 *   cell they change keeps in the same transaction that the author changed it and when, and a sticky whose text they
 *   change that the author wrote it;
 * - other transactions (remote participants, undo/redo) are reconciled into the model: every affected
 *   cell is re-read from Yjs, so the model ends up equal to the document whatever the order of events; a changed
 *   element re-reads the cells of the page that name it.
 *
 * The cells of elements carry their properties as style keys (see `model.ts`); deleting such cells, or naming another
 * element, deletes in the same transaction the elements that no cell names any longer. A local change of the properties
 * of an element rewrites, in the same transaction, the labels of its other cells on all pages (see `sharedElements.ts`);
 * those of this page that the change did not touch are read into the model after it. The labels of the cells of this
 * page that do not tell the properties of their elements, e.g. after two participants changed one element at the same
 * time, are put right when the page opens and when an element changes otherwise than through this binding.
 *
 * A read-only binding writes nothing: the participant may only view the board, and collab would reject the change,
 * leaving the document of this client different from everybody else's. Without an author the cells keep nobody.
 */
export class DiagramBinding {
  private applyingRemote = false

  private readonly model: GraphDataModel
  private readonly cells: CellsMap
  private readonly elements: Y.Map<Y.Map<unknown>> | null
  private readonly origin: unknown
  private readonly readOnly: boolean
  private readonly author: Author | null

  constructor(
    model: GraphDataModel,
    cells: CellsMap,
    origin: unknown = LOCAL_ORIGIN,
    readOnly = false,
    author: Author | null = null,
  ) {
    this.model = model
    this.cells = cells
    this.elements = cells.doc ? getElements(cells.doc) : null
    this.origin = origin
    this.readOnly = readOnly
    this.author = author
    // Cells are created by several clients at once, so ids must be globally unique.
    model.createId = () => newId()
    // maxGraph's ConnectionHandler inserts edges with the id '' and the model only generates ids for null,
    // so the first edge would get the id '' and never be synced.
    const cellAdded = model.cellAdded.bind(model)
    model.cellAdded = (cell) => {
      if (cell?.getId() === '') cell.id = null
      cellAdded(cell)
    }
    this.applyRemote(new Set(cells.keys()))
    this.applyRemote(new Set(this.heal()))
    cells.observeDeep(this.handleRemoteChanges)
    this.elements?.observeDeep(this.handleElementChanges)
    model.addListener(InternalEvent.CHANGE, this.handleLocalChanges)
  }

  /** The model is being changed to match the document: changes of other participants, undo, the stored cells. */
  isApplyingRemote(): boolean {
    return this.applyingRemote
  }

  /** Reads the cells `ids` of the page into the model, e.g. after a command changed them in the document. */
  refresh(ids: Iterable<string>) {
    this.applyRemote(new Set(ids))
  }

  destroy() {
    this.cells.unobserveDeep(this.handleRemoteChanges)
    this.elements?.unobserveDeep(this.handleElementChanges)
    this.model.removeListener(this.handleLocalChanges)
  }

  /** `GraphDataModel.getCell` returns `undefined` for unknown ids despite its type; normalize to `null`. */
  private find(id: string | null): Cell | null {
    return (id && this.model.getCell(id)) || null
  }

  private readonly handleRemoteChanges = (events: Y.YEvent<Y.AbstractType<unknown>>[], transaction: Y.Transaction) => {
    if (transaction.origin === this.origin) return
    const ids = new Set<string>()
    for (const event of events) {
      if (event.target === this.cells) {
        event.changes.keys.forEach((_, key) => ids.add(key))
      } else {
        ids.add(String(event.path[0]))
      }
    }
    this.applyRemote(ids)
  }

  /** Elements changed by others or by undo: the cells of the page that name them show their properties anew. */
  private readonly handleElementChanges = (events: Y.YEvent<Y.AbstractType<unknown>>[], transaction: Y.Transaction) => {
    if (transaction.origin === this.origin) return
    const changed = new Set<string>()
    for (const event of events) {
      if (event.target === this.elements) event.changes.keys.forEach((_, key) => changed.add(key))
      else changed.add(String(event.path[0]))
    }
    const ids = new Set<string>()
    this.cells.forEach((cell, id) => {
      const element = cellElementId(cell)
      if (element !== null && changed.has(element)) ids.add(id)
    })
    this.applyRemote(ids)
    this.heal(ids)
  }

  /**
   * Puts right the labels of the cells of the page (`ids`, or all) that do not tell the properties of their elements,
   * in a transaction that no history undoes, and returns their ids; once the binding observes the cells, the model gets
   * them as any change of the document that is not its own.
   */
  private heal(ids?: Iterable<string>): string[] {
    const doc = this.cells.doc
    if (this.readOnly || !doc) return []
    let healed: string[] = []
    doc.transact(() => {
      healed = healLabels(this.cells, ids)
    }, RELABEL_ORIGIN)
    return healed
  }

  /** The id of the page whose cells the binding holds. */
  private pageId(): string | null {
    for (const [name, type] of this.cells.doc?.share ?? []) {
      if ((type as unknown) === this.cells && name.startsWith('cells:')) return name.slice('cells:'.length)
    }
    return null
  }

  private readonly handleLocalChanges = (_sender: unknown, event: EventObject) => {
    if (this.applyingRemote || this.readOnly) return
    const touched = new Set<Cell>()
    for (const change of event.getProperty('changes') as unknown[]) {
      if (change instanceof ChildChange) {
        touched.add(change.child)
        change.child.getDescendants().forEach((cell) => touched.add(cell))
      } else if (
        change instanceof GeometryChange ||
        change instanceof StyleChange ||
        change instanceof ValueChange ||
        change instanceof TerminalChange
      ) {
        touched.add(change.cell)
      }
    }
    if (touched.size === 0) return

    const alive: Cell[] = []
    const removed: string[] = []
    for (const cell of touched) {
      const id = cell.getId()
      if (!id || isStructural(id)) continue
      if (this.find(id) === cell) alive.push(cell)
      else removed.push(id)
    }
    // Write in drawing order so that each cell finds the order keys of the siblings before it.
    alive.sort(compareModelPosition)

    const doc = this.cells.doc!
    // Cells of this page whose labels the change of an element rewrote without the model.
    const relabeled: string[] = []
    doc.transact(() => {
      const removedElements = removed.map((id) => cellElementId(this.cells.get(id)))
      removed.forEach((id) => deleteCell(this.cells, id))
      const at = Date.now()
      const written = new Set(alive.map((cell) => cell.getId()!))
      // The properties of the elements of the written cells before the change, and those the change changed.
      const before = new Map<string, ElementData | undefined>()
      const changedElements = new Set<string>()
      for (const cell of alive) {
        const data = this.toCellData(cell)
        // A cell that names another element now leaves the one it named.
        const named = cellElementId(this.cells.get(data.id))
        if (named !== null && named !== data.style[ELEMENT_KEY]) removedElements.push(named)
        const element = elementIdOf(data.style)
        if (element !== null && !before.has(element)) before.set(element, elementData(doc, element))
        // Cells the change touched but left as they were keep who changed them last, and so do those it only locked.
        const write = writeCell(this.cells, data)
        if (element !== null && write.style.some(isElementStyleKey)) changedElements.add(element)
        const entry = this.cells.get(data.id)!
        if (this.author && isAttributedWrite(write)) writeAttribution(entry, this.author, at)
        // Who wrote a sticky changes with its text only, not when the sticky is moved or recolored.
        if (this.author && write.fields.includes('value') && isStickyStyle(data.style)) {
          writeTextAuthor(entry, data.value.trim() ? this.author : null)
        }
      }
      for (const element of before.keys()) if (!changedElements.has(element)) before.delete(element)
      const page = this.pageId()
      for (const ref of relabelElementCells(doc, before, (ref) => ref.pageId === page && written.has(ref.cellId))) {
        const entry = getCells(doc, ref.pageId).get(ref.cellId)!
        if (this.author) writeAttribution(entry, this.author, at)
        if (ref.pageId === page) relabeled.push(ref.cellId)
      }
      dropUnusedElements(doc, removedElements)
    }, this.origin)
    this.applyRemote(new Set(relabeled))
  }

  /** Makes the model match Yjs for the given cell ids. */
  private applyRemote(ids: Set<string>) {
    if (ids.size === 0) return
    const model = this.model
    this.applyingRemote = true
    model.beginUpdate()
    try {
      const parentsToSort = new Set<Cell>()
      const present: [Cell, CellData][] = []

      for (const id of ids) {
        if (isStructural(id)) continue
        const entry = this.cells.get(id)
        const existing = this.find(id)
        if (!entry) {
          if (existing) {
            const parent = existing.getParent()
            if (parent) parentsToSort.add(parent)
            model.remove(existing)
          }
          continue
        }
        const data = readCell(id, entry)
        present.push([existing ?? createCell(data), data])
      }

      // Parents first, so that nested cells find their parent in the model.
      present.sort(([, a], [, b]) => this.depth(a.id) - this.depth(b.id))
      for (const [cell, data] of present) {
        const parent = this.find(data.parent) ?? this.find(LAYER_CELL_ID)!
        const previousParent = cell.getParent()
        if (previousParent !== parent) {
          if (previousParent) parentsToSort.add(previousParent)
          model.add(parent, cell)
        }
        parentsToSort.add(parent)
      }

      for (const [cell, data] of present) {
        const value = data.value
        if ((cell.getValue() ?? '') !== value) model.setValue(cell, value)
        if (!deepEqual(fromGeometry(cell.getGeometry()), data.geometry)) {
          const geometry = toGeometry(data.geometry)
          if (geometry) model.setGeometry(cell, geometry)
        }
        if (!deepEqual(fromStyle(cell.getStyle()), data.style)) model.setStyle(cell, { ...data.style } as CellStyle)
        cell.setConnectable(isConnectable(data))
        if (data.kind === 'edge') {
          const source = this.find(data.source)
          const target = this.find(data.target)
          if (cell.getTerminal(true) !== source) model.setTerminal(cell, source, true)
          if (cell.getTerminal(false) !== target) model.setTerminal(cell, target, false)
        }
      }

      parentsToSort.forEach((parent) => this.sortChildren(parent))
    } finally {
      model.endUpdate()
      this.applyingRemote = false
    }
  }

  private depth(id: string): number {
    let depth = 0
    let parent = this.cells.get(id)?.get('parent') as string | null | undefined
    while (parent && !isStructural(parent) && depth < 100) {
      depth++
      parent = this.cells.get(parent)?.get('parent') as string | null | undefined
    }
    return depth
  }

  private storedOrder(cell: Cell): string | null {
    const id = cell.getId()
    return (id && (this.cells.get(id)?.get('order') as string | undefined)) || null
  }

  private sortChildren(parent: Cell) {
    const children = Array.from({ length: parent.getChildCount() }, (_, index) => parent.getChildAt(index))
    const key = (cell: Cell) => ({ id: cell.getId() ?? '', order: this.storedOrder(cell) ?? '' })
    const desired = [...children].sort((a, b) => compareCells(key(a), key(b)))
    desired.forEach((child, index) => {
      if (parent.getChildAt(index) !== child) this.model.add(parent, child, index)
    })
  }

  /** Keeps the stored order key while it still fits between the neighbours, otherwise makes a new one. */
  private orderFor(cell: Cell): string {
    const parent = cell.getParent()!
    const index = parent.getIndex(cell)
    let before: string | null = null
    for (let i = index - 1; i >= 0 && before === null; i--) before = this.storedOrder(parent.getChildAt(i))
    let after: string | null = null
    for (let i = index + 1; i < parent.getChildCount() && after === null; i++) after = this.storedOrder(parent.getChildAt(i))

    const storedParent = this.cells.get(cell.getId()!)?.get('parent')
    const current = storedParent === parent.getId() ? this.storedOrder(cell) : null
    if (current && (before === null || before < current) && (after === null || current < after)) return current
    if (before !== null && after !== null && before >= after) return orderBetween(before, null)
    return orderBetween(before, after)
  }

  private toCellData(cell: Cell): CellData {
    const edge = cell.isEdge()
    const value = cell.getValue()
    return {
      id: cell.getId()!,
      kind: edge ? 'edge' : 'vertex',
      parent: cell.getParent()?.getId() ?? null,
      order: this.orderFor(cell),
      value: value == null ? '' : String(value),
      geometry: fromGeometry(cell.getGeometry()),
      source: edge ? (cell.getTerminal(true)?.getId() ?? null) : null,
      target: edge ? (cell.getTerminal(false)?.getId() ?? null) : null,
      style: fromStyle(cell.getStyle()),
    }
  }
}

export function createCell(data: CellData): Cell {
  const cell = new Cell(data.value, toGeometry(data.geometry) ?? undefined, { ...data.style } as CellStyle)
  cell.setId(data.id)
  if (data.kind === 'edge') cell.setEdge(true)
  else cell.setVertex(true)
  cell.setConnectable(isConnectable(data))
  return cell
}

/** `connectable=0` in the style keeps edges off a cell, as in draw.io, e.g. a label of an edge. */
function isConnectable(data: CellData): boolean {
  return data.style.connectable !== false && data.style.connectable !== 0
}

/** Orders cells by their position in the model tree, parents before children. */
function compareModelPosition(a: Cell, b: Cell): number {
  const pa = modelPath(a)
  const pb = modelPath(b)
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    if (pa[i] !== pb[i]) return pa[i]! - pb[i]!
  }
  return pa.length - pb.length
}

function modelPath(cell: Cell): number[] {
  const path: number[] = []
  let current: Cell | null = cell
  while (current?.getParent()) {
    const parent: Cell = current.getParent()!
    path.unshift(parent.getIndex(current))
    current = parent
  }
  return path
}

const point = (p: { x: number; y: number }): PointData => ({ x: p.x, y: p.y })

export function fromGeometry(geometry: Geometry | null): GeometryData | null {
  if (!geometry) return null
  const data: GeometryData = { x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height }
  if (geometry.relative) data.relative = true
  if (geometry.points?.length) data.points = geometry.points.map(point)
  if (geometry.offset && (geometry.offset.x !== 0 || geometry.offset.y !== 0)) data.offset = point(geometry.offset)
  if (geometry.sourcePoint) data.sourcePoint = point(geometry.sourcePoint)
  if (geometry.targetPoint) data.targetPoint = point(geometry.targetPoint)
  return data
}

export function toGeometry(data: GeometryData | null): Geometry | null {
  if (!data) return null
  const geometry = new Geometry(data.x, data.y, data.width, data.height)
  geometry.relative = data.relative ?? false
  if (data.points) geometry.points = data.points.map((p) => new Point(p.x, p.y))
  if (data.offset) geometry.offset = new Point(data.offset.x, data.offset.y)
  if (data.sourcePoint) geometry.sourcePoint = new Point(data.sourcePoint.x, data.sourcePoint.y)
  if (data.targetPoint) geometry.targetPoint = new Point(data.targetPoint.x, data.targetPoint.y)
  return geometry
}

/** Keeps the serializable part of a maxGraph style. */
export function fromStyle(style: CellStyle | null | undefined): Record<string, StyleValue> {
  const result: Record<string, StyleValue> = {}
  for (const [key, value] of Object.entries(style ?? {})) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      result[key] = value
    } else if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
      result[key] = [...value]
    }
  }
  return result
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  return keysA.every((key) => deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
}

/**
 * Undo/redo of this client's own edits of the cells of a page and of the elements they show: other participants'
 * changes are never undone.
 */
export function createUndoManager(cells: CellsMap, origin: unknown = LOCAL_ORIGIN): Y.UndoManager {
  // The whole document: a change of an element rewrites the labels of its cells on other pages in the same step. The
  // origin keeps what was done on other pages out.
  const scope = cells.doc ?? cells
  // The binding writes one transaction per user action, so every transaction is its own undo step; one that changed
  // nothing is none, as it was with types as the scope.
  return new Y.UndoManager(scope, {
    trackedOrigins: new Set([origin]),
    captureTimeout: 0,
    captureTransaction: (transaction) => transaction.changed.size > 0,
  })
}

/**
 * Undo managers of the pages of a board. Each page has its own history, of the transactions of its own origin (see
 * {@link localOrigin}), and it survives switching between pages: the managers live as long as the board is open, not as
 * long as the canvas of a page.
 */
export class PageHistories {
  private readonly managers = new Map<string, Y.UndoManager>()
  private readonly doc: Y.Doc

  constructor(doc: Y.Doc) {
    this.doc = doc
  }

  get(pageId: string): Y.UndoManager {
    let manager = this.managers.get(pageId)
    if (!manager) {
      manager = createUndoManager(getCells(this.doc, pageId), localOrigin(pageId))
      this.managers.set(pageId, manager)
    }
    return manager
  }

  /** Forgets all histories; later calls of {@link get} start new ones. */
  destroy() {
    this.managers.forEach((manager) => manager.destroy())
    this.managers.clear()
  }
}
