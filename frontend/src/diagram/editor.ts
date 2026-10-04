import {
  Cell,
  CellEditorHandler,
  Client,
  ConnectionHandler,
  Geometry,
  Graph,
  GraphDataModel,
  ImageBox,
  InternalEvent,
  KeyHandler,
  LayoutManager,
  PopupMenuHandler,
  SelectionHandler,
  Point as GraphPoint,
  RubberBandHandler,
  StackLayout,
  getDefaultPlugins,
  type CellState,
  type CellStyle,
  type ImageShape,
  type StyleArrowValue,
} from '@maxgraph/core'
import * as Y from 'yjs'
import { createUndoManager, DiagramBinding } from './binding.ts'
import type { MenuTarget } from './canvasMenu.ts'
import { clipboard } from './clipboard.ts'
import { registerDiagramExtensions } from './extensions.ts'
import { DEFAULT_PAGE_ID, getCells } from './model.ts'
import { blocksPlacement, placeConnected, type Side } from './quickConnect.ts'
import { touchedByRegion } from './regionSelection.ts'
import {
  findShape,
  groupShapes,
  isTableStyle,
  markedStyle,
  shapeGroup,
  shapeGroupOf,
  TABLE_FIELD_HEIGHT,
  TABLE_FIELD_STYLE,
  TABLE_HEADER_HEIGHT,
  type ShapeId,
  type ShapeGroup,
  type ShapePreset,
  type ShapeStyle,
} from './shapes.ts'

export interface Point {
  x: number
  y: number
}

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export type EdgeEnd = 'start' | 'end'

/** Markers of the selected edges; `null` for an end where the edges have different markers. */
export interface EdgeMarkers {
  start: string | null
  end: string | null
}

export type ColorTarget = 'fill' | 'stroke' | 'font'

/** Colors of the selected objects; `null` for a color that differs between them. */
export interface SelectionColors {
  fill: string | null
  stroke: string | null
  font: string | null
  /** Shapes are selected, so the fill can be changed; edges have no fill. */
  hasShapes: boolean
}

/** The selected shape that the arrows continue, and the shapes of its group they offer. */
export interface QuickConnectSource {
  cellId: string
  shapes: ShapeId[]
}

export interface EditorState {
  canUndo: boolean
  canRedo: boolean
  scale: number
  /** A table or a field of a table is selected, so a field can be added. */
  tableSelected: boolean
  /** Markers of the selected edges, or `null` when no edge is selected. */
  edgeMarkers: EdgeMarkers | null
  /** Colors of the selection, or `null` when nothing is selected. */
  colors: SelectionColors | null
  /** The single selected shape with a group, or `null` when there is none. */
  quickConnect: QuickConnectSource | null
  /** The clipboard of the browser tab holds something to paste. */
  canPaste: boolean
}

/** A right click on the canvas, reported after maxGraph has updated the selection for it. */
export interface ContextMenuRequest {
  /** Point of the click relative to the visible top-left corner of the canvas. */
  x: number
  y: number
  /** The same point in diagram coordinates. */
  point: Point
  target: MenuTarget
}

/** Editor of one board page: a maxGraph canvas bound to the Yjs document. */
export interface DiagramEditor {
  readonly graph: Graph
  /** The page whose cells the canvas shows. */
  readonly pageId: string
  /** Adds a palette shape centred at `center` (diagram coordinates) or in the middle of the visible area. */
  addShape(shape: ShapeId, center?: Point): Cell | null
  /** Adds a field under the selected field (or at the end of the selected table) and starts editing it. */
  addTableField(): Cell | null
  /**
   * Adds a shape of the group of the selected shape on its `side` and connects the selected shape to it, as one undo
   * step, and selects the new shape.
   */
  addConnectedShape(side: Side, shape: ShapeId): Cell | null
  /** Puts the selected shapes, tables of selected fields and the edges between them into the clipboard. */
  copy(): void
  /** Copies like {@link copy} and removes what was copied, as one undo step. */
  cut(): void
  /** Adds the clipboard as one undo step: shifted further with every paste, or with its top-left corner at `at`. */
  paste(at?: Point): void
  /** Adds a shifted copy of what {@link copy} would copy, without changing the clipboard. */
  duplicate(): void
  bringToFront(): void
  sendToBack(): void
  /** Selects all shapes and edges of the page. */
  selectAll(): void
  /** Swaps the ends of the selected edge with its bend points, as one undo step. */
  reverseEdge(): void
  /** Starts editing the label of the selected element. */
  editLabel(): void
  deleteSelection(): void
  /** Gives the keyboard to the canvas, so that its shortcuts work, unless a label is being edited. */
  focus(): void
  /** Reports right clicks on the canvas; returns an unsubscribe function. */
  onContextMenu(listener: (request: ContextMenuRequest) => void): () => void
  /** Sets the marker of the start or the end of the selected edges. */
  setEdgeMarker(end: EdgeEnd, marker: string): void
  /** Sets the fill (shapes only), line or text color of the selected objects as one undo step. */
  setColor(target: ColorTarget, color: string): void
  /** Converts a client (viewport) position to diagram coordinates. */
  toDiagramPoint(clientX: number, clientY: number): Point
  /** Converts diagram coordinates to a position relative to the visible top-left corner of the canvas. */
  toCanvasPoint(point: Point): Point
  /** Bounds of a cell relative to the visible top-left corner of the canvas, or `null` if it is not shown. */
  cellBounds(id: string): Box | null
  /** Size of the visible area of the canvas, without scrollbars. */
  viewportSize(): { width: number; height: number }
  /** Scrolls (or, beyond the scrollable area, pans) the canvas so that a diagram point is in its middle. */
  centerOn(point: Point): void
  /** Reports the pointer position over the canvas in diagram coordinates, and `null` when it leaves. */
  onPointerMove(listener: (point: Point | null) => void): () => void
  /** Reports the ids of the selected cells whenever the selection changes. */
  onSelectionChange(listener: (ids: string[]) => void): () => void
  /** Reports that the picture on the screen moved: scrolling, zooming or changed cells. */
  onViewChange(listener: () => void): () => void
  /** Increases with every view change; lets React re-render positions computed from the view. */
  getViewVersion(): number
  undo(): void
  redo(): void
  zoomIn(): void
  zoomOut(): void
  zoomActual(): void
  getState(): EditorState
  /** Calls `listener` whenever {@link getState} changes; returns an unsubscribe function. */
  subscribe(listener: () => void): () => void
  destroy(): void
}

/** Connection point shown next to the right border of a hovered shape; dragging it creates an edge. */
const CONNECT_ICON = new ImageBox(
  'data:image/svg+xml,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="6.5" fill="#2563eb" stroke="#fff" stroke-width="1.5"/><path d="M6 5l3 3-3 3" fill="none" stroke="#fff" stroke-width="1.5"/></svg>',
    ),
  16,
  16,
)

/** Property of the canvas element that exposes the editor to end-to-end tests. */
export const EDITOR_PROPERTY = '__codrawEditor'

const KEY_BACKSPACE = 8
const KEY_DELETE = 46
const KEY_A = 65
const KEY_C = 67
const KEY_D = 68
const KEY_V = 86
const KEY_X = 88
const KEY_Y = 89
const KEY_Z = 90
const KEY_F2 = 113

/** Shift of a duplicate, and of every next paste of the same clipboard with the keyboard. */
const PASTE_OFFSET = 20

export interface DiagramEditorOptions {
  /** The page to show; the default page of a new board by default. */
  pageId?: string
  /**
   * History of the page that outlives the editor, e.g. to keep it while the user visits other pages.
   * Without it the editor keeps its own history and destroys it with itself.
   */
  undoManager?: Y.UndoManager
}

export function createDiagramEditor(
  container: HTMLElement,
  document: Y.Doc,
  { pageId = DEFAULT_PAGE_ID, undoManager: sharedUndoManager }: DiagramEditorOptions = {},
): DiagramEditor {
  const model = new GraphDataModel()
  const cells = getCells(document, pageId)
  const undoManager = sharedUndoManager ?? createUndoManager(cells)

  const graph = new Graph(container, model, [...getDefaultPlugins(), RubberBandHandler])
  // After the graph: the first graph registers the default shapes of maxGraph, including its own `rectangle`.
  registerDiagramExtensions()
  graph.setPanning(true)
  graph.setConnectable(true)
  graph.setAllowDanglingEdges(false)
  graph.setDropEnabled(false)
  graph.setGridEnabled(true)
  graph.setGridSize(10)
  // Tables are the only containers, and they are never collapsed.
  graph.options.foldingEnabled = false
  // Labels are plain text: rendering HTML from other participants would allow script injection.
  graph.setHtmlLabels(false)
  configureStyles(graph)
  configureConnections(graph)
  configureSelection(graph)
  configureRegionSelection(graph)
  const layoutManager = new LayoutManager(graph)
  const tableLayout = new TableLayout(graph)
  layoutManager.getLayout = (cell) => (isTable(cell) ? tableLayout : null)
  // Bound only now, so that the stored cells are laid out like any later change of other participants.
  const binding = new DiagramBinding(model, cells)
  const cellEditor = graph.getPlugin<CellEditorHandler>('CellEditorHandler')
  // Commit a label when its editor loses focus, e.g. when the user clicks the palette or the toolbar.
  if (cellEditor) cellEditor.blurEnabled = true

  const selectedEdges = () => graph.getSelectionCells().filter((cell) => cell.isEdge())
  const selectedTable = (): Cell | null => {
    const cell = graph.getSelectionCount() === 1 ? graph.getSelectionCell() : null
    if (!cell || isTable(cell)) return cell
    const parent = cell.getParent()
    return isTable(parent) ? parent : null
  }
  /** The single selected shape with a group; a table field is part of its table, not a shape of its own. */
  const quickConnectSource = (): { cell: Cell; group: ShapeGroup } | null => {
    const cell = graph.getSelectionCount() === 1 ? graph.getSelectionCell() : null
    if (!cell?.isVertex() || isTable(cell.getParent())) return null
    const group = shapeGroupOf(cell.getStyle() as ShapeStyle)
    return group ? { cell, group } : null
  }
  const quickConnect = (): QuickConnectSource | null => {
    const source = quickConnectSource()
    return source ? { cellId: source.cell.getId()!, shapes: groupShapes(source.group).map((shape) => shape.id) } : null
  }
  const markerOf = (edge: Cell, end: EdgeEnd) =>
    String(graph.getCellStyle(edge)[end === 'start' ? 'startArrow' : 'endArrow'] ?? 'none')
  const sameMarker = (edges: Cell[], end: EdgeEnd) => same(edges.map((edge) => markerOf(edge, end)))
  // The stored color, or the default of shapes or edges; the merged style drops `none`, so it cannot tell.
  const colorOf = (cell: Cell, target: ColorTarget) => {
    const stylesheet = graph.getStylesheet()
    const defaults = cell.isEdge() ? stylesheet.getDefaultEdgeStyle() : stylesheet.getDefaultVertexStyle()
    const key = COLOR_KEYS[target]
    return String(cell.getStyle()[key] ?? defaults[key] ?? 'none')
  }
  const selectionColors = (): SelectionColors | null => {
    const cells = graph.getSelectionCells()
    if (cells.length === 0) return null
    const shapes = cells.filter((cell) => cell.isVertex())
    return {
      fill: shapes.length > 0 ? same(shapes.map((cell) => colorOf(cell, 'fill'))) : null,
      stroke: same(cells.map((cell) => colorOf(cell, 'stroke'))),
      font: same(cells.map((cell) => colorOf(cell, 'font'))),
      hasShapes: shapes.length > 0,
    }
  }

  const readState = (): EditorState => {
    const edges = selectedEdges()
    return {
      canUndo: undoManager.canUndo(),
      canRedo: undoManager.canRedo(),
      scale: graph.getView().scale,
      tableSelected: selectedTable() !== null,
      edgeMarkers: edges.length > 0 ? { start: sameMarker(edges, 'start'), end: sameMarker(edges, 'end') } : null,
      colors: selectionColors(),
      quickConnect: quickConnect(),
      canPaste: clipboard.read() !== null,
    }
  }
  // Cached so that the same state object is returned until something changes (useSyncExternalStore).
  let state = readState()
  const listeners = new Set<() => void>()
  const notify = () => {
    state = readState()
    listeners.forEach((listener) => listener())
  }
  undoManager.on('stack-item-added', notify)
  undoManager.on('stack-item-popped', notify)
  undoManager.on('stack-cleared', notify)
  graph.getView().addListener(InternalEvent.SCALE, notify)
  graph.getView().addListener(InternalEvent.SCALE_AND_TRANSLATE, notify)
  // The selection and the markers of the selected edges, also when another participant changes them.
  graph.getSelectionModel().addListener(InternalEvent.CHANGE, notify)
  model.addListener(InternalEvent.CHANGE, notify)

  const removeSelection = () => {
    if (!graph.isEditing() && !graph.isSelectionEmpty()) {
      graph.removeCells(graph.getSelectionCells(), true)
    }
  }
  const keyHandler = new KeyHandler(graph)
  // maxGraph reads only Ctrl; on macOS the shortcuts are Cmd.
  keyHandler.isControlDown = (event) => event.ctrlKey || (Client.IS_MAC && event.metaKey)
  keyHandler.bindKey(KEY_DELETE, removeSelection)
  keyHandler.bindKey(KEY_BACKSPACE, removeSelection)
  keyHandler.bindControlKey(KEY_Z, () => editor.undo())
  keyHandler.bindControlShiftKey(KEY_Z, () => editor.redo())
  keyHandler.bindControlKey(KEY_Y, () => editor.redo())
  keyHandler.bindControlKey(KEY_C, () => editor.copy())
  keyHandler.bindControlKey(KEY_X, () => editor.cut())
  keyHandler.bindControlKey(KEY_V, () => editor.paste())
  keyHandler.bindControlKey(KEY_D, () => editor.duplicate())
  keyHandler.bindControlKey(KEY_A, () => editor.selectAll())
  keyHandler.bindKey(KEY_F2, () => editor.editLabel())

  // maxGraph cancels pointerdown, so the canvas would not take focus and its keyboard shortcuts would
  // not work after clicking a palette button. The in-place label editor keeps its own focus.
  const focusCanvas = (event: PointerEvent) => {
    if (!(event.target instanceof HTMLElement && event.target.isContentEditable)) {
      container.focus({ preventScroll: true })
    }
  }
  container.addEventListener('pointerdown', focusCanvas, true)

  const handleWheel = (event: Event, up: boolean) => {
    const wheel = event as WheelEvent
    if (!wheel.ctrlKey && !wheel.metaKey) return
    if (up) graph.zoomIn()
    else graph.zoomOut()
    InternalEvent.consume(event)
  }
  InternalEvent.addMouseWheelListener(handleWheel, container)

  const toDiagramPoint = (clientX: number, clientY: number): Point => {
    const rect = container.getBoundingClientRect()
    const { scale, translate } = graph.getView()
    return {
      x: (clientX - rect.left + container.scrollLeft) / scale - translate.x,
      y: (clientY - rect.top + container.scrollTop) / scale - translate.y,
    }
  }

  const visibleCenter = (): Point => {
    const rect = container.getBoundingClientRect()
    return toDiagramPoint(rect.left + container.clientWidth / 2, rect.top + container.clientHeight / 2)
  }

  const pointerListeners = new Set<(point: Point | null) => void>()
  const handlePointerMove = (event: PointerEvent) => {
    const point = toDiagramPoint(event.clientX, event.clientY)
    pointerListeners.forEach((listener) => listener(point))
  }
  const handlePointerLeave = () => pointerListeners.forEach((listener) => listener(null))
  // Captured: maxGraph stops pointer events on connection points and selection handles from bubbling up.
  container.addEventListener('pointermove', handlePointerMove, true)
  container.addEventListener('pointerleave', handlePointerLeave)

  const menuListeners = new Set<(request: ContextMenuRequest) => void>()
  const menuTarget = (): MenuTarget => {
    const cells = graph.getSelectionCells()
    if (cells.length === 0) return 'canvas'
    if (cells.length > 1) return 'selection'
    const cell = cells[0]!
    if (cell.isEdge()) return 'edge'
    if (isTable(cell.getParent())) return 'field'
    return isTable(cell) ? 'table' : 'shape'
  }
  // maxGraph decides when a right click is a menu click (not panning), and selects the cell under the pointer
  // first. It shows no menu of its own: the factory adds no items to it.
  const popupMenu = graph.getPlugin<PopupMenuHandler>('PopupMenuHandler')
  if (popupMenu) {
    popupMenu.factoryMethod = (_menu, _cell, event) => {
      if (graph.isEditing()) return
      const rect = container.getBoundingClientRect()
      const request: ContextMenuRequest = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        point: toDiagramPoint(event.clientX, event.clientY),
        target: menuTarget(),
      }
      menuListeners.forEach((listener) => listener(request))
    }
  }
  // The label editor keeps the menu of the browser, with its text actions and spelling suggestions.
  const preventBrowserMenu = (event: MouseEvent) => {
    if (!(event.target instanceof HTMLElement && event.target.isContentEditable)) event.preventDefault()
  }
  container.addEventListener('contextmenu', preventBrowserMenu)

  const selectionListeners = new Set<(ids: string[]) => void>()
  const handleSelectionChange = () => {
    const ids = graph.getSelectionCells().flatMap((cell) => cell.getId() ?? [])
    selectionListeners.forEach((listener) => listener(ids))
  }
  graph.getSelectionModel().addListener(InternalEvent.CHANGE, handleSelectionChange)

  let viewVersion = 0
  const viewListeners = new Set<() => void>()
  const notifyView = () => {
    viewVersion++
    viewListeners.forEach((listener) => listener())
  }
  container.addEventListener('scroll', notifyView)
  graph.getView().addListener(InternalEvent.SCALE, notifyView)
  graph.getView().addListener(InternalEvent.TRANSLATE, notifyView)
  graph.getView().addListener(InternalEvent.SCALE_AND_TRANSLATE, notifyView)
  model.addListener(InternalEvent.CHANGE, notifyView)

  const listen = <T>(set: Set<T>, listener: T) => {
    set.add(listener)
    return () => {
      set.delete(listener)
    }
  }

  /** Inserts a palette shape with its children; the caller wraps it in a model update. */
  const insertShape = (shape: ShapePreset, parent: Cell, x: number, y: number): Cell => {
    const cell = graph.insertVertex({
      parent,
      value: shape.value,
      position: [x, y],
      size: [shape.width, shape.height],
      style: markedStyle(shape) as CellStyle,
    })
    let childY = isTableStyle(shape.style) ? TABLE_HEADER_HEIGHT : 0
    for (const child of shape.children ?? []) {
      graph.insertVertex({
        parent: cell,
        value: child.value,
        position: [0, childY],
        size: [shape.width, child.height],
        style: { ...child.style } as CellStyle,
      })
      childY += child.height
    }
    return cell
  }

  /** The selection with fields replaced by their tables, and the edges of the page between those shapes. */
  const cellsToCopy = (): Cell[] => {
    const owner = (cell: Cell) => (isTable(cell.getParent()) ? cell.getParent()! : cell)
    const shapes = new Set(
      graph
        .getSelectionCells()
        .filter((cell) => cell.isVertex())
        .map(owner),
    )
    const copied = (terminal: Cell | null) => terminal !== null && shapes.has(owner(terminal))
    const edges = graph
      .getDefaultParent()
      .getChildren()
      .filter((cell) => cell.isEdge() && copied(cell.getTerminal(true)) && copied(cell.getTerminal(false)))
    return [...shapes, ...edges]
  }
  /** Adds clones of `cells` moved by (dx, dy) as one undo step and selects them. */
  const insertCopies = (cells: Cell[], dx: number, dy: number) => {
    graph.stopEditing(false)
    graph.setSelectionCells(graph.importCells(cells, dx, dy, graph.getDefaultParent()))
    container.focus({ preventScroll: true })
  }
  /** Selected cells without table fields: the table layout, not the user, orders fields. */
  const selectedShapesAndEdges = () => graph.getSelectionCells().filter((cell) => !isTable(cell.getParent()))

  const editor: DiagramEditor = {
    graph,
    pageId,
    addShape(shapeId, center = visibleCenter()) {
      const shape = findShape(shapeId)
      if (!shape) return null
      const size = graph.getGridSize()
      const snap = (value: number) => Math.round(value / size) * size
      const parent = graph.getDefaultParent()
      const vertices = Array.from({ length: parent.getChildCount() }, (_, index) => parent.getChildAt(index)).filter(
        (cell) => cell.isVertex(),
      )
      const occupied = (cx: number, cy: number) =>
        vertices.some((cell) => {
          const geometry = cell.getGeometry()
          return (
            geometry !== null &&
            Math.abs(geometry.x + geometry.width / 2 - cx) < size &&
            Math.abs(geometry.y + geometry.height / 2 - cy) < size
          )
        })
      // Repeated clicks would stack shapes on top of each other; cascade them instead.
      let { x: cx, y: cy } = center
      while (occupied(cx, cy)) {
        cx += 2 * size
        cy += 2 * size
      }
      const x = snap(cx - shape.width / 2)
      const y = snap(cy - shape.height / 2)
      // The shape and its children, e.g. the first field of a table, are one change and one undo step.
      model.beginUpdate()
      let cell: Cell
      try {
        cell = insertShape(shape, parent, x, y)
      } finally {
        model.endUpdate()
      }
      graph.setSelectionCell(cell)
      container.focus({ preventScroll: true })
      return cell
    },
    addTableField() {
      const table = selectedTable()
      if (!table) return null
      const selected = graph.getSelectionCell()
      const fields = Array.from({ length: table.getChildCount() }, (_, index) => table.getChildAt(index))
      const after = selected !== table ? selected : (fields.at(-1) ?? null)
      // The table layout stacks fields in the order of the cells and fixes the position.
      const field = new Cell('', new Geometry(0, TABLE_HEADER_HEIGHT, table.getGeometry()!.width, TABLE_FIELD_HEIGHT), {
        ...TABLE_FIELD_STYLE,
      } as CellStyle)
      field.setVertex(true)
      graph.addCell(field, table, after ? table.getIndex(after) + 1 : fields.length)
      graph.setSelectionCell(field)
      graph.startEditingAtCell(field)
      return field
    },
    addConnectedShape(side, shapeId) {
      const shape = findShape(shapeId)
      const selected = quickConnectSource()
      const geometry = selected?.cell.getGeometry()
      // Only shapes of the same notation are connected this way.
      if (!shape || !selected || !geometry || shapeGroup(shape.id) !== selected.group) return null
      const source = selected.cell
      graph.stopEditing(false)
      const parent = source.getParent()!
      const obstacles = parent
        .getChildren()
        .filter((cell) => cell !== source && cell.isVertex() && blocksPlacement(cell.getStyle() as ShapeStyle))
        .flatMap((cell) => cell.getGeometry() ?? [])
      const { x, y } = placeConnected(geometry, shape, side, obstacles)
      model.beginUpdate()
      let cell: Cell
      try {
        cell = insertShape(shape, parent, x, y)
        graph.insertEdge({ parent, value: '', source, target: cell })
      } finally {
        model.endUpdate()
      }
      graph.setSelectionCell(cell)
      container.focus({ preventScroll: true })
      return cell
    },
    copy() {
      const cells = cellsToCopy()
      if (cells.length === 0) return
      // Clones without a graph: the copied cells may change or be removed before they are pasted.
      clipboard.put(graph.cloneCells(cells, false))
      notify()
    },
    cut() {
      const cells = cellsToCopy()
      if (cells.length === 0) return
      graph.stopEditing(false)
      clipboard.put(graph.cloneCells(cells, false))
      graph.removeCells(cells, true)
      notify()
    },
    paste(at) {
      const cells = clipboard.read()
      if (!cells) return
      if (at) {
        const bounds = graph.getBoundingBoxFromGeometry(cells, false)
        insertCopies(cells, at.x - (bounds?.x ?? 0), at.y - (bounds?.y ?? 0))
      } else {
        const shift = clipboard.nextPaste() * PASTE_OFFSET
        insertCopies(cells, shift, shift)
      }
    },
    duplicate() {
      const cells = cellsToCopy()
      if (cells.length > 0) insertCopies(cells, PASTE_OFFSET, PASTE_OFFSET)
    },
    bringToFront() {
      const cells = selectedShapesAndEdges()
      if (cells.length > 0) graph.orderCells(false, cells)
    },
    sendToBack() {
      const cells = selectedShapesAndEdges()
      if (cells.length > 0) graph.orderCells(true, cells)
    },
    selectAll() {
      graph.stopEditing(false)
      graph.selectAll()
    },
    reverseEdge() {
      const edge = graph.getSelectionCount() === 1 ? graph.getSelectionCell() : null
      if (!edge?.isEdge()) return
      graph.stopEditing(false)
      const source = edge.getTerminal(true)
      const target = edge.getTerminal(false)
      model.beginUpdate()
      try {
        model.setTerminal(edge, target, true)
        model.setTerminal(edge, source, false)
        const geometry = edge.getGeometry()
        if (geometry) {
          const reversed = geometry.clone()
          reversed.points = geometry.points ? [...geometry.points].reverse() : geometry.points
          reversed.sourcePoint = geometry.targetPoint
          reversed.targetPoint = geometry.sourcePoint
          model.setGeometry(edge, reversed)
        }
        const style = edge.getStyle() as Record<string, unknown>
        if (END_STYLE_KEYS.some(([exit, entry]) => exit in style || entry in style)) {
          const swapped = { ...style }
          for (const [exit, entry] of END_STYLE_KEYS) {
            delete swapped[exit]
            delete swapped[entry]
            if (style[entry] !== undefined) swapped[exit] = style[entry]
            if (style[exit] !== undefined) swapped[entry] = style[exit]
          }
          model.setStyle(edge, swapped as CellStyle)
        }
      } finally {
        model.endUpdate()
      }
    },
    editLabel() {
      const cell = graph.getSelectionCount() === 1 ? graph.getSelectionCell() : null
      if (cell) graph.startEditingAtCell(cell)
    },
    deleteSelection: removeSelection,
    focus() {
      if (!graph.isEditing()) container.focus({ preventScroll: true })
    },
    onContextMenu: (listener) => listen(menuListeners, listener),
    setEdgeMarker(end, marker) {
      const edges = selectedEdges()
      if (edges.length === 0) return
      graph.stopEditing(false)
      graph.setCellStyles(end === 'start' ? 'startArrow' : 'endArrow', marker as StyleArrowValue, edges)
    },
    setColor(target, color) {
      const cells = graph.getSelectionCells().filter((cell) => target !== 'fill' || cell.isVertex())
      if (cells.length === 0) return
      graph.stopEditing(false)
      graph.setCellStyles(COLOR_KEYS[target], color, cells)
    },
    toDiagramPoint,
    toCanvasPoint({ x, y }) {
      const { scale, translate } = graph.getView()
      return {
        x: (x + translate.x) * scale - container.scrollLeft,
        y: (y + translate.y) * scale - container.scrollTop,
      }
    },
    cellBounds(id) {
      const cell = model.getCell(id)
      const state = cell ? graph.getView().getState(cell) : null
      if (!state) return null
      return { x: state.x - container.scrollLeft, y: state.y - container.scrollTop, width: state.width, height: state.height }
    },
    viewportSize: () => ({ width: container.clientWidth, height: container.clientHeight }),
    centerOn({ x, y }) {
      const view = graph.getView()
      const { scale, translate } = view
      const left = (x + translate.x) * scale - container.clientWidth / 2
      const top = (y + translate.y) * scale - container.clientHeight / 2
      const clamp = (value: number, max: number) => Math.max(0, Math.min(value, Math.max(0, max)))
      const scrollLeft = clamp(left, container.scrollWidth - container.clientWidth)
      const scrollTop = clamp(top, container.scrollHeight - container.clientHeight)
      container.scrollLeft = scrollLeft
      container.scrollTop = scrollTop
      // What scrolling cannot reach, panning does.
      const dx = left - container.scrollLeft
      const dy = top - container.scrollTop
      if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1) view.setTranslate(translate.x - dx / scale, translate.y - dy / scale)
      notifyView()
    },
    onPointerMove: (listener) => listen(pointerListeners, listener),
    onSelectionChange: (listener) => listen(selectionListeners, listener),
    onViewChange: (listener) => listen(viewListeners, listener),
    getViewVersion: () => viewVersion,
    undo() {
      graph.stopEditing(false)
      undoManager.undo()
    },
    redo() {
      graph.stopEditing(false)
      undoManager.redo()
    },
    zoomIn: () => graph.zoomIn(),
    zoomOut: () => graph.zoomOut(),
    zoomActual: () => graph.zoomActual(),
    getState: () => state,
    subscribe: (listener) => listen(listeners, listener),
    destroy() {
      Reflect.deleteProperty(container, EDITOR_PROPERTY)
      container.removeEventListener('pointerdown', focusCanvas, true)
      container.removeEventListener('contextmenu', preventBrowserMenu)
      container.removeEventListener('pointermove', handlePointerMove, true)
      container.removeEventListener('pointerleave', handlePointerLeave)
      container.removeEventListener('scroll', notifyView)
      graph.getSelectionModel().removeListener(handleSelectionChange)
      graph.getSelectionModel().removeListener(notify)
      model.removeListener(notifyView)
      model.removeListener(notify)
      layoutManager.destroy()
      listeners.clear()
      pointerListeners.clear()
      selectionListeners.clear()
      menuListeners.clear()
      viewListeners.clear()
      InternalEvent.removeAllListeners(container)
      keyHandler.onDestroy()
      undoManager.off('stack-item-added', notify)
      undoManager.off('stack-item-popped', notify)
      undoManager.off('stack-cleared', notify)
      if (!sharedUndoManager) undoManager.destroy()
      binding.destroy()
      graph.destroy()
    },
  }
  Object.defineProperty(container, EDITOR_PROPERTY, { value: editor, configurable: true })
  return editor
}

const COLOR_KEYS = { fill: 'fillColor', stroke: 'strokeColor', font: 'fontColor' } as const

/** Style keys of where an edge leaves its source and enters its target; reversing the edge swaps them. */
const END_STYLE_KEYS = [
  ['exitX', 'entryX'],
  ['exitY', 'entryY'],
  ['exitDx', 'entryDx'],
  ['exitDy', 'entryDy'],
  ['exitPerimeter', 'entryPerimeter'],
] as const

/** The value shared by all items, or `null` when they differ. */
function same(values: string[]): string | null {
  const distinct = new Set(values)
  return distinct.size === 1 ? values[0]! : null
}

function isTable(cell: Cell | null): boolean {
  return cell?.isVertex() === true && isTableStyle(cell.getStyle() as ShapeStyle)
}

/**
 * Stacks the fields of a table under its header in the order of the cells, across the whole width of the table,
 * and fits the table height to them.
 */
class TableLayout extends StackLayout {
  constructor(graph: Graph) {
    super(graph, false)
    this.fill = true
    this.resizeParent = true
  }

  // Fields cannot be dragged by the user, but the layout places them.
  override isVertexMovable(_cell: Cell) {
    return true
  }

  override execute(parent: Cell) {
    if (parent.getChildCount() > 0) {
      super.execute(parent)
      return
    }
    // Without fields the table is just its header.
    const geometry = parent.getGeometry()
    if (geometry && geometry.height !== TABLE_HEADER_HEIGHT) {
      const fitted = geometry.clone()
      fitted.height = TABLE_HEADER_HEIGHT
      this.graph.getDataModel().setGeometry(parent, fitted)
    }
  }
}

function configureSelection(graph: Graph) {
  const handler = graph.getPlugin<SelectionHandler>('SelectionHandler')
  if (!handler) return
  const propagate = handler.isPropagateSelectionCell.bind(handler)
  // A second click on a selected field would select its table, and Delete would then remove the whole table.
  // The table is selected by its header instead.
  handler.isPropagateSelectionCell = (cell, immediate, me) => !isTable(cell.getParent()) && propagate(cell, immediate, me)
}

/** The selection frame selects what it touches, as on the desktop of Windows; see {@link touchedByRegion}. */
function configureRegionSelection(graph: Graph) {
  const rubberBand = graph.getPlugin<RubberBandHandler>('RubberBandHandler')
  // The frame is translucent through its stylesheet; the opacity of maxGraph would fade its border as well.
  if (rubberBand) rubberBand.defaultOpacity = 100
  graph.selectRegion = (region, event) => {
    const view = graph.getView()
    const cells = graph
      .getDefaultParent()
      .getChildren()
      .filter((cell) => {
        const state = view.getState(cell)
        if (!state) return false
        if (cell.isEdge()) {
          const points = state.absolutePoints.filter((point) => point !== null)
          return touchedByRegion(region, { kind: 'edge', box: state, points })
        }
        const frame = (cell.getStyle() as ShapeStyle).pointerEvents === false
        return touchedByRegion(region, { kind: frame ? 'frame' : 'shape', box: state })
      })
    graph.selectCellsForEvent(cells, event)
    return cells
  }
}

function configureConnections(graph: Graph) {
  const handler = graph.getPlugin<ConnectionHandler>('ConnectionHandler')
  if (!handler) return
  handler.connectImage = CONNECT_ICON
  // Show the connection point whenever the pointer is over a shape, not only over its centre.
  handler.marker.hotspot = 1
  // Just outside the right border: the pointer reaches it without leaving the shape, and it does not
  // cover the resize handle in the middle of the border when the shape is selected.
  handler.getIconPosition = (icon: ImageShape, state: CellState) => {
    const bounds = icon.bounds!
    return new GraphPoint(state.x + state.width, state.getCenterY() - bounds.height / 2)
  }
}

function configureStyles(graph: Graph) {
  const stylesheet = graph.getStylesheet()
  Object.assign(stylesheet.getDefaultVertexStyle(), {
    fillColor: '#ffffff',
    strokeColor: '#1f2328',
    fontColor: '#1f2328',
    fontSize: 13,
    whiteSpace: 'wrap',
  })
  Object.assign(stylesheet.getDefaultEdgeStyle(), {
    edgeStyle: 'orthogonalEdgeStyle',
    strokeColor: '#1f2328',
    fontColor: '#1f2328',
    endArrow: 'classic',
  })
}
