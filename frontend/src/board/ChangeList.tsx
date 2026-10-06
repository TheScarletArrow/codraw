import { cn } from '@/lib/utils'
import { countChanges, type BoardDiff, type PageDiff } from '../diagram/diff.ts'
import { ChangeIcon } from './ChangeIcon.tsx'
import { CHANGE_LABELS, changeItems, type ChangeItem } from './changes.ts'

/** An element of a page that the list points at. */
export interface ChangeTarget {
  pageId: string
  cellId: string
}

interface ChangeListProps {
  diff: BoardDiff
  /** The pages of the comparison in their order, those removed since the version too. */
  pages: { id: string; name: string }[]
  currentPageId: string | null
  selected: ChangeTarget | null
  /** Goes to the page of the element and shows it. */
  onSelect: (target: ChangeTarget) => void
}

/**
 * The changes of the board since a version: how many elements were added, changed and removed, and the changes of each
 * page, the current page first. An element added or removed with its parent is part of the item of the parent.
 */
export function ChangeList({ diff, pages, currentPageId, selected, onSelect }: ChangeListProps) {
  const counts = countChanges(diff)
  const ordered = [...pages].sort((a, b) => Number(b.id === currentPageId) - Number(a.id === currentPageId))
  const groups = ordered.flatMap((page) => {
    const changes = diff.pages.find((item) => item.id === page.id)
    return changes ? [{ name: page.name, changes, note: pageNote(changes), items: changeItems(changes) }] : []
  })

  return (
    <aside aria-label="Изменения" className="flex w-64 shrink-0 flex-col border-r bg-background">
      <div className="flex flex-col gap-0.5 border-b px-3 py-2">
        <h3 className="text-sm font-semibold">Изменения</h3>
        <p className="text-xs text-muted-foreground">
          {`Добавлено ${counts.added} · Изменено ${counts.changed} · Удалено ${counts.removed}`}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {groups.length === 0 && (
          <p className="p-2 text-sm text-muted-foreground">После этой версии доска не менялась.</p>
        )}
        {groups.map(({ name, changes, note, items }) => (
          <section key={changes.id} aria-label={name} className="mb-2 flex flex-col last:mb-0">
            <h4 className="flex items-baseline gap-1.5 px-2 pt-1 pb-0.5 text-xs font-medium text-muted-foreground">
              <span className={cn('truncate', changes.type === 'removed' && 'line-through')}>{name}</span>{' '}
              {note && <span className="shrink-0 font-normal">{note}</span>}
            </h4>
            {items.length > 0 && (
              <ul className="flex flex-col">
                {items.map((item) => {
                  const pressed = selected?.pageId === changes.id && selected.cellId === item.id
                  const about = itemNote(item)
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        aria-pressed={pressed}
                        className={cn(
                          'flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent',
                          pressed && 'bg-accent',
                        )}
                        onClick={() => onSelect({ pageId: changes.id, cellId: item.id })}
                      >
                        <ChangeIcon type={item.type} className="mt-0.5 size-4" />
                        {/* Spaces between the lines keep the words of the name of the button apart. */}
                        <span className="flex min-w-0 flex-col">
                          <span className="sr-only">{`${CHANGE_LABELS[item.type]}:`}</span>{' '}
                          <span className={cn('truncate text-sm', item.type === 'removed' && 'line-through')}>{item.title}</span>{' '}
                          {about && <span className="text-xs text-muted-foreground">{about}</span>}{' '}
                          {item.previousTitle !== null && (
                            <span className="truncate text-xs text-muted-foreground">было «{item.previousTitle}»</span>
                          )}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        ))}
      </div>
    </aside>
  )
}

/** What happened to the page itself. */
function pageNote(page: PageDiff): string {
  if (page.type === 'added') return 'добавлена'
  if (page.type === 'removed') return 'удалена'
  const notes = [page.renamed && `была «${page.before!.name}»`, page.moved && 'перемещена'].filter(Boolean)
  return notes.join(', ')
}

/** The kind of the element when its label names it, what it holds, and what changed. */
function itemNote(item: ChangeItem): string {
  const kind = [item.title !== item.kind && item.kind, item.nested > 0 && `вложенных: ${item.nested}`].filter(Boolean).join(', ')
  return [kind, item.details.join(', ')].filter(Boolean).join(' · ')
}
