import { TriangleAlert, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { countChanges, type BoardDiff, type PageDiff } from '../diagram/diff.ts'
import type { MergeConflicts } from '../diagram/merge.ts'
import { ChangeIcon } from './ChangeIcon.tsx'
import { CHANGE_LABELS, changeItems, CONFLICT_LABEL, countConflicts, type ChangeItem } from './changes.ts'

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
  /**
   * Brings a removed or changed element back as the earlier state has it; without it the list offers no «Вернуть», e.g.
   * to whoever only looks at the changes.
   */
  onRevert?: (target: ChangeTarget) => void
  /** What the list says when the board has not changed since the version. */
  unchanged?: string
  /**
   * Elements and pages that changed elsewhere too since the earlier state, e.g. on the board since a proposal was made:
   * their items say so.
   */
  conflicts?: MergeConflicts
}

/**
 * The changes of the board since a version: how many elements were added, changed and removed, and the changes of each
 * page, the current page first. An element added or removed with its parent is part of the item of the parent. With
 * `onRevert`, removed and changed elements of the pages the board has can be brought back one by one; with `conflicts`,
 * the items and the pages that changed elsewhere too say so, and the list tells how many there are.
 */
export function ChangeList({
  diff,
  pages,
  currentPageId,
  selected,
  onSelect,
  onRevert,
  unchanged = 'После этой версии доска не менялась.',
  conflicts,
}: ChangeListProps) {
  const counts = countChanges(diff)
  const ordered = [...pages].sort((a, b) => Number(b.id === currentPageId) - Number(a.id === currentPageId))
  const groups = ordered.flatMap((page) => {
    const changes = diff.pages.find((item) => item.id === page.id)
    if (!changes) return []
    const items = changeItems(changes, conflicts?.cells.get(page.id))
    return [{ name: page.name, changes, note: pageNote(changes, conflicts?.pages.has(page.id) ?? false), items }]
  })
  const conflicted = conflicts ? countConflicts(diff, conflicts) : 0

  return (
    <aside aria-label="Изменения" className="flex w-64 shrink-0 flex-col border-r bg-background">
      <div className="flex flex-col gap-0.5 border-b px-3 py-2">
        <h3 className="text-sm font-semibold">Изменения</h3>
        <p className="text-xs text-muted-foreground">
          {`Добавлено ${counts.added} · Изменено ${counts.changed} · Удалено ${counts.removed}`}
        </p>
        {conflicted > 0 && (
          <p className="flex items-center gap-1 text-xs text-changed">
            <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
            {`Изменено и на доске: ${conflicted}`}
          </p>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {groups.length === 0 && (
          <p className="p-2 text-sm text-muted-foreground">{unchanged}</p>
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
                  // An added element has nothing to come back to, and an element of a removed page nowhere to go.
                  const revertible = onRevert && item.type !== 'added' && changes.type !== 'removed'
                  return (
                    <li key={item.id} className="flex items-start gap-1">
                      <button
                        type="button"
                        aria-pressed={pressed}
                        className={cn(
                          'flex min-w-0 flex-1 items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent',
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
                          )}{' '}
                          {item.conflict && <span className="text-xs text-changed">{CONFLICT_LABEL}</span>}
                        </span>
                      </button>
                      {revertible && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Вернуть «${item.title}»`}
                          title="Вернуть, как в версии"
                          className="mt-0.5 h-7 px-2 text-xs"
                          onClick={() => onRevert({ pageId: changes.id, cellId: item.id })}
                        >
                          <Undo2 className="size-3.5" />
                          Вернуть
                        </Button>
                      )}
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

/** What happened to the page itself, and whether it changed elsewhere too. */
function pageNote(page: PageDiff, conflict: boolean): string {
  const conflictNote = conflict ? 'изменена на доске после предложения' : false
  if (page.type === 'added') return 'добавлена'
  if (page.type === 'removed') return ['удалена', conflictNote].filter(Boolean).join(', ')
  const notes = [page.renamed && `была «${page.before!.name}»`, page.moved && 'перемещена', conflictNote].filter(Boolean)
  return notes.join(', ')
}

/** The kind of the element when its label names it, what it holds, and what changed. */
function itemNote(item: ChangeItem): string {
  const kind = [item.title !== item.kind && item.kind, item.nested > 0 && `вложенных: ${item.nested}`].filter(Boolean).join(', ')
  return [kind, item.details.join(', ')].filter(Boolean).join(' · ')
}
