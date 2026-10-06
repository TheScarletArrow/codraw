import { vi } from 'vitest'
import type { Box, ContextMenuRequest, DiagramEditor, EditorState, LabelEditing, Point } from '../diagram/editor.ts'
import { DEFAULT_PAGE_ID } from '../diagram/model.ts'

export type FakeEditor = DiagramEditor & {
  setState(state: Partial<EditorState>): void
  /** Simulates the local pointer over the canvas (diagram coordinates) or leaving it (`null`). */
  movePointer(point: Point | null): void
  select(ids: string[]): void
  /** Simulates a right click on the canvas. */
  rightClick(request: ContextMenuRequest): void
  /** Sets where a cell is shown; `cellBounds` returns it. */
  placeCell(id: string, bounds: Box | null): void
  /** Sets the points of the line of an edge (canvas points before scrolling); `edgePoints` returns them. */
  placeEdge(id: string, points: Point[] | null): void
  /** Simulates scrolling: canvas points are diagram points shifted by this offset. */
  scrollTo(offset: Point): void
  /** Simulates a label edited in place, its change by another participant meanwhile, or the end of editing (`null`). */
  edit(editing: LabelEditing | null): void
  /** Simulates a point of a drag with the laser pointer (diagram coordinates) or releasing the button (`null`). */
  drawLaser(point: Point | null): void
  /** Simulates a click with the comment tool at a point (diagram coordinates). */
  placeComment(point: Point): void
}

export interface FakeEditorOptions {
  pageId?: string
  readOnly?: boolean
  viewport?: { width: number; height: number }
}

/** Editor stand-in for page tests: records calls and lets tests drive its events. */
export function createFakeEditor({
  pageId = DEFAULT_PAGE_ID,
  readOnly = false,
  viewport = { width: 800, height: 600 },
}: FakeEditorOptions = {}): FakeEditor {
  let state: EditorState = {
    canUndo: false,
    canRedo: false,
    scale: 1,
    tableSelected: false,
    tableVendor: null,
    field: null,
    index: null,
    tableBase: null,
    edgeMarkers: null,
    colors: null,
    line: null,
    text: null,
    geometry: null,
    quickConnect: null,
    canPaste: false,
    arrange: 0,
    canGroup: false,
    canUngroup: false,
    hasCells: false,
    canCopy: false,
    layoutSelection: false,
    laser: false,
    commentTool: false,
    lock: null,
    attribution: null,
  }
  let offset: Point = { x: 0, y: 0 }
  let viewVersion = 0
  let editing: LabelEditing | null = null
  const cells = new Map<string, Box | null>()
  const edges = new Map<string, Point[] | null>()
  const listeners = new Set<() => void>()
  const pointerListeners = new Set<(point: Point | null) => void>()
  const selectionListeners = new Set<(ids: string[]) => void>()
  const menuListeners = new Set<(request: ContextMenuRequest) => void>()
  const viewListeners = new Set<() => void>()
  const editingListeners = new Set<(editing: LabelEditing | null) => void>()
  const laserListeners = new Set<(point: Point | null) => void>()
  const commentListeners = new Set<(point: Point) => void>()
  const listen = <T>(set: Set<T>, listener: T) => {
    set.add(listener)
    return () => {
      set.delete(listener)
    }
  }
  const changeView = () => {
    viewVersion++
    viewListeners.forEach((listener) => listener())
  }

  return {
    graph: undefined as never,
    pageId,
    readOnly,
    addShape: vi.fn(() => null),
    addTableField: vi.fn(() => null),
    setFieldProps: vi.fn(),
    addTableIndex: vi.fn(() => null),
    setIndexProps: vi.fn(),
    setTableVendor: vi.fn(),
    addConnectedShape: vi.fn(() => null),
    copy: vi.fn(),
    cut: vi.fn(),
    paste: vi.fn(),
    duplicate: vi.fn(),
    insertCells: vi.fn(),
    bringToFront: vi.fn(),
    sendToBack: vi.fn(),
    selectAll: vi.fn(),
    moveSelection: vi.fn(),
    reverseEdge: vi.fn(),
    alignShapes: vi.fn(),
    distributeShapes: vi.fn(),
    autoLayout: vi.fn(async () => {}),
    group: vi.fn(() => null),
    ungroup: vi.fn(),
    setLocked: vi.fn(),
    editLabel: vi.fn(),
    deleteSelection: vi.fn(),
    focus: vi.fn(),
    exportSvg: vi.fn(() => null),
    onContextMenu: (listener) => listen(menuListeners, listener),
    setEdgeMarker: vi.fn(),
    setColor: vi.fn(),
    setFontSize: vi.fn(),
    stepFontSize: vi.fn(),
    toggleFontStyle: vi.fn(),
    setFontFamily: vi.fn(),
    setTextAlign: vi.fn(),
    setLineStyle: vi.fn(),
    setAutoWidth: vi.fn(),
    setTextWrap: vi.fn(),
    setBaseTable: vi.fn(),
    setDefaultBase: vi.fn(),
    setTableBase: vi.fn(),
    setGeometry: vi.fn(),
    toDiagramPoint: vi.fn((x: number, y: number) => ({ x, y })),
    toCanvasPoint: ({ x, y }) => ({ x: x - offset.x, y: y - offset.y }),
    cellBounds: (id) => {
      const box = cells.get(id)
      return box ? { ...box, x: box.x - offset.x, y: box.y - offset.y } : null
    },
    edgePoints: (id) => edges.get(id)?.map((point) => ({ x: point.x - offset.x, y: point.y - offset.y })) ?? null,
    viewportSize: () => viewport,
    // Scrolls so that the point is in the middle of the viewport.
    centerOn: vi.fn(({ x, y }: Point) => {
      offset = { x: x - viewport.width / 2, y: y - viewport.height / 2 }
      changeView()
    }),
    revealCell: vi.fn((id: string) => cells.get(id) != null),
    clearSelection: vi.fn(),
    viewportCenter: () => ({ x: offset.x + viewport.width / 2, y: offset.y + viewport.height / 2 }),
    zoomTo: vi.fn((scale: number) => {
      state = { ...state, scale }
      listeners.forEach((listener) => listener())
      changeView()
    }),
    onPointerMove: (listener) => listen(pointerListeners, listener),
    // The tools turn each other off, like those of the editor.
    setLaser: vi.fn((laser: boolean) => {
      state = { ...state, laser, commentTool: laser ? false : state.commentTool }
      listeners.forEach((listener) => listener())
    }),
    onLaser: (listener) => listen(laserListeners, listener),
    setCommentTool: vi.fn((commentTool: boolean) => {
      state = { ...state, commentTool, laser: commentTool ? false : state.laser }
      listeners.forEach((listener) => listener())
    }),
    onCommentPoint: (listener) => listen(commentListeners, listener),
    onSelectionChange: (listener) => listen(selectionListeners, listener),
    onViewChange: (listener) => listen(viewListeners, listener),
    getViewVersion: () => viewVersion,
    getEditing: () => editing,
    onEditingChange: (listener) => listen(editingListeners, listener),
    undo: vi.fn(),
    redo: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    zoomActual: vi.fn(),
    zoomToFit: vi.fn(),
    getState: () => state,
    subscribe: (listener) => listen(listeners, listener),
    destroy: vi.fn(),
    setState(changes) {
      state = { ...state, ...changes }
      listeners.forEach((listener) => listener())
    },
    movePointer(point) {
      pointerListeners.forEach((listener) => listener(point))
    },
    select(ids) {
      selectionListeners.forEach((listener) => listener(ids))
    },
    rightClick(request) {
      menuListeners.forEach((listener) => listener(request))
    },
    placeCell(id, bounds) {
      cells.set(id, bounds)
      changeView()
    },
    placeEdge(id, points) {
      edges.set(id, points)
      changeView()
    },
    scrollTo(next) {
      offset = next
      changeView()
    },
    edit(next) {
      editing = next
      editingListeners.forEach((listener) => listener(next))
    },
    drawLaser(point) {
      laserListeners.forEach((listener) => listener(point))
    },
    placeComment(point) {
      commentListeners.forEach((listener) => listener(point))
    },
  }
}
