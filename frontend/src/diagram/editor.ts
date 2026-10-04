import {
  Cell,
  CellEditorHandler,
  ConnectionHandler,
  Geometry,
  Graph,
  GraphDataModel,
  ImageBox,
  InternalEvent,
  KeyHandler,
  LayoutManager,
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
import { registerDiagramExtensions } from './extensions.ts'
import { getCells } from './model.ts'
import {
  findShape,
  isTableStyle,
  TABLE_FIELD_HEIGHT,
  TABLE_FIELD_STYLE,
  TABLE_HEADER_HEIGHT,
  type ShapeId,
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

export interface EditorState {
  canUndo: boolean
  canRedo: boolean
  scale: number
  /** A table or a field of a table is selected, so a field can be added. */
  tableSelected: boolean
  /** Markers of the selected edges, or `null` when no edge is selected. */
  edgeMarkers: EdgeMarkers | null
}

/** Editor of one board page: a maxGraph canvas bound to the Yjs document. */
export interface DiagramEditor {
  readonly graph: Graph
  /** Adds a palette shape centred at `center` (diagram coordinates) or in the middle of the visible area. */
  addShape(shape: ShapeId, center?: Point): Cell | null
  /** Adds a field under the selected field (or at the end of the selected table) and starts editing it. */
  addTableField(): Cell | null
  /** Sets the marker of the start or the end of the selected edges. */
  setEdgeMarker(end: EdgeEnd, marker: string): void
  /** Converts a client (viewport) position to diagram coordinates. */
  toDiagramPoint(clientX: number, clientY: number): Point
  /** Converts diagram coordinates to a position relative to the visible top-left corner of the canvas. */
  toCanvasPoint(point: Point): Point
  /** Bounds of a cell relative to the visible top-left corner of the canvas, or `null` if it is not shown. */
  cellBounds(id: string): Box | null
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
const KEY_Y = 89
const KEY_Z = 90

export function createDiagramEditor(container: HTMLElement, document: Y.Doc): DiagramEditor {
  const model = new GraphDataModel()
  const cells = getCells(document)
  const undoManager = createUndoManager(cells)

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
  const markerOf = (edge: Cell, end: EdgeEnd) =>
    String(graph.getCellStyle(edge)[end === 'start' ? 'startArrow' : 'endArrow'] ?? 'none')
  const sameMarker = (edges: Cell[], end: EdgeEnd) => {
    const markers = new Set(edges.map((edge) => markerOf(edge, end)))
    return markers.size === 1 ? [...markers][0]! : null
  }

  const readState = (): EditorState => {
    const edges = selectedEdges()
    return {
      canUndo: undoManager.canUndo(),
      canRedo: undoManager.canRedo(),
      scale: graph.getView().scale,
      tableSelected: selectedTable() !== null,
      edgeMarkers: edges.length > 0 ? { start: sameMarker(edges, 'start'), end: sameMarker(edges, 'end') } : null,
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
  keyHandler.bindKey(KEY_DELETE, removeSelection)
  keyHandler.bindKey(KEY_BACKSPACE, removeSelection)
  keyHandler.bindControlKey(KEY_Z, () => editor.undo())
  keyHandler.bindControlShiftKey(KEY_Z, () => editor.redo())
  keyHandler.bindControlKey(KEY_Y, () => editor.redo())

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
  container.addEventListener('pointermove', handlePointerMove)
  container.addEventListener('pointerleave', handlePointerLeave)

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

  const editor: DiagramEditor = {
    graph,
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
        cell = graph.insertVertex({
          parent,
          value: shape.value,
          position: [x, y],
          size: [shape.width, shape.height],
          style: { ...shape.style } as CellStyle,
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
    setEdgeMarker(end, marker) {
      const edges = selectedEdges()
      if (edges.length === 0) return
      graph.stopEditing(false)
      graph.setCellStyles(end === 'start' ? 'startArrow' : 'endArrow', marker as StyleArrowValue, edges)
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
      container.removeEventListener('pointermove', handlePointerMove)
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
      viewListeners.clear()
      InternalEvent.removeAllListeners(container)
      keyHandler.onDestroy()
      undoManager.destroy()
      binding.destroy()
      graph.destroy()
    },
  }
  Object.defineProperty(container, EDITOR_PROPERTY, { value: editor, configurable: true })
  return editor
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
