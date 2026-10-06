import { Lock } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import type { DiagramEditor } from './editor.ts'
import { lockLabel } from './locks.ts'
import { useEditorState } from './useEditorState.ts'

/** The size of a badge and its gap from the corner, outside the resize handle of a selected shape. */
const BADGE_SIZE = 18
const BADGE_GAP = 4

/**
 * A lock over the top-left corner of each locked element that holds the selection, with who locked it. Only the
 * selection shows its locks: locks on every locked element would crowd the diagram. Like the comment badges, it is a
 * layer over the canvas, not cells of the diagram.
 */
export function LockBadges({ editor }: { editor: DiagramEditor | null }) {
  const { lock } = useEditorState(editor)
  // Positions depend on scrolling, zoom and cell geometry: re-render whenever the view changes.
  useSyncExternalStore(editor?.onViewChange ?? noSubscription, () => editor?.getViewVersion() ?? 0)
  if (!editor || !lock || lock.locks.length === 0) return null

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {lock.locks.map(({ cellId, lockedBy }) => {
        const bounds = editor.cellBounds(cellId)
        if (!bounds) return null
        const label = lockLabel([lockedBy])
        return (
          <span
            key={cellId}
            role="img"
            data-testid="lock-badge"
            data-cell={cellId}
            aria-label={label}
            title={label}
            className="pointer-events-auto absolute flex items-center justify-center rounded-full bg-slate-700 text-white shadow-sm"
            style={{
              left: bounds.x - BADGE_GAP - BADGE_SIZE,
              top: bounds.y - BADGE_GAP - BADGE_SIZE,
              width: BADGE_SIZE,
              height: BADGE_SIZE,
            }}
          >
            <Lock aria-hidden className="size-3" />
          </span>
        )
      })}
    </div>
  )
}

const noSubscription = () => () => {}
