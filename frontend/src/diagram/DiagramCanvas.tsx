import { useEffect, useRef, type DragEvent } from 'react'
import * as Y from 'yjs'
import { currentTheme, useTheme } from '../theme/theme.ts'
import type { PageHistories } from './binding.ts'
import { createDiagramEditor, type DiagramEditor } from './editor.ts'
import { filesOf, type ImageHost } from './images.ts'
import { SHAPE_DRAG_TYPE, type ShapeId } from './shapes.ts'
import { ELEMENT_DRAG_TYPE, readElementDrag } from './sharedElements.ts'

interface DiagramCanvasProps {
  document: Y.Doc
  /** The page to show; a new canvas is created when it changes. */
  pageId: string
  /** Undo histories of the pages; they outlive the canvas of a page. */
  histories?: PageHistories | null
  /** The participant may only view the board; a new canvas is created when it changes. */
  readOnly?: boolean
  /** The name of the participant, which the elements they lock keep; a new canvas is created when it changes. */
  participantName?: string
  /**
   * The id of the participant, which the elements they change keep with the name as who changed them last; a new canvas
   * is created when it changes.
   */
  participantId?: string
  /**
   * The page works on a board with others: `K` and `C` turn on the laser pointer and the comment tool. A new canvas is
   * created when it changes.
   */
  collaboration?: boolean
  /**
   * Where the images that the participant adds are stored; without it they cannot add images. Must be stable: a new
   * host creates a new canvas.
   */
  images?: ImageHost | null
  /**
   * Receives the editor once the canvas is created and `null` when it is destroyed.
   * Must be stable (e.g. a state setter): a new function recreates the canvas.
   */
  onEditor: (editor: DiagramEditor | null) => void
}

/**
 * maxGraph canvas bound to one page of the board document. The graph is created once per page; it follows the theme of
 * the app without being created again.
 */
export function DiagramCanvas({
  document,
  pageId,
  histories,
  readOnly = false,
  participantName,
  participantId,
  collaboration = true,
  images = null,
  onEditor,
}: DiagramCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<DiagramEditor | null>(null)
  const theme = useTheme()

  useEffect(() => {
    const editor = createDiagramEditor(containerRef.current!, document, {
      pageId,
      undoManager: histories?.get(pageId),
      readOnly,
      participantName,
      participantId,
      collaboration,
      images,
      // The theme of the moment: a change of the theme does not create the canvas again.
      theme: currentTheme(),
    })
    editorRef.current = editor
    onEditor(editor)
    return () => {
      onEditor(null)
      editorRef.current = null
      editor.destroy()
    }
  }, [document, pageId, histories, readOnly, participantName, participantId, collaboration, images, onEditor])

  useEffect(() => {
    editorRef.current?.setTheme(theme)
  }, [theme])

  const handleDragOver = (event: DragEvent) => {
    const types = event.dataTransfer.types
    const files = types.includes('Files')
    if (!files && !types.includes(SHAPE_DRAG_TYPE) && !types.includes(ELEMENT_DRAG_TYPE)) return
    // Files are never dropped on the browser, which would open them instead of the board; only images go on the canvas.
    event.preventDefault()
    event.dataTransfer.dropEffect = readOnly || (files && !images) ? 'none' : 'copy'
  }

  const handleDrop = (event: DragEvent) => {
    const editor = editorRef.current
    const shape = event.dataTransfer.getData(SHAPE_DRAG_TYPE) as ShapeId
    // An element of the panel «Элементы доски»: another cell of it.
    const element = readElementDrag(event.dataTransfer.getData(ELEMENT_DRAG_TYPE))
    const files = filesOf(event.dataTransfer)
    if (!shape && !element && files.length === 0) return
    event.preventDefault()
    if (!editor || readOnly) return
    const point = editor.toDiagramPoint(event.clientX, event.clientY)
    if (shape) editor.addShape(shape, point)
    else if (element) editor.placeElement(element, point)
    else void editor.addImages(files, point)
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
