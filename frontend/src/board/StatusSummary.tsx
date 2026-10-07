import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import * as Y from 'yjs'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { relativeTime } from '../lib/relativeTime.ts'
import { STATUS_LABELS, statusTime, type ElementStatus } from '../diagram/status.ts'
import { StatusIcon } from '../diagram/StatusIcon.tsx'
import { countStatuses, listStatuses, type StatusItem } from './statusList.ts'

/** The shortest time between two readings of a board that others change: a drag gives dozens of changes a second. */
const STATUSES_INTERVAL_MS = 150

/** How often the time «5 минут назад» counts from is taken again while the list is open, in milliseconds. */
const NOW_INTERVAL_MS = 30_000

/** The tabs of the list, the statuses that wait for something first. */
const TABS: readonly ElementStatus[] = ['review', 'draft', 'done']

const NO_ITEMS: StatusItem[] = []

/**
 * «N на ревью» in the header of the board while elements of it wait for a review: the elements with statuses on all
 * pages, a tab for each status, with the page of each element and who set its status when. Choosing an element leaves
 * it to `onSelect`, which goes to it.
 */
export function StatusSummary({
  document,
  onSelect,
}: {
  document: Y.Doc | null
  onSelect: (item: StatusItem) => void
}) {
  const items = useStatusItems(document)
  const counts = countStatuses(items)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<ElementStatus>('review')
  // The list stays while it is open, even when its last element is reviewed meanwhile.
  if (counts.review === 0 && !open) return null
  const shown = items.filter((item) => item.status === tab)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setTab('review')
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" title="Элементы со статусом" className="shrink-0 whitespace-nowrap">
          <StatusIcon status="review" />
          {counts.review} на ревью
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label="Статусы элементов" className="flex max-h-[70vh] w-80 flex-col p-0">
        <div role="tablist" aria-label="Статус" className="flex gap-1 border-b p-1">
          {TABS.map((status) => (
            <button
              key={status}
              type="button"
              role="tab"
              aria-selected={tab === status}
              className={cn(
                'flex flex-1 items-center justify-center gap-1 rounded px-1.5 py-1 text-xs whitespace-nowrap hover:bg-accent',
                tab === status && 'bg-accent font-medium',
              )}
              onClick={() => setTab(status)}
            >
              {/* The space keeps the number apart from the name of the tab; flex boxes do not show it. */}
              {STATUS_LABELS[status]}{' '}
              <span className="text-muted-foreground tabular-nums">{counts[status]}</span>
            </button>
          ))}
        </div>
        <StatusList
          items={shown}
          label={STATUS_LABELS[tab]}
          onSelect={(item) => {
            setOpen(false)
            onSelect(item)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

function StatusList({ items, label, onSelect }: { items: StatusItem[]; label: string; onSelect: (item: StatusItem) => void }) {
  const now = useNow()
  if (items.length === 0) {
    return (
      <p role="tabpanel" aria-label={label} className="p-3 text-sm text-muted-foreground">
        Нет элементов со статусом «{label}»
      </p>
    )
  }
  return (
    <ul role="tabpanel" aria-label={label} className="min-h-0 flex-1 overflow-y-auto p-1">
      {items.map((item) => {
        const who = [item.name, item.at === null ? null : relativeTime(item.at, now)].filter((part) => part !== null)
        return (
          <li key={`${item.pageId}:${item.cellId}`}>
            <button
              type="button"
              title={item.at === null ? undefined : statusTime(item.at)}
              className="flex w-full items-start gap-2 rounded-md p-2 text-left hover:bg-accent"
              onClick={() => onSelect(item)}
            >
              <StatusIcon status={item.status} className="mt-0.5" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm">{item.title}</span>{' '}
                <span className="truncate text-xs text-muted-foreground">
                  {[item.pageName, who.join(', ')].filter(Boolean).join(' · ')}
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** The elements of the board with statuses, read again after changes of the board at most every {@link STATUSES_INTERVAL_MS}. */
function useStatusItems(document: Y.Doc | null): StatusItem[] {
  const store = useMemo(() => document && statusStore(document), [document])
  return useSyncExternalStore(store?.subscribe ?? noSubscription, () => store?.get() ?? NO_ITEMS)
}

const noSubscription = () => () => {}

/** A store of the statuses of a board for `useSyncExternalStore`: the same list until they change. */
function statusStore(document: Y.Doc) {
  let snapshot: StatusItem[] | null = null
  const read = () => {
    const items = listStatuses(document)
    return snapshot && sameItems(snapshot, items) ? snapshot : items.length > 0 ? items : NO_ITEMS
  }
  return {
    get: () => (snapshot ??= read()),
    subscribe(onChange: () => void) {
      let timer: ReturnType<typeof setTimeout> | undefined
      const changed = () => {
        timer = undefined
        const next = read()
        if (next === snapshot) return
        snapshot = next
        onChange()
      }
      const schedule = () => {
        timer ??= setTimeout(changed, STATUSES_INTERVAL_MS)
      }
      document.on('update', schedule)
      // The board may have changed before the subscription.
      changed()
      return () => {
        clearTimeout(timer)
        document.off('update', schedule)
      }
    },
  }
}

const sameItems = (a: StatusItem[], b: StatusItem[]) =>
  a.length === b.length &&
  a.every((item, index) => {
    const other = b[index]!
    return (
      item.pageId === other.pageId &&
      item.cellId === other.cellId &&
      item.status === other.status &&
      item.title === other.title &&
      item.pageName === other.pageName &&
      item.name === other.name &&
      item.at === other.at
    )
  })

/** The time to count how long ago statuses were set from, taken again every {@link NOW_INTERVAL_MS}. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), NOW_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [])
  return now
}
