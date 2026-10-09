import { ScrollText } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import type { Decision } from '../api/decisions.ts'
import type { DiagramEditor } from '../diagram/editor.ts'
import { decisionsByCell } from './decisions.ts'

/** The height of a badge and its gap from the corner, outside the resize handle of a selected shape. */
const BADGE_SIZE = 18
const BADGE_GAP = 4

/**
 * The number of decisions about each element of the page, by its bottom-right corner, where the badges of comments,
 * statuses, locks and shared elements leave room. Like them, it is a layer over the canvas, not cells of the diagram.
 */
export function DecisionBadges({
  editor,
  decisions,
  onOpen,
}: {
  editor: DiagramEditor | null
  decisions: Decision[] | undefined
  /** Shows the decisions about the element. */
  onOpen: (cellId: string) => void
}) {
  // Positions depend on scrolling, zoom and cell geometry: re-render whenever the view changes.
  useSyncExternalStore(editor?.onViewChange ?? noSubscription, () => editor?.getViewVersion() ?? 0)
  if (!editor || !decisions) return null
  const counts = decisionsByCell(decisions, editor.pageId)
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
            data-testid="decision-badge"
            data-cell={cellId}
            aria-label={`Решения элемента: ${count}`}
            title={`Решения (${count})`}
            className="pointer-events-auto absolute flex items-center gap-0.5 rounded-full bg-sky-600 px-1 text-xs font-semibold text-white shadow-sm hover:bg-sky-500"
            style={{
              left: bounds.x + bounds.width + BADGE_GAP,
              top: bounds.y + bounds.height + BADGE_GAP,
              height: BADGE_SIZE,
            }}
            onClick={() => onOpen(cellId)}
          >
            <ScrollText aria-hidden className="size-3" />
            {count}
          </button>
        )
      })}
    </div>
  )
}

const noSubscription = () => () => {}
