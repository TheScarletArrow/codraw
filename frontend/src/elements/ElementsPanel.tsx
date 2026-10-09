import { Boxes, ChevronRight, Search, X } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore, type DragEvent } from 'react'
import type * as Y from 'yjs'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { kindLabel } from '../diagram/elementProps.ts'
import { ELEMENT_DRAG_TYPE, type ElementDrag } from '../diagram/sharedElements.ts'
import { ModelTree } from '../views/ModelTree.tsx'
import { elementsStore, pagesLabel, searchElements, type ElementItem } from './elementList.ts'

/** The button of the header of the board that shows and hides the panel of the elements of the board. */
export function ElementsButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label="Элементы доски"
      aria-pressed={open}
      title="Элементы доски"
      className="shrink-0"
      onClick={onToggle}
    >
      <Boxes />
    </Button>
  )
}

/** A request of the page to show where an element is used, e.g. from the menu of a shape; a new object for each. */
export interface ElementsRequest {
  /** The key of the item, see {@link ElementItem.key}. */
  key: string
}

const NO_ITEMS: readonly ElementItem[] = []
const noSubscription = () => () => {}

/**
 * The elements of all pages of the board, at the right of the canvas while it is open: the name, the kind, the
 * technology and the number of pages of each, a search by their properties, and the pages and cells of an item when it
 * is opened, where a click goes. Who edits the board drags an item onto the canvas to add another cell of its element.
 * A new `request`, e.g. of «Где используется…», opens that item in the list. The tab «Модель» shows the same elements as
 * the tree of the model of the board, searched by the same field.
 */
export function ElementsPanel({
  document,
  canPlace,
  request = null,
  onShow,
  onClose,
}: {
  document: Y.Doc | null
  /** The participant edits the board: the items may be dragged onto the canvas. */
  canPlace: boolean
  request?: ElementsRequest | null
  /** Goes to a cell: opens its page and selects it. */
  onShow: (pageId: string, cellId: string) => void
  onClose: () => void
}) {
  const store = document ? elementsStore(document) : null
  const items = useSyncExternalStore(store?.subscribe ?? noSubscription, () => store?.get() ?? NO_ITEMS)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<'list' | 'model'>('list')
  const [opened, setOpened] = useState<string | null>(request?.key ?? null)
  // A new request opens its item in the whole list.
  const [requested, setRequested] = useState(request)
  if (request !== requested) {
    setRequested(request)
    if (request) {
      setQuery('')
      setTab('list')
      setOpened(request.key)
    }
  }
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!request) return
    panel.current?.focus()
    panel.current?.querySelector(`[data-key="${CSS.escape(request.key)}"]`)?.scrollIntoView?.({ block: 'nearest' })
  }, [request])
  const found = searchElements(items, query)

  return (
    <aside
      ref={panel}
      tabIndex={-1}
      aria-label="Элементы доски"
      className="pointer-events-auto flex min-h-0 w-[320px] max-w-full flex-col overflow-hidden rounded-md border bg-background text-foreground shadow-lg outline-none"
    >
      <header className="flex items-center gap-1 border-b px-3 py-2">
        <h2 className="mr-auto text-sm font-semibold">Элементы доски</h2>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Закрыть" title="Закрыть" onClick={onClose}>
          <X />
        </Button>
      </header>
      <div role="tablist" aria-label="Вид панели" className="flex gap-1 border-b px-2 pt-2">
        {(['list', 'model'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={cn(
              '-mb-px rounded-t-md border border-transparent px-3 py-1 text-sm',
              tab === value ? 'border-border border-b-background bg-background font-medium' : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setTab(value)}
          >
            {value === 'list' ? 'Список' : 'Модель'}
          </button>
        ))}
      </div>
      <div className="border-b p-2">
        <label className="relative flex items-center">
          <Search aria-hidden className="pointer-events-none absolute left-2 size-4 text-muted-foreground" />
          <input
            type="search"
            aria-label="Поиск элементов"
            placeholder="Имя, тип, технология, владелец, тег"
            className="h-8 w-full rounded-md border bg-background pr-2 pl-8 text-sm"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Escape' || !query) return
              event.preventDefault()
              event.stopPropagation()
              setQuery('')
            }}
          />
        </label>
      </div>
      <div className="overflow-y-auto p-1">
        {tab === 'model' && document ? (
          <ModelTree document={document} query={query} canPlace={canPlace} onShow={onShow} />
        ) : items.length === 0 ? (
          <p className="p-2 text-sm text-muted-foreground">На доске нет элементов</p>
        ) : found.length === 0 ? (
          <p className="p-2 text-sm text-muted-foreground">Ничего не найдено</p>
        ) : (
          <ul aria-label="Элементы" className="flex flex-col">
            {found.map((item) => (
              <ElementRow
                key={item.key}
                item={item}
                open={opened === item.key}
                canPlace={canPlace}
                onToggle={() => setOpened((current) => (current === item.key ? null : item.key))}
                onShow={onShow}
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}

function ElementRow({
  item,
  open,
  canPlace,
  onToggle,
  onShow,
}: {
  item: ElementItem
  open: boolean
  canPlace: boolean
  onToggle: () => void
  onShow: (pageId: string, cellId: string) => void
}) {
  const { name, kind, technology } = item.properties
  const details = [kind ? kindLabel(kind) : '', technology].filter(Boolean).join(' · ')
  const handleDragStart = (event: DragEvent) => {
    const drag: ElementDrag =
      item.elementId !== null
        ? { elementId: item.elementId }
        : { cell: { pageId: item.places[0]!.pageId, cellId: item.places[0]!.cellIds[0]! } }
    event.dataTransfer.setData(ELEMENT_DRAG_TYPE, JSON.stringify(drag))
    event.dataTransfer.effectAllowed = 'copy'
  }
  return (
    <li data-key={item.key} className="flex flex-col">
      <button
        type="button"
        aria-expanded={open}
        draggable={canPlace}
        onDragStart={canPlace ? handleDragStart : undefined}
        title={canPlace ? 'Перетащите на холст, чтобы добавить ещё одну ячейку элемента' : undefined}
        className={cn(
          'flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent',
          canPlace && 'cursor-grab active:cursor-grabbing',
        )}
        onClick={onToggle}
      >
        <ChevronRight aria-hidden className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={cn('truncate', !name && 'text-muted-foreground italic')}>{name || 'Без имени'}</span>
          {details && <span className="truncate text-xs text-muted-foreground">{details}</span>}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">{pagesLabel(item.places.length)}</span>
      </button>
      {open && (
        <ul aria-label={`Где используется ${name || 'элемент'}`} className="mb-1 ml-7 flex flex-col">
          {item.places.flatMap((place) =>
            place.cellIds.map((cellId, index) => (
              <li key={cellId}>
                <button
                  type="button"
                  className="w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-accent"
                  onClick={() => onShow(place.pageId, cellId)}
                >
                  {place.cellIds.length > 1 ? `${place.pageName} (${index + 1})` : place.pageName}
                </button>
              </li>
            )),
          )}
        </ul>
      )}
    </li>
  )
}
