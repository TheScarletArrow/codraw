import { useEffect, useRef, type DragEvent } from 'react'
import * as Y from 'yjs'
import type { PageHistories } from './binding.ts'
import { createDiagramEditor, type DiagramEditor } from './editor.ts'
import { SHAPE_DRAG_TYPE, type ShapeId } from './shapes.ts'

interface DiagramCanvasProps {
  document: Y.Doc
  /** The page to show; a new canvas is created when it changes. */
  pageId: string
  /** Undo histories of the pages; they outlive the canvas of a page. */
  histories?: PageHistories | null
  /**
   * Receives the editor once the canvas is created and `null` when it is destroyed.
   * Must be stable (e.g. a state setter): a new function recreates the canvas.
   */
  onEditor: (editor: DiagramEditor | null) => void
}

/** maxGraph canvas bound to one page of the board document. The graph is created once per page. */
export function DiagramCanvas({ document, pageId, histories, onEditor }: DiagramCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<DiagramEditor | null>(null)

  useEffect(() => {
    const editor = createDiagramEditor(containerRef.current!, document, { pageId, undoManager: histories?.get(pageId) })
    editorRef.current = editor
    onEditor(editor)
    return () => {
      onEditor(null)
      editorRef.current = null
      editor.destroy()
    }
  }, [document, pageId, histories, onEditor])

  const handleDragOver = (event: DragEvent) => {
    if (event.dataTransfer.types.includes(SHAPE_DRAG_TYPE)) {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
    }
  }

  const handleDrop = (event: DragEvent) => {
    const shape = event.dataTransfer.getData(SHAPE_DRAG_TYPE) as ShapeId
    const editor = editorRef.current
    if (!shape || !editor) return
    event.preventDefault()
    editor.addShape(shape, editor.toDiagramPoint(event.clientX, event.clientY))
  }

  return (
    <div
      ref={containerRef}
      className="diagram-canvas"
      data-testid="diagram-canvas"
      tabIndex={0}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    />
  )
}
