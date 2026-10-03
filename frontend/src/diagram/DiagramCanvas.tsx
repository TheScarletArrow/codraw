import { useEffect, useRef, type DragEvent } from 'react'
import * as Y from 'yjs'
import { createDiagramEditor, type DiagramEditor } from './editor.ts'
import { SHAPE_DRAG_TYPE, type ShapeId } from './shapes.ts'

interface DiagramCanvasProps {
  document: Y.Doc
  /**
   * Receives the editor once the canvas is created and `null` when it is destroyed.
   * Must be stable (e.g. a state setter): a new function recreates the canvas.
   */
  onEditor: (editor: DiagramEditor | null) => void
}

/** maxGraph canvas bound to the board document. The graph is created once per document. */
export function DiagramCanvas({ document, onEditor }: DiagramCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<DiagramEditor | null>(null)

  useEffect(() => {
    const editor = createDiagramEditor(containerRef.current!, document)
    editorRef.current = editor
    onEditor(editor)
    return () => {
      onEditor(null)
      editorRef.current = null
      editor.destroy()
    }
  }, [document, onEditor])

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
