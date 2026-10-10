import { CircleCheck, CircleDot } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { cn } from '@/lib/utils'
import type { IssueLink } from '../api/issues.ts'
import type { DiagramEditor } from '../diagram/editor.ts'
import { linksByCell } from './issues.ts'
import { issueMessages as m } from './messages.ts'

/** The height of a badge and its gap from the element, as of the other badges. */
const BADGE_SIZE = 18
const BADGE_GAP = 4

/**
 * The issues linked to each element of the page, under its bottom-left corner, beside the status, where the badges of
 * comments, decisions, links, locks and shared elements leave room: green while any of them is open, violet once all
 * are closed. Like them, it is a layer over the canvas, not cells of the diagram.
 */
export function IssueBadges({
  editor,
  links,
  onOpen,
}: {
  editor: DiagramEditor | null
  links: readonly IssueLink[] | undefined
  /** Shows the issues of the element. */
  onOpen: (cellId: string) => void
}) {
  // Positions depend on scrolling, zoom and cell geometry: re-render whenever the view changes.
  useSyncExternalStore(editor?.onViewChange ?? noSubscription, () => editor?.getViewVersion() ?? 0)
  if (!editor || !links) return null
  const byCell = linksByCell(links, editor.pageId)
  if (byCell.size === 0) return null

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {[...byCell].map(([cellId, cellLinks]) => {
        const bounds = editor.cellBounds(cellId)
        if (!bounds) return null
        const open = cellLinks.filter((link) => link.state === 'open').length
        const Icon = open > 0 ? CircleDot : CircleCheck
        const label = m.badge(cellLinks.length, open)
        return (
          <button
            key={cellId}
            type="button"
            data-testid="issue-badge"
            data-cell={cellId}
            aria-label={label}
            title={label}
            className={cn(
              'pointer-events-auto absolute flex items-center gap-0.5 rounded-full px-1 text-xs font-semibold text-white shadow-sm',
              open > 0 ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-violet-600 hover:bg-violet-500',
            )}
            style={{ left: bounds.x, top: bounds.y + bounds.height + BADGE_GAP, height: BADGE_SIZE }}
            onClick={() => onOpen(cellId)}
          >
            <Icon aria-hidden className="size-3" />
            {cellLinks.length}
          </button>
        )
      })}
    </div>
  )
}

const noSubscription = () => () => {}
