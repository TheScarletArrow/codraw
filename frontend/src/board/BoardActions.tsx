import { Ellipsis } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface BoardActionsProps {
  title: string
  /** Label of the delete item: «Удалить» in the list of boards, «Удалить доску» on the board. */
  deleteLabel?: string
  /** Renames the board; without it, as for anybody but the owner, the menu has no such item. */
  onRename?: () => void
  /** Opens the versions of the board; without it the menu has no such item. */
  onHistory?: () => void
  /** Called once the user has confirmed the deletion; without it, as for anybody but the owner, nothing deletes. */
  onDelete?: () => void
  /** The editor of the personal tags of the board, which «Теги» opens in the menu; without it there is no such item. */
  tags?: () => ReactNode
  /**
   * The choice of the personal folder of the board, which «Переместить в папку» opens in the menu, given what closes
   * the menu; without it there is no such item.
   */
  folder?: (close: () => void) => ReactNode
  disabled?: boolean
}

/** What the menu shows: its items, the confirmation of the deletion, the tags or the folder of the board. */
type View = 'items' | 'confirm' | 'tags' | 'folder'

/**
 * Menu of a board: its owner renames and deletes it, whoever edits it opens its versions, and in the list of boards the
 * user gives it their tags and folder. Deleting asks for confirmation, as a deleted board cannot be restored.
 */
export function BoardActions({
  title,
  deleteLabel = 'Удалить',
  onRename,
  onHistory,
  onDelete,
  tags,
  folder,
  disabled = false,
}: BoardActionsProps) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<View>('items')
  const item = 'justify-start font-normal'

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setView('items')
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Меню доски «${title}»`}
          title="Действия с доской"
          disabled={disabled}
        >
          <Ellipsis />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className={cn('p-1', view === 'tags' ? 'w-72' : 'w-64')}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {view === 'tags' && tags?.()}
        {view === 'folder' && folder?.(() => setOpen(false))}
        {view === 'confirm' && (
          <div role="alertdialog" aria-label="Удаление доски" className="flex flex-col gap-2 p-2">
            <p className="text-sm">Удалить доску «{title}»? Её нельзя будет восстановить.</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setView('items')}>
                Отмена
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={() => {
                  setOpen(false)
                  onDelete?.()
                }}
              >
                Удалить
              </Button>
            </div>
          </div>
        )}
        {view === 'items' && (
          <div role="menu" aria-label={`Доска «${title}»`} className="flex flex-col">
            {onRename && (
              <Button
                type="button"
                role="menuitem"
                variant="ghost"
                size="sm"
                className={item}
                onClick={() => {
                  setOpen(false)
                  onRename()
                }}
              >
                Переименовать
              </Button>
            )}
            {tags && (
              <Button
                type="button"
                role="menuitem"
                variant="ghost"
                size="sm"
                className={item}
                onClick={() => setView('tags')}
              >
                Теги
              </Button>
            )}
            {folder && (
              <Button
                type="button"
                role="menuitem"
                variant="ghost"
                size="sm"
                className={item}
                onClick={() => setView('folder')}
              >
                Переместить в папку
              </Button>
            )}
            {onHistory && (
              <Button
                type="button"
                role="menuitem"
                variant="ghost"
                size="sm"
                className={item}
                onClick={() => {
                  setOpen(false)
                  onHistory()
                }}
              >
                История версий
              </Button>
            )}
            {onDelete && (
              <Button
                type="button"
                role="menuitem"
                variant="ghost"
                size="sm"
                className={cn(item, 'text-destructive hover:text-destructive')}
                onClick={() => setView('confirm')}
              >
                {deleteLabel}
              </Button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
