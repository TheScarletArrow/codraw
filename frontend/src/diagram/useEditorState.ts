import { useCallback, useSyncExternalStore } from 'react'
import type { DiagramEditor, EditorState } from './editor.ts'

const NO_EDITOR: EditorState = {
  canUndo: false,
  canRedo: false,
  scale: 1,
  tableSelected: false,
  edgeMarkers: null,
  colors: null,
  text: null,
  geometry: null,
  quickConnect: null,
  canPaste: false,
  hasCells: false,
  hasSelection: false,
}

/** Current undo/redo availability, zoom and selection of the editor; re-renders when they change. */
export function useEditorState(editor: DiagramEditor | null): EditorState {
  const subscribe = useCallback((listener: () => void) => editor?.subscribe(listener) ?? (() => {}), [editor])
  return useSyncExternalStore(subscribe, () => editor?.getState() ?? NO_EDITOR)
}
