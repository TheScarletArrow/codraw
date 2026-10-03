import { vi } from 'vitest'
import type { DiagramEditor, EditorState } from '../diagram/editor.ts'

export type FakeEditor = DiagramEditor & { setState(state: Partial<EditorState>): void }

/** Editor stand-in for page tests: records calls and lets tests change the reported state. */
export function createFakeEditor(): FakeEditor {
  let state: EditorState = { canUndo: false, canRedo: false, scale: 1 }
  const listeners = new Set<() => void>()
  return {
    graph: undefined as never,
    addShape: vi.fn(() => null),
    toDiagramPoint: vi.fn((x: number, y: number) => ({ x, y })),
    undo: vi.fn(),
    redo: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    zoomActual: vi.fn(),
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    destroy: vi.fn(),
    setState(changes) {
      state = { ...state, ...changes }
      listeners.forEach((listener) => listener())
    },
  }
}
