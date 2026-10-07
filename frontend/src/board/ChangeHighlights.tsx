import { useMemo, useSyncExternalStore } from 'react'
import { cn } from '@/lib/utils'
import { cellLabel } from '../comments/threads.ts'
import { groupChanges, type CellDiff, type CellSnapshot, type ChangeType, type PageDiff } from '../diagram/diff.ts'
import type { Box, DiagramEditor, Point } from '../diagram/editor.ts'
import { ChangeIcon } from './ChangeIcon.tsx'
import { absoluteBounds, edgeLine, lineMiddle } from './changes.ts'

/** Room between a shape and its frame, outside the selection handles of maxGraph. */
const PADDING = 4
const BADGE_SIZE = 18

/** Frames of shapes: solid, dotted and dashed, so that the kind of a change does not rest on its color alone. */
const FRAMES: Record<ChangeType, string> = {
  added: 'border-2 border-solid border-added',
  changed: 'border-[3px] border-dotted border-changed',
  removed: 'change-ghost border-2 border-dashed border-removed',
}

/** Lines of edges, in the same manner as the frames. */
const LINES: Record<ChangeType, { color: string; dash?: string; width: number }> = {
  added: { color: 'var(--added)', width: 2.5 },
  changed: { color: 'var(--changed)', dash: '0.5 6', width: 3.5 },
  removed: { color: 'var(--removed)', dash: '7 5', width: 2.5 },
}

/** A change as the layer draws it, in coordinates relative to the visible top-left corner of the canvas. */
interface Mark {
  id: string
  type: ChangeType
  box: Box | null
  line: Point[] | null
  /** The label of a removed shape, which the canvas no longer shows. */
  label: string
}

/**
 * The changes of the page since a version over the canvas that shows the page: added elements in green solid frames,
 * changed ones in amber dotted frames, removed ones as red dashed hatched ghosts where the version had them, each with
 * its sign. Like the cursors of the participants, it is a layer over the canvas: the document never gets it.
 */
export function ChangeHighlights({
  editor,
  page,
  selectedId,
}: {
  editor: DiagramEditor | null
  /** The changes of the page the canvas shows, `undefined` when it has none. */
  page: PageDiff | undefined
  /** The element chosen in the list of changes. */
  selectedId: string | null
}) {
  // Positions depend on scrolling, zoom and cell geometry: re-render whenever the view changes.
  useSyncExternalStore(editor?.onViewChange ?? noSubscription, () => editor?.getViewVersion() ?? 0)
  const entries = useMemo(() => (page ? groupChanges(page) : []), [page])
  if (!editor || !page || entries.length === 0) return null
  const version = page.before?.cells ?? new Map<string, CellSnapshot>()
  const marks = entries.flatMap(({ change }) => markOf(editor, change, version) ?? [])

  return (
    <div className="change-marks pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <svg className="absolute inset-0 size-full">
        {marks.map(({ id, type, line }) => {
          if (!line) return null
          const { color, dash, width } = LINES[type]
          const points = line.map(({ x, y }) => `${tenths(x)},${tenths(y)}`).join(' ')
          const selected = id === selectedId
          return (
            <g key={id} data-testid="change-mark" data-change={type} data-cell={id} data-selected={selected || undefined}>
              {/* A halo in the color of the canvas keeps the line visible over the lines and fills of the diagram. */}
              <polyline
                points={points}
                fill="none"
                className="stroke-canvas"
                strokeOpacity={0.85}
                strokeWidth={width + (selected ? 6 : 4)}
                strokeLinejoin="round"
              />
              <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth={selected ? width + 1.5 : width}
                strokeDasharray={dash}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          )
        })}
      </svg>
      {marks.map(({ id, type, box, label }) =>
        box ? (
          <div
            key={id}
            data-testid="change-mark"
            data-change={type}
            data-cell={id}
            data-selected={id === selectedId || undefined}
            className={cn(
              'absolute flex items-center justify-center overflow-hidden rounded-sm',
              FRAMES[type],
              id === selectedId && 'ring-4 ring-sky-500/40',
            )}
            style={{
              left: box.x - PADDING,
              top: box.y - PADDING,
              width: box.width + 2 * PADDING,
              height: box.height + 2 * PADDING,
            }}
          >
            {label && <span className="truncate px-1 text-xs text-removed">{label}</span>}
          </div>
        ) : null,
      )}
      {marks.map(({ id, type, box, line }) => {
        const at = box ? { x: box.x - PADDING, y: box.y - PADDING } : lineMiddle(line!)
        return (
          <ChangeIcon
            key={id}
            type={type}
            className="absolute text-canvas shadow-sm ring-2 ring-canvas"
            style={{ left: at.x - BADGE_SIZE / 2, top: at.y - BADGE_SIZE / 2, width: BADGE_SIZE, height: BADGE_SIZE }}
          />
        )
      })}
    </div>
  )
}

/**
 * Where to draw a change: an added or changed element where the canvas shows it, a removed one where the version had
 * it. `null` when the canvas does not show the element, or the version gives no place for it.
 */
function markOf(editor: DiagramEditor, change: CellDiff, version: Map<string, CellSnapshot>): Mark | null {
  const { id, type } = change
  if (type !== 'removed') {
    const line = change.after.kind === 'edge' ? editor.edgePoints(id) : null
    const box = line ? null : editor.cellBounds(id)
    return line || box ? { id, type, box, line, label: '' } : null
  }
  const bounds = absoluteBounds(version, id)
  if (bounds) {
    const start = editor.toCanvasPoint(bounds)
    const end = editor.toCanvasPoint({ x: bounds.x + bounds.width, y: bounds.y + bounds.height })
    const box = { x: start.x, y: start.y, width: end.x - start.x, height: end.y - start.y }
    return { id, type, box, line: null, label: cellLabel(change.before.value) }
  }
  const line = edgeLine(version, id)
  return line && { id, type, box: null, line: line.map((point) => editor.toCanvasPoint(point)), label: '' }
}

const tenths = (value: number) => Math.round(value * 10) / 10

const noSubscription = () => () => {}
