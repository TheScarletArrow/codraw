import { ChevronDown, Plus } from 'lucide-react'
import { useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { PageInfo } from '../diagram/pages.ts'
import type { ParticipantIdentity } from './identity.ts'

/** MIME type for dragging a page tab to another place. */
const PAGE_DRAG_TYPE = 'application/x-codraw-page'

/** Another participant shown on the tab of the page they are on. */
export interface PageVisitor extends ParticipantIdentity {
  clientId: number
  page: string
}

interface PageTabsProps {
  pages: PageInfo[]
  currentPageId: string | null
  /** Other participants and their pages. */
  visitors?: PageVisitor[]
  onSelect: (id: string) => void
  onAdd: () => void
  onRename: (id: string, name: string) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
  /** Moves a page so that it ends up at `index` in the list. */
  onMove: (id: string, index: number) => void
  /** The participant may only view the board: the tabs only switch pages. */
  readOnly?: boolean
  /** Shown at the right end of the bar, like a status bar: e.g. who changed the selected element last. */
  children?: ReactNode
}

/** Tabs of the pages of a board under the canvas, as in draw.io. */
export function PageTabs({
  pages,
  currentPageId,
  visitors = [],
  onSelect,
  onAdd,
  onRename,
  onDuplicate,
  onDelete,
  onMove,
  readOnly = false,
  children,
}: PageTabsProps) {
  const [renaming, setRenaming] = useState<string | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)

  const handleDrop = (event: DragEvent, targetIndex: number) => {
    const id = event.dataTransfer.getData(PAGE_DRAG_TYPE)
    const from = pages.findIndex((page) => page.id === id)
    if (from < 0) return
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const insertAt = event.clientX > rect.left + rect.width / 2 ? targetIndex + 1 : targetIndex
    onMove(id, insertAt > from ? insertAt - 1 : insertAt)
  }

  return (
    <div className="flex h-9 shrink-0 items-stretch border-t bg-muted/50 text-sm">
      <div role="tablist" aria-label="Страницы" className="flex min-w-0 items-stretch overflow-x-auto">
        {pages.map((page, index) => {
          const selected = page.id === currentPageId
          const here = visitors.filter((visitor) => visitor.page === page.id)
          return (
            <Popover key={page.id} open={menuFor === page.id} onOpenChange={(open) => setMenuFor(open ? page.id : null)}>
              <PopoverAnchor asChild>
                <div
                  role="tab"
                  aria-label={page.name}
                  aria-selected={selected}
                  tabIndex={selected ? 0 : -1}
                  title={page.name}
                  draggable={!readOnly && renaming !== page.id}
                  className={cn(
                    'group flex max-w-56 shrink-0 cursor-pointer items-center gap-1.5 border-r px-3 select-none',
                    selected ? 'bg-background font-medium' : 'text-muted-foreground hover:bg-background/60',
                  )}
                  onClick={() => onSelect(page.id)}
                  onDoubleClick={() => !readOnly && setRenaming(page.id)}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    if (!readOnly) setMenuFor(page.id)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'F2' && !readOnly) setRenaming(page.id)
                  }}
                  onDragStart={(event) => {
                    event.dataTransfer.setData(PAGE_DRAG_TYPE, page.id)
                    event.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragOver={(event) => {
                    if (event.dataTransfer.types.includes(PAGE_DRAG_TYPE)) event.preventDefault()
                  }}
                  onDrop={(event) => handleDrop(event, index)}
                >
                  {renaming === page.id ? (
                    <PageNameInput
                      name={page.name}
                      onDone={(name) => {
                        setRenaming(null)
                        if (name !== null) onRename(page.id, name)
                      }}
                    />
                  ) : (
                    <span className="truncate">{page.name}</span>
                  )}
                  {here.length > 0 && (
                    <span className="flex shrink-0 -space-x-1" aria-label={`На странице: ${here.map((v) => v.name).join(', ')}`}>
                      {here.map((visitor) => (
                        <span
                          key={visitor.clientId}
                          data-testid="page-visitor"
                          title={visitor.name}
                          className="size-2 rounded-full ring-1 ring-background"
                          style={{ backgroundColor: visitor.color }}
                        />
                      ))}
                    </span>
                  )}
                  {!readOnly && (
                    <button
                      type="button"
                      aria-label={`Меню страницы «${page.name}»`}
                      className={cn(
                        'rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground',
                        !selected && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
                    )}
                    onClick={(event) => {
                      event.stopPropagation()
                      setMenuFor(menuFor === page.id ? null : page.id)
                    }}
                  >
                    <ChevronDown className="size-3.5" />
                  </button>
                  )}
                </div>
              </PopoverAnchor>
              <PageMenu
                page={page}
                isFirst={index === 0}
                isLast={index === pages.length - 1}
                isOnly={pages.length === 1}
                onRename={() => {
                  setMenuFor(null)
                  setRenaming(page.id)
                }}
                onDuplicate={() => {
                  setMenuFor(null)
                  onDuplicate(page.id)
                }}
                onMove={(offset) => {
                  setMenuFor(null)
                  onMove(page.id, index + offset)
                }}
                onDelete={() => {
                  setMenuFor(null)
                  onDelete(page.id)
                }}
              />
            </Popover>
          )
        })}
      </div>
      {!readOnly && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="m-0.5 size-8"
          aria-label="Добавить страницу"
          title="Добавить страницу"
          onClick={onAdd}
        >
          <Plus />
        </Button>
      )}
      {children && <div className="ml-auto flex max-w-96 min-w-0 shrink-0 items-center px-3">{children}</div>}
    </div>
  )
}

/** Inline editor of the page name: Enter or leaving it saves, Escape cancels. */
function PageNameInput({ name, onDone }: { name: string; onDone: (name: string | null) => void }) {
  const [value, setValue] = useState(name)
  // Enter removes the input, and the browser may then report a blur too.
  const finished = useRef(false)
  const finish = (result: string | null) => {
    if (finished.current) return
    finished.current = true
    onDone(result !== null && result.trim() && result.trim() !== name ? result.trim() : null)
  }

  return (
    <input
      aria-label="Имя страницы"
      autoFocus
      value={value}
      size={Math.max(6, value.length)}
      className="min-w-0 rounded border bg-background px-1 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      onChange={(event) => setValue(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onFocus={(event) => event.target.select()}
      onBlur={() => finish(value)}
      onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
        event.stopPropagation()
        if (event.key === 'Enter') finish(value)
        if (event.key === 'Escape') finish(null)
      }}
    />
  )
}

interface PageMenuProps {
  page: PageInfo
  isFirst: boolean
  isLast: boolean
  isOnly: boolean
  onRename: () => void
  onDuplicate: () => void
  onMove: (offset: -1 | 1) => void
  onDelete: () => void
}

/** Actions with a page; deleting asks for confirmation, as it cannot be undone. */
function PageMenu({ page, isFirst, isLast, isOnly, onRename, onDuplicate, onMove, onDelete }: PageMenuProps) {
  const [confirming, setConfirming] = useState(false)
  const item = 'justify-start font-normal'

  return (
    <PopoverContent
      side="top"
      align="start"
      className="w-60 p-1"
      onCloseAutoFocus={(event) => event.preventDefault()}
      onOpenAutoFocus={() => setConfirming(false)}
    >
      {confirming ? (
        <div role="alertdialog" aria-label="Удаление страницы" className="flex flex-col gap-2 p-2">
          <p className="text-sm">Удалить страницу «{page.name}» со всем содержимым у всех участников?</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Отмена
            </Button>
            <Button type="button" size="sm" className="bg-destructive text-white hover:bg-destructive/90" onClick={onDelete}>
              Удалить
            </Button>
          </div>
        </div>
      ) : (
        <div role="menu" aria-label={`Страница «${page.name}»`} className="flex flex-col">
          <Button type="button" role="menuitem" variant="ghost" size="sm" className={item} onClick={onRename}>
            Переименовать
          </Button>
          <Button type="button" role="menuitem" variant="ghost" size="sm" className={item} onClick={onDuplicate}>
            Дублировать
          </Button>
          <Button type="button" role="menuitem" variant="ghost" size="sm" className={item} disabled={isFirst} onClick={() => onMove(-1)}>
            Переместить влево
          </Button>
          <Button type="button" role="menuitem" variant="ghost" size="sm" className={item} disabled={isLast} onClick={() => onMove(1)}>
            Переместить вправо
          </Button>
          <Button
            type="button"
            role="menuitem"
            variant="ghost"
            size="sm"
            className={cn(item, 'text-destructive hover:text-destructive')}
            disabled={isOnly}
            onClick={() => setConfirming(true)}
          >
            Удалить
          </Button>
        </div>
      )}
    </PopoverContent>
  )
}
