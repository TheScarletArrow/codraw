import { useEffect, useRef } from 'react'
import type { DiagramEditor } from '../diagram/editor.ts'
import { registerUnsavedWork } from './reload.ts'

/**
 * Tells a reload by the banner of a new version what the editor of an open page may lose: the label being edited, which
 * a reload applies first, and edits that are neither on the server nor in the local copy of the browser.
 */
export function useReloadGuard(editor: Pick<DiagramEditor, 'getEditing' | 'graph'> | null, unsaved: boolean) {
  const unsavedRef = useRef(unsaved)
  useEffect(() => {
    unsavedRef.current = unsaved
  }, [unsaved])
  useEffect(
    () =>
      registerUnsavedWork({
        flush: () => {
          if (editor?.getEditing()) editor.graph.stopEditing(false)
        },
        unsaved: () => unsavedRef.current,
      }),
    [editor],
  )
}
