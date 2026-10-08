import { useCallback, useEffect, useRef } from 'react'
import type { DiagramEditor } from '../diagram/editor.ts'

/**
 * Going to a cell of a page: selects it in the middle of the canvas at once on the page of `editor`, or once the canvas
 * of its page is made after `selectPage`.
 */
export function useRevealCell(editor: DiagramEditor | null, selectPage: (pageId: string) => void) {
  const pending = useRef<{ pageId: string; cellId: string } | null>(null)
  useEffect(() => {
    const target = pending.current
    if (!editor || !target || editor.pageId !== target.pageId) return
    pending.current = null
    editor.revealCell(target.cellId)
  }, [editor])
  return useCallback(
    (pageId: string, cellId: string) => {
      if (editor && editor.pageId === pageId) {
        pending.current = null
        editor.revealCell(cellId)
        return
      }
      pending.current = { pageId, cellId }
      selectPage(pageId)
    },
    [editor, selectPage],
  )
}
