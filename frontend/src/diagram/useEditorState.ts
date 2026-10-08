import { useCallback, useSyncExternalStore } from 'react'
import type { DiagramEditor, EditorState } from './editor.ts'
import { DEFAULT_PENCIL_LINE } from './freehand.ts'

const NO_EDITOR: EditorState = {
  canUndo: false,
  canRedo: false,
  scale: 1,
  tableSelected: false,
  tableVendor: null,
  field: null,
  index: null,
  tableBase: null,
  tableView: null,
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

/** Current undo/redo availability, zoom and selection of the editor; re-renders when they change. */
export function useEditorState(editor: DiagramEditor | null): EditorState {
  const subscribe = useCallback((listener: () => void) => editor?.subscribe(listener) ?? (() => {}), [editor])
  return useSyncExternalStore(subscribe, () => editor?.getState() ?? NO_EDITOR)
}
