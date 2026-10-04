import { Plus, Redo2, Undo2, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DiagramEditor, EdgeEnd } from './editor.ts'
import { EDGE_MARKERS } from './extensions.ts'
import { useEditorState } from './useEditorState.ts'

export function EditorToolbar({ editor }: { editor: DiagramEditor | null }) {
  const { canUndo, canRedo, scale, tableSelected, edgeMarkers } = useEditorState(editor)

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
      {tableSelected && (
        <>
          <span aria-hidden className="mx-1 h-5 w-px bg-border" />
          <Button type="button" variant="ghost" size="sm" onClick={() => editor?.addTableField()}>
            <Plus />
            Добавить поле
          </Button>
        </>
      )}
      {edgeMarkers && (
        <>
          <span aria-hidden className="mx-1 h-5 w-px bg-border" />
          <MarkerSelect label="Начало" end="start" value={edgeMarkers.start} editor={editor} />
          <MarkerSelect label="Конец" end="end" value={edgeMarkers.end} editor={editor} />
        </>
      )}
    </div>
  )
}

/** Marker of one end of the selected edges; empty when they have different markers. */
function MarkerSelect({
  label,
  end,
  value,
  editor,
}: {
  label: string
  end: EdgeEnd
  value: string | null
  editor: DiagramEditor | null
}) {
  return (
    <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
      {label}
      <select
        aria-label={`${label} связи`}
        className="h-8 rounded-md border bg-background px-2 text-foreground"
        value={value ?? ''}
        onChange={(event) => editor?.setEdgeMarker(end, event.target.value)}
      >
        {value === null && <option value="">—</option>}
        {EDGE_MARKERS.map((marker) => (
          <option key={marker.value} value={marker.value}>
            {marker.label}
          </option>
        ))}
      </select>
    </label>
  )
}
