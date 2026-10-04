import { vi } from 'vitest'
import type { Box, DiagramEditor, EditorState, Point } from '../diagram/editor.ts'
import { DEFAULT_PAGE_ID } from '../diagram/model.ts'

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

export interface FakeEditorOptions {
  pageId?: string
  viewport?: { width: number; height: number }
}

/** Editor stand-in for page tests: records calls and lets tests drive its events. */
export function createFakeEditor({ pageId = DEFAULT_PAGE_ID, viewport = { width: 800, height: 600 } }: FakeEditorOptions = {}): FakeEditor {
  let state: EditorState = {
    canUndo: false,
    canRedo: false,
    scale: 1,
    tableSelected: false,
    edgeMarkers: null,
    colors: null,
    quickConnect: null,
  }
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
    pageId,
    addShape: vi.fn(() => null),
    addTableField: vi.fn(() => null),
    addConnectedShape: vi.fn(() => null),
    setEdgeMarker: vi.fn(),
    setColor: vi.fn(),
    toDiagramPoint: vi.fn((x: number, y: number) => ({ x, y })),
    toCanvasPoint: ({ x, y }) => ({ x: x - offset.x, y: y - offset.y }),
    cellBounds: (id) => {
      const box = cells.get(id)
      return box ? { ...box, x: box.x - offset.x, y: box.y - offset.y } : null
    },
    viewportSize: () => viewport,
    // Scrolls so that the point is in the middle of the viewport.
    centerOn: vi.fn(({ x, y }: Point) => {
      offset = { x: x - viewport.width / 2, y: y - viewport.height / 2 }
      changeView()
    }),
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
