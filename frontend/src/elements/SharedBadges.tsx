import { Layers } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import type * as Y from 'yjs'
import type { DiagramEditor } from '../diagram/editor.ts'
import { elementsStore, sharedLabel, type ElementItem } from './elementList.ts'

/** The height of a badge and its gap from the corner, inside the shape: the other corners have badges of their own. */
const BADGE_SIZE = 18
const BADGE_GAP = 4

const NO_ITEMS: readonly ElementItem[] = []
const noSubscription = () => () => {}

/**
 * The cells of the page whose elements are on other pages too, each with a badge in its top right corner: the number of
 * those pages, and their names in its tooltip. A click on a badge asks to show where the element is used. Like the
 * badges of statuses and locks, it is a layer over the canvas, not cells of the diagram, so images of the page do not
 * show it.
 */
export function SharedBadges({
  editor,
  document,
  onShow,
}: {
  editor: DiagramEditor | null
  document: Y.Doc | null
  /** Shows where the element of the item `key` is used. */
  onShow: (key: string) => void
}) {
  // Positions depend on scrolling, zoom and cell geometry: re-render whenever the view changes.
  useSyncExternalStore(editor?.onViewChange ?? noSubscription, () => editor?.getViewVersion() ?? 0)
  const store = document ? elementsStore(document) : null
  const items = useSyncExternalStore(store?.subscribe ?? noSubscription, () => store?.get() ?? NO_ITEMS)
  if (!editor) return null
  const pageId = editor.pageId
  const badges = items.flatMap((item) => {
    if (item.places.length < 2) return []
    const here = item.places.find((place) => place.pageId === pageId)
    return here ? here.cellIds.map((cellId) => ({ item, cellId })) : []
  })
  if (badges.length === 0) return null

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {badges.map(({ item, cellId }) => {
        const bounds = editor.cellBounds(cellId)
        if (!bounds) return null
        const label = sharedLabel(item, pageId)
        return (
          <button
            key={cellId}
            type="button"
            data-testid="shared-badge"
            data-cell={cellId}
            aria-label={label}
            title={label}
            className="pointer-events-auto absolute flex items-center gap-0.5 rounded-full border bg-background/95 px-1 text-[11px] leading-none font-medium text-foreground shadow-sm hover:bg-accent"
            style={{
              left: bounds.x + bounds.width - BADGE_GAP,
              top: bounds.y + BADGE_GAP,
              height: BADGE_SIZE,
              transform: 'translateX(-100%)',
            }}
            onClick={() => onShow(item.key)}
          >
            <Layers aria-hidden className="size-3" />
            {item.places.length - 1}
          </button>
        )
      })}
    </div>
  )
}
