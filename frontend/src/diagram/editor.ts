import {
  CellEditorHandler,
  ConnectionHandler,
  Graph,
  GraphDataModel,
  ImageBox,
  InternalEvent,
  KeyHandler,
  Point as GraphPoint,
  RubberBandHandler,
  getDefaultPlugins,
  type Cell,
  type CellState,
  type ImageShape,
} from '@maxgraph/core'
import * as Y from 'yjs'
import { createUndoManager, DiagramBinding } from './binding.ts'
import { getCells } from './model.ts'
import { findShape, type ShapeId } from './shapes.ts'

export interface Point {
  x: number
  y: number
}

export interface EditorState {
  canUndo: boolean
  canRedo: boolean
  scale: number
}

/** Editor of one board page: a maxGraph canvas bound to the Yjs document. */
export interface DiagramEditor {
  readonly graph: Graph
  /** Adds a palette shape centred at `center` (diagram coordinates) or in the middle of the visible area. */
  addShape(shape: ShapeId, center?: Point): Cell | null
  /** Converts a client (viewport) position to diagram coordinates. */
  toDiagramPoint(clientX: number, clientY: number): Point
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
  const binding = new DiagramBinding(model, cells)
  const undoManager = createUndoManager(cells)

  const graph = new Graph(container, model, [...getDefaultPlugins(), RubberBandHandler])
  graph.setPanning(true)
  graph.setConnectable(true)
  graph.setAllowDanglingEdges(false)
  graph.setDropEnabled(false)
  graph.setGridEnabled(true)
  graph.setGridSize(10)
  // Labels are plain text: rendering HTML from other participants would allow script injection.
  graph.setHtmlLabels(false)
  configureStyles(graph)
  configureConnections(graph)
  const cellEditor = graph.getPlugin<CellEditorHandler>('CellEditorHandler')
  // Commit a label when its editor loses focus, e.g. when the user clicks the palette or the toolbar.
  if (cellEditor) cellEditor.blurEnabled = true

  const readState = (): EditorState => ({
    canUndo: undoManager.canUndo(),
    canRedo: undoManager.canRedo(),
    scale: graph.getView().scale,
  })
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
      const cell = graph.insertVertex({
        parent,
        value: shape.value,
        position: [x, y],
        size: [shape.width, shape.height],
        style: { ...shape.style },
      })
      graph.setSelectionCell(cell)
      container.focus({ preventScroll: true })
      return cell
    },
    toDiagramPoint,
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
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    destroy() {
      Reflect.deleteProperty(container, EDITOR_PROPERTY)
      container.removeEventListener('pointerdown', focusCanvas, true)
      listeners.clear()
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
