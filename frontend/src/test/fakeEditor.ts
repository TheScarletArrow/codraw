import { vi } from 'vitest'
import type { Box, DiagramEditor, EditorState, Point } from '../diagram/editor.ts'

export type FakeEditor = DiagramEditor & {
  setState(state: Partial<EditorState>): void
  /** Simulates the local pointer over the canvas (diagram coordinates) or leaving it (`null`). */
  movePointer(point: Point | null): void
  select(ids: string[]): void
  /** Sets where a cell is shown; `cellBounds` returns it. */
  placeCell(id: string, bounds: Box | null): void
  /** Simulates scrolling: canvas points are diagram points shifted by this offset. */
  scrollTo(offset: Point): void
}

/** Editor stand-in for page tests: records calls and lets tests drive its events. */
export function createFakeEditor(): FakeEditor {
  let state: EditorState = { canUndo: false, canRedo: false, scale: 1, tableSelected: false, edgeMarkers: null }
  let offset: Point = { x: 0, y: 0 }
  let viewVersion = 0
  const cells = new Map<string, Box | null>()
  const listeners = new Set<() => void>()
  const pointerListeners = new Set<(point: Point | null) => void>()
  const selectionListeners = new Set<(ids: string[]) => void>()
  const viewListeners = new Set<() => void>()
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
    addShape: vi.fn(() => null),
    addTableField: vi.fn(() => null),
    setEdgeMarker: vi.fn(),
    toDiagramPoint: vi.fn((x: number, y: number) => ({ x, y })),
    toCanvasPoint: ({ x, y }) => ({ x: x - offset.x, y: y - offset.y }),
    cellBounds: (id) => {
      const box = cells.get(id)
      return box ? { ...box, x: box.x - offset.x, y: box.y - offset.y } : null
    },
    onPointerMove: (listener) => listen(pointerListeners, listener),
    onSelectionChange: (listener) => listen(selectionListeners, listener),
    onViewChange: (listener) => listen(viewListeners, listener),
    getViewVersion: () => viewVersion,
    undo: vi.fn(),
    redo: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    zoomActual: vi.fn(),
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
    placeCell(id, bounds) {
      cells.set(id, bounds)
      changeView()
    },
    scrollTo(next) {
      offset = next
      changeView()
    },
  }
}
