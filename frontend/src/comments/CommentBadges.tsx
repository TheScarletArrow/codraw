import { useSyncExternalStore } from 'react'
import type { CommentThread } from '../api/comments.ts'
import type { DiagramEditor } from '../diagram/editor.ts'
import { openThreadsByCell } from './threads.ts'

/** The size of a badge and its gap from the corner, outside the resize handle of a selected shape. */
const BADGE_SIZE = 18
const BADGE_GAP = 4

/**
 * The number of open threads of each element of the page, in a circle over its top-right corner. Like the cursors of the
 * participants, it is a layer over the canvas, not cells of the diagram.
 */
export function CommentBadges({
  editor,
  threads,
  onOpen,
}: {
  editor: DiagramEditor | null
  threads: CommentThread[] | undefined
  /** Shows the threads of the element. */
  onOpen: (cellId: string) => void
}) {
  // Positions depend on scrolling, zoom and cell geometry: re-render whenever the view changes.
  useSyncExternalStore(editor?.onViewChange ?? noSubscription, () => editor?.getViewVersion() ?? 0)
  if (!editor || !threads) return null
  const counts = openThreadsByCell(threads, editor.pageId)
  if (counts.size === 0) return null

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {[...counts].map(([cellId, count]) => {
        const bounds = editor.cellBounds(cellId)
        if (!bounds) return null
        return (
          <button
            key={cellId}
            type="button"
            data-testid="comment-badge"
            data-cell={cellId}
            aria-label={`Комментарии к элементу: ${count}`}
            title="Комментарии"
            className="pointer-events-auto absolute flex items-center justify-center rounded-full rounded-bl-none bg-amber-400 text-xs font-semibold text-amber-950 shadow-sm hover:bg-amber-300"
            style={{
              left: bounds.x + bounds.width + BADGE_GAP,
              top: bounds.y - BADGE_GAP - BADGE_SIZE,
              minWidth: BADGE_SIZE,
              height: BADGE_SIZE,
            }}
            onClick={() => onOpen(cellId)}
          >
            {count}
          </button>
        )
      })}
    </div>
  )
}

const noSubscription = () => () => {}
