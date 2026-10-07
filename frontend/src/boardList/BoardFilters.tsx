import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { BOARD_SORTS, sameLabel, type BoardSort } from './boardList.ts'

interface BoardFiltersProps {
  query: string
  onQueryChange: (query: string) => void
  sort: BoardSort
  onSortChange: (sort: BoardSort) => void
  /** All tags of the user on the boards of the list. */
  tags: string[]
  /** The tags that a board must all have to stay in the list. */
  selectedTags: string[]
  onToggleTag: (tag: string) => void
}

/**
 * Over the list of boards: «Поиск досок» by title and by the text of boards, the order of the list, and the tags of the
 * user, each of which keeps only the boards that have it.
 */
export function BoardFilters({
  query,
  onQueryChange,
  sort,
  onSortChange,
  tags,
  selectedTags,
  onToggleTag,
}: BoardFiltersProps) {
  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 basis-56">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            aria-label="Поиск досок"
            value={query}
            placeholder="Название или текст на доске"
            className="h-9 w-full rounded-md border bg-background pr-2 pl-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && query) {
                event.preventDefault()
                onQueryChange('')
              }
            }}
          />
        </label>
        <select
          aria-label="Порядок досок"
          value={sort}
          className="h-9 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          onChange={(event) => onSortChange(event.target.value as BoardSort)}
        >
          {BOARD_SORTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {tags.length > 0 && (
        <div role="group" aria-label="Фильтр по тегам" className="flex flex-wrap items-center gap-1.5">
          <span aria-hidden className="text-sm text-muted-foreground">
            Теги:
          </span>
          {tags.map((tag) => {
            const pressed = selectedTags.some((selected) => sameLabel(selected, tag))
            return (
              <Button
                key={tag}
                type="button"
                variant="outline"
                size="xs"
                aria-pressed={pressed}
                className={cn('rounded-full font-normal', pressed && 'border-primary bg-primary/10')}
                onClick={() => onToggleTag(tag)}
              >
                {tag}
              </Button>
            )
          })}
        </div>
      )}
    </div>
  )
}
