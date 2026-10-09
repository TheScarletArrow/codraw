import { ChevronRight } from 'lucide-react'
import { useMemo, useSyncExternalStore } from 'react'
import type * as Y from 'yjs'
import { detailCrumbs, type DetailCrumb } from '../diagram/detail.ts'

const NO_CRUMBS: DetailCrumb[] = []

/** The crumbs of a page, read again after changes of the board: the same list until they change. */
function useDetailCrumbs(document: Y.Doc | null, pageId: string): DetailCrumb[] {
  const store = useMemo(() => {
    if (!document) return null
    let snapshot: DetailCrumb[] = NO_CRUMBS
    const read = () => {
      const next = detailCrumbs(document, pageId)
      if (JSON.stringify(next) !== JSON.stringify(snapshot)) snapshot = next.length > 0 ? next : NO_CRUMBS
      return snapshot
    }
    read()
    return {
      get: () => snapshot,
      subscribe(onChange: () => void) {
        const changed = () => {
          const before = snapshot
          if (read() !== before) onChange()
        }
        document.on('update', changed)
        return () => document.off('update', changed)
      },
    }
  }, [document, pageId])
  return useSyncExternalStore(store?.subscribe ?? noSubscription, () => store?.get() ?? NO_CRUMBS)
}

const noSubscription = () => () => {}

/**
 * The way down to a page of detail over the canvas (see `detail.ts`): «Контекст › Payments › API», the page at the top
 * by its name and each page of detail by the element it details. A crumb opens its page; the last one is this page.
 * Nothing for a page that details nothing.
 */
export function DetailCrumbs({
  document,
  pageId,
  onSelectPage,
}: {
  document: Y.Doc | null
  pageId: string
  onSelectPage: (pageId: string) => void
}) {
  const crumbs = useDetailCrumbs(document, pageId)
  if (crumbs.length === 0) return null
  return (
    <nav
      aria-label="Детализация"
      className="absolute top-2 left-2 z-10 flex max-w-[calc(100%-1rem)] items-center gap-0.5 overflow-hidden rounded-md border bg-background px-1 py-0.5 text-sm shadow-sm"
    >
      <ol className="flex min-w-0 items-center gap-0.5">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1
          return (
            <li key={crumb.pageId} className="flex min-w-0 items-center gap-0.5">
              {index > 0 && <ChevronRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />}
              {last ? (
                <span aria-current="page" className="truncate px-1 font-medium">
                  {crumb.label}
                </span>
              ) : (
                <button
                  type="button"
                  className="truncate rounded px-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  onClick={() => onSelectPage(crumb.pageId)}
                >
                  {crumb.label}
                </button>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
