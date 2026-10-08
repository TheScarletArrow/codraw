import { vi } from 'vitest'
import type {
  Box,
  CellLink,
  ContextMenuRequest,
  DiagramEditor,
  EditorState,
  LabelEditing,
  Point,
  StickySignature,
} from '../diagram/editor.ts'
import { DEFAULT_PENCIL_LINE, type PencilLine } from '../diagram/freehand.ts'
import { unionBox, type PageSketch } from '../diagram/minimap.ts'
import { DEFAULT_PAGE_ID } from '../diagram/model.ts'

export type FakeEditor = DiagramEditor & {
  setState(state: Partial<EditorState>): void
  /** Simulates the local pointer over the canvas (diagram coordinates) or leaving it (`null`). */
  movePointer(point: Point | null): void
  select(ids: string[]): void
  /** Simulates a right click on the canvas. */
  rightClick(request: ContextMenuRequest): void
  /** Sets where a cell is shown; `cellBounds` returns it, and `pageSketch` draws it as a plain box. */
  placeCell(id: string, bounds: Box | null): void
  /**
   * Sets the points of the line of an edge (canvas points before scrolling); `edgePoints` returns them, and
   * `pageSketch` draws them.
   */
  placeEdge(id: string, points: Point[] | null): void
  /** Simulates scrolling: canvas points are diagram points shifted by this offset. */
  scrollTo(offset: Point): void
  /** Simulates a label edited in place, its change by another participant meanwhile, or the end of editing (`null`). */
  edit(editing: LabelEditing | null): void
  /** Simulates a point of a drag with the laser pointer (diagram coordinates) or releasing the button (`null`). */
  drawLaser(point: Point | null): void
  /** Simulates a click with the comment tool at a point (diagram coordinates). */
  placeComment(point: Point): void
  /** Sets the links of the elements of the page; `getLinks` returns them. */
  placeLinks(links: CellLink[]): void
  /** Simulates a click with Ctrl on an element with a link. */
  clickLink(link: CellLink): void
  /** Sets the stickies that `stickySignatures` returns. */
  setSignatures(signatures: StickySignature[]): void
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
    canCopyStyle: false,
    canPasteStyle: false,
    layoutSelection: false,
    laser: false,
    commentTool: false,
    pencil: false,
    pencilLine: DEFAULT_PENCIL_LINE,
    lock: null,
    attribution: null,
    canAddImages: false,
    link: null,
    edgeApi: null,
    stickies: null,
    status: null,
    properties: null,
    sequence: null,
    canPasteAsSameElement: false,
    canMergeElements: false,
  }
  let offset: Point = { x: 0, y: 0 }
  let viewVersion = 0
  let editing: LabelEditing | null = null
  let signatures: StickySignature[] = []
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
  const linkListeners = new Set<(link: CellLink) => void>()
  let links: readonly CellLink[] = []
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
  // The sketch of the placed cells, made again once they change.
  let sketch: PageSketch | null = null
  const drawSketch = (): PageSketch => {
    const shapes = [...cells].flatMap(([id, box]) =>
      box ? [{ id, ...box, rotation: 0, ellipse: false, fill: '#ffffff', stroke: '#1f2328', header: null }] : [],
    )
    const lines = [...edges].flatMap(([id, points]) => (points ? [{ id, points }] : []))
    let bounds: Box | null = null
    for (const box of shapes) bounds = unionBox(bounds, box)
    for (const point of lines.flatMap((line) => line.points)) {
      bounds = unionBox(bounds, { ...point, width: 0, height: 0 })
    }
    return { shapes, edges: lines, bounds }
  }

  return {
    graph: undefined as never,
    pageId,
    readOnly,
    addShape: vi.fn(() => null),
    addSticky: vi.fn(() => null),
    setStickyColor: vi.fn(),
    setTextFit: vi.fn(),
    stickySignatures: () => signatures,
    addTableField: vi.fn(() => null),
    setFieldProps: vi.fn(),
    addTableIndex: vi.fn(() => null),
    setIndexProps: vi.fn(),
    setTableVendor: vi.fn(),
    addSequenceParticipant: vi.fn(() => null),
    addSequenceMessage: vi.fn(() => null),
    addSequenceNote: vi.fn(() => null),
    addSequenceFrame: vi.fn(() => null),
    addSequenceBranch: vi.fn(() => null),
    setSequenceParticipant: vi.fn(),
    setSequenceMessage: vi.fn(),
    setSequenceNote: vi.fn(),
    setSequenceFrame: vi.fn(),
    setSequenceNumbering: vi.fn(),
    sequenceMermaid: vi.fn(() => null),
    addConnectedShape: vi.fn(() => null),
    copy: vi.fn(),
    cut: vi.fn(),
    paste: vi.fn(),
    addImages: vi.fn(async () => {}),
    duplicate: vi.fn(),
    copyStyle: vi.fn(),
    pasteStyle: vi.fn(),
    insertCells: vi.fn(),
    restoreCells: vi.fn(),
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
    setStatus: vi.fn(() => []),
    editLabel: vi.fn(),
    deleteSelection: vi.fn(),
    focus: vi.fn(),
    setTheme: vi.fn(),
    exportSvg: vi.fn(() => null),
    onContextMenu: (listener) => listen(menuListeners, listener),
    setEdgeMarker: vi.fn(),
    setColor: vi.fn(),
    setFillOpacity: vi.fn(),
    setFontSize: vi.fn(),
    stepFontSize: vi.fn(),
    toggleFontStyle: vi.fn(),
    setFontFamily: vi.fn(),
    setTextAlign: vi.fn(),
    setList: vi.fn(),
    setLineStyle: vi.fn(),
    setAutoWidth: vi.fn(),
    setTextWrap: vi.fn(),
    setBaseTable: vi.fn(),
    setDefaultBase: vi.fn(),
    setTableBase: vi.fn(),
    setGeometry: vi.fn(),
    setRotation: vi.fn(),
    setLink: vi.fn(),
    setEdgeApi: vi.fn(),
    setElementProperties: vi.fn(),
    setEdgeProperties: vi.fn(),
    setLegendItem: vi.fn(),
    pasteAsSameElement: vi.fn(),
    placeElement: vi.fn(),
    selectedElement: vi.fn(() => null),
    mergeCandidates: vi.fn(() => []),
    mergeElements: vi.fn(),
    mergeElementCells: vi.fn(() => false),
    detachElement: vi.fn(),
    deleteElementEverywhere: vi.fn(),
    getLinks: () => links,
    onLinkOpen: (listener) => listen(linkListeners, listener),
    toDiagramPoint: vi.fn((x: number, y: number) => ({ x, y })),
    toCanvasPoint: ({ x, y }) => ({ x: x - offset.x, y: y - offset.y }),
    cellBounds: (id) => {
      const box = cells.get(id)
      return box ? { ...box, x: box.x - offset.x, y: box.y - offset.y } : null
    },
    edgePoints: (id) => edges.get(id)?.map((point) => ({ x: point.x - offset.x, y: point.y - offset.y })) ?? null,
    viewportSize: () => viewport,
    visibleArea: () => {
      const width = viewport.width / state.scale
      const height = viewport.height / state.scale
      const middle = { x: offset.x + viewport.width / 2, y: offset.y + viewport.height / 2 }
      return { x: middle.x - width / 2, y: middle.y - height / 2, width, height }
    },
    pageSketch: () => (sketch ??= drawSketch()),
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
      state = { ...state, laser, commentTool: laser ? false : state.commentTool, pencil: laser ? false : state.pencil }
      listeners.forEach((listener) => listener())
    }),
    onLaser: (listener) => listen(laserListeners, listener),
    setCommentTool: vi.fn((commentTool: boolean) => {
      state = { ...state, commentTool, laser: commentTool ? false : state.laser, pencil: commentTool ? false : state.pencil }
      listeners.forEach((listener) => listener())
    }),
    onCommentPoint: (listener) => listen(commentListeners, listener),
    setPencil: vi.fn((pencil: boolean) => {
      state = { ...state, pencil, laser: pencil ? false : state.laser, commentTool: pencil ? false : state.commentTool }
      listeners.forEach((listener) => listener())
    }),
    setPencilLine: vi.fn((changes: Partial<PencilLine>) => {
      const defined = Object.entries(changes).filter(([, value]) => value !== undefined)
      state = { ...state, pencilLine: { ...state.pencilLine, ...Object.fromEntries(defined) } }
      listeners.forEach((listener) => listener())
    }),
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
      sketch = null
      changeView()
    },
    placeEdge(id, points) {
      edges.set(id, points)
      sketch = null
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
    placeLinks(next) {
      links = next
      changeView()
    },
    clickLink(link) {
      linkListeners.forEach((listener) => listener(link))
    },
    setSignatures(next) {
      signatures = next
      changeView()
    },
  }
}
