import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { DiagramEditor } from '../diagram/editor.ts'
import { SHAPE_DRAG_TYPE } from '../diagram/shapes.ts'
import { useEditorState } from '../diagram/useEditorState.ts'
import { TemplateCards } from './TemplateCards.tsx'

interface EmptyBoardTemplatesProps {
  editor: DiagramEditor | null
  /** The board has one page: a board with more pages is not empty, even if this page is. */
  onlyPage: boolean
}

/**
 * Templates over the canvas of an empty board for a participant who may edit it: a template goes onto the page as one
 * undo step. Only the card takes the pointer, so the canvas around it works as usual.
 */
export function EmptyBoardTemplates({ editor, onlyPage }: EmptyBoardTemplatesProps) {
  const { hasCells } = useEditorState(editor)
  const [closed, setClosed] = useState(false)
  // A shape dragged from the palette goes through the card onto the canvas under it.
  const [dragging, setDragging] = useState(false)
  useEffect(() => {
    // Drags of other things, e.g. of text, may come without the types of their data.
    const start = (event: DragEvent) => setDragging(event.dataTransfer?.types?.includes(SHAPE_DRAG_TYPE) ?? false)
    const end = () => setDragging(false)
    document.addEventListener('dragstart', start)
    document.addEventListener('dragend', end)
    document.addEventListener('drop', end)
    return () => {
      document.removeEventListener('dragstart', start)
      document.removeEventListener('dragend', end)
      document.removeEventListener('drop', end)
    }
  }, [])
  if (!editor || editor.readOnly || !onlyPage || hasCells || closed) return null

  return (
    // At the bottom: the middle of the canvas stays free for shapes, cursors and the selection frame.
    <div className="pointer-events-none absolute inset-0 flex items-end justify-center p-6">
      <section
        aria-label="Начните с шаблона"
        className={cn(
          'w-full max-w-2xl rounded-lg border bg-background p-3 shadow-md transition-opacity',
          dragging ? 'pointer-events-none opacity-40' : 'pointer-events-auto',
        )}
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold">Начните с шаблона</h2>
            <p className="text-sm text-muted-foreground">или перетащите фигуры из панели слева</p>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Закрыть" onClick={() => setClosed(true)}>
            <X />
          </Button>
        </div>
        <TemplateCards compact onChoose={(template) => editor.insertCells(template.build())} />
      </section>
    </div>
  )
}
