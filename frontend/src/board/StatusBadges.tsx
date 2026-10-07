import { useMemo, useSyncExternalStore } from 'react'
import * as Y from 'yjs'
import type { DiagramEditor } from '../diagram/editor.ts'
import { getCells, type CellsMap } from '../diagram/model.ts'
import { readStatus, STATUS_KEYS, statusLabel, type StatusMark } from '../diagram/status.ts'
import { StatusIcon } from '../diagram/StatusIcon.tsx'
import { canHaveStatus } from './statusList.ts'

/** The size of a badge and its gap from the corner, outside the resize handle of a selected shape. */
const BADGE_SIZE = 18
const BADGE_GAP = 4

/**
 * The status of each element of the page that has one, as a sign of its color by the bottom-left corner of the element,
 * with the status, who set it and when in its tooltip. Like the badges of locks and comments, it is a layer over the
 * canvas, not cells of the diagram, so images of the page do not show it. The statuses are read from `document`, the
 * board or the state of it that the canvas shows.
 */
export function StatusBadges({ editor, document }: { editor: DiagramEditor | null; document: Y.Doc | null }) {
  // Positions depend on scrolling, zoom and cell geometry: re-render whenever the view changes.
  useSyncExternalStore(editor?.onViewChange ?? noSubscription, () => editor?.getViewVersion() ?? 0)
  const marks = usePageStatuses(document, editor?.pageId ?? null)
  if (!editor || marks.size === 0) return null

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {[...marks].map(([cellId, mark]) => {
        const bounds = editor.cellBounds(cellId)
        if (!bounds) return null
        const label = statusLabel(mark)
        return (
          <span
            key={cellId}
            role="img"
            data-testid="status-badge"
            data-cell={cellId}
            data-status={mark.status}
            aria-label={label}
            title={label}
            className="pointer-events-auto absolute rounded-full shadow-sm"
            style={{
              left: bounds.x - BADGE_GAP - BADGE_SIZE,
              top: bounds.y + bounds.height + BADGE_GAP,
            }}
          >
            <StatusIcon status={mark.status} className="size-[18px]" />
          </span>
        )
      })}
    </div>
  )
}

const NO_STATUSES: ReadonlyMap<string, StatusMark> = new Map()

const noSubscription = () => () => {}

/** The statuses of the elements of a page by their ids, read again when a status or the cells of the page change. */
function usePageStatuses(document: Y.Doc | null, pageId: string | null): ReadonlyMap<string, StatusMark> {
  const store = useMemo(() => (document && pageId ? pageStatuses(getCells(document, pageId)) : null), [document, pageId])
  return useSyncExternalStore(store?.subscribe ?? noSubscription, () => store?.get() ?? NO_STATUSES)
}

/** A store of the statuses of the cells of a page for `useSyncExternalStore`: the same map until they change. */
function pageStatuses(cells: CellsMap) {
  // `null` until read, and again after a change.
  let snapshot: ReadonlyMap<string, StatusMark> | null = null
  return {
    get: () => (snapshot ??= readPageStatuses(cells)),
    subscribe(onChange: () => void) {
      const handle = (events: Y.YEvent<Y.AbstractType<unknown>>[]) => {
        if (!events.some((event) => changesStatuses(event, cells))) return
        snapshot = null
        onChange()
      }
      cells.observeDeep(handle)
      // The cells may have changed before the subscription.
      snapshot = null
      return () => cells.unobserveDeep(handle)
    },
  }
}

/** Keys of a cell that decide whether it may have a status. */
const PLACE_KEYS = ['kind', 'parent']

/** Whether a change of the cells of a page may change their statuses: cells came or went, or a status changed. */
function changesStatuses(event: Y.YEvent<Y.AbstractType<unknown>>, cells: CellsMap): boolean {
  if (event.target === cells) return true
  return (
    event instanceof Y.YMapEvent &&
    event.target.parent === cells &&
    [...STATUS_KEYS, ...PLACE_KEYS].some((key) => event.keysChanged.has(key))
  )
}

function readPageStatuses(cells: CellsMap): ReadonlyMap<string, StatusMark> {
  const marks = new Map<string, StatusMark>()
  cells.forEach((cell, id) => {
    const mark = cell instanceof Y.Map ? readStatus(cell) : null
    if (mark && canHaveStatus(cells, id)) marks.set(id, mark)
  })
  return marks.size > 0 ? marks : NO_STATUSES
}
