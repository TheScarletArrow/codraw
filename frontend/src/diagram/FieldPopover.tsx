import { Lock } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import type { DiagramEditor } from './editor.ts'
import { lockLabel } from './locks.ts'
import { FieldProps, IndexProps } from './TableTools.tsx'
import { useEditorState } from './useEditorState.ts'

/** Room between the table and the panel. */
const GAP = 12
/** Width the panel needs, to tell whether it fits to the right of the table. */
export const FIELD_POPOVER_WIDTH = 400

/**
 * The type, nullability and keys of the selected field, or the columns of the selected index, in a panel next to its
 * table, at the height of the row: to the right of the table, or to the left when the visible part of the canvas has no
 * room there. In a locked table they are disabled, and a lock says who locked it.
 */
export function FieldPopover({ editor }: { editor: DiagramEditor | null }) {
  const { field, index, tableVendor, lock } = useEditorState(editor)
  // Positions depend on scrolling, zoom and cell geometry: re-render whenever the view changes.
  useSyncExternalStore(editor?.onViewChange ?? noSubscription, () => editor?.getViewVersion() ?? 0)

  // An inherited field is edited in its base table.
  const row = field?.inheritedFrom === null ? field : index
  const fieldBounds = editor && row ? editor.cellBounds(row.cellId) : null
  const tableBounds = editor && row ? editor.cellBounds(row.tableId) : null
  if (!editor || !row || !fieldBounds || !tableBounds) return null
  // The table is locked: the properties of the row are shown, but not changed.
  const locked = lock?.all ? lockLabel(lock.locks.map((holder) => holder.lockedBy)) : null
  const right = tableBounds.x + tableBounds.width + GAP
  const fitsRight = right + FIELD_POPOVER_WIDTH <= editor.viewportSize().width
  const top = fieldBounds.y + fieldBounds.height / 2

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        role="group"
        aria-label={index ? 'Свойства индекса' : 'Свойства поля'}
        data-side={fitsRight ? 'right' : 'left'}
        className="pointer-events-auto absolute flex items-center gap-1 rounded-md border bg-background p-1 text-foreground shadow-md"
        style={
          fitsRight
            ? { left: right, top, transform: 'translateY(-50%)' }
            : { left: tableBounds.x - GAP, top, transform: 'translate(-100%, -50%)' }
        }
      >
        {locked && (
          <span role="img" aria-label={locked} title={locked} className="px-1.5 text-muted-foreground">
            <Lock aria-hidden className="size-4" />
          </span>
        )}
        <fieldset disabled={locked !== null} className="flex items-center gap-1">
          {index ? (
            <IndexProps editor={editor} index={index} />
          ) : (
            <FieldProps editor={editor} vendor={tableVendor} field={field!} />
          )}
        </fieldset>
      </div>
    </div>
  )
}

const noSubscription = () => () => {}
