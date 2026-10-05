import { useSyncExternalStore } from 'react'
import type { DiagramEditor } from './editor.ts'
import { FieldProps } from './TableTools.tsx'
import { useEditorState } from './useEditorState.ts'

/** Room between the table and the panel. */
const GAP = 12
/** Width the panel needs, to tell whether it fits to the right of the table. */
export const FIELD_POPOVER_WIDTH = 400

/**
 * The type, nullability and keys of the selected field in a panel next to its table, at the height of the field: to the
 * right of the table, or to the left when the visible part of the canvas has no room there.
 */
export function FieldPopover({ editor }: { editor: DiagramEditor | null }) {
  const { field, tableVendor } = useEditorState(editor)
  // Positions depend on scrolling, zoom and cell geometry: re-render whenever the view changes.
  useSyncExternalStore(editor?.onViewChange ?? noSubscription, () => editor?.getViewVersion() ?? 0)

  const fieldBounds = editor && field ? editor.cellBounds(field.cellId) : null
  const tableBounds = editor && field ? editor.cellBounds(field.tableId) : null
  if (!editor || !field || !fieldBounds || !tableBounds) return null
  const right = tableBounds.x + tableBounds.width + GAP
  const fitsRight = right + FIELD_POPOVER_WIDTH <= editor.viewportSize().width
  const top = fieldBounds.y + fieldBounds.height / 2

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        role="group"
        aria-label="Свойства поля"
        data-side={fitsRight ? 'right' : 'left'}
        className="pointer-events-auto absolute flex items-center gap-1 rounded-md border bg-background p-1 text-foreground shadow-md"
        style={
          fitsRight
            ? { left: right, top, transform: 'translateY(-50%)' }
            : { left: tableBounds.x - GAP, top, transform: 'translate(-100%, -50%)' }
        }
      >
        <FieldProps editor={editor} vendor={tableVendor} field={field} />
      </div>
    </div>
  )
}

const noSubscription = () => () => {}
