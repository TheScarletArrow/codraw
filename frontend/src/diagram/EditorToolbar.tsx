import { Redo2, Undo2, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DiagramEditor } from './editor.ts'
import { useEditorState } from './useEditorState.ts'

export function EditorToolbar({ editor }: { editor: DiagramEditor | null }) {
  const { canUndo, canRedo, scale } = useEditorState(editor)

  return (
    <div role="toolbar" aria-label="Инструменты" className="flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Отменить"
        title="Отменить (Ctrl+Z)"
        disabled={!editor || !canUndo}
        onClick={() => editor?.undo()}
      >
        <Undo2 />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Повторить"
        title="Повторить (Ctrl+Shift+Z)"
        disabled={!editor || !canRedo}
        onClick={() => editor?.redo()}
      >
        <Redo2 />
      </Button>
      <span aria-hidden className="mx-1 h-5 w-px bg-border" />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Уменьшить"
        title="Уменьшить (Ctrl+колесо)"
        disabled={!editor}
        onClick={() => editor?.zoomOut()}
      >
        <ZoomOut />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-16 tabular-nums"
        aria-label="Масштаб"
        title="Сбросить масштаб до 100%"
        disabled={!editor}
        onClick={() => editor?.zoomActual()}
      >
        {Math.round(scale * 100)}%
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Увеличить"
        title="Увеличить (Ctrl+колесо)"
        disabled={!editor}
        onClick={() => editor?.zoomIn()}
      >
        <ZoomIn />
      </Button>
    </div>
  )
}
