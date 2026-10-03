import {
  Graph,
  GraphDataModel,
  InternalEvent,
  KeyHandler,
  RubberBandHandler,
  getDefaultPlugins,
  type Cell,
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
  /** Calls `listener` whenever {@link getState} may have changed; returns an unsubscribe function. */
  subscribe(listener: () => void): () => void
  destroy(): void
}

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

  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((listener) => listener())
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
      const cell = graph.insertVertex({
        parent: graph.getDefaultParent(),
        value: shape.value,
        position: [snap(center.x - shape.width / 2), snap(center.y - shape.height / 2)],
        size: [shape.width, shape.height],
        style: { ...shape.style },
      })
      graph.setSelectionCell(cell)
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
    getState: () => ({
      canUndo: undoManager.canUndo(),
      canRedo: undoManager.canRedo(),
      scale: graph.getView().scale,
    }),
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    destroy() {
      listeners.clear()
      InternalEvent.removeAllListeners(container)
      keyHandler.onDestroy()
      undoManager.destroy()
      binding.destroy()
      graph.destroy()
    },
  }
  return editor
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
