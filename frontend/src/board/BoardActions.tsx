import { Ellipsis } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { boardMessages as m } from './board.messages.ts'

interface BoardActionsProps {
  title: string
  /** Label of the delete item: «Удалить» in the list of boards, «Удалить доску» on the board. */
  deleteLabel?: string
  /** Renames the board; without it, as for anybody but the owner, the menu has no such item. */
  onRename?: () => void
  /** Copies the board into a new board of the user; without it the menu has no such item. */
  onCopy?: () => void
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
  /**
   * The choice of a workspace to bring the board into, which «Перенести в пространство» opens in the menu, given what
   * closes the menu; without it there is no such item.
   */
  workspace?: (close: () => void) => ReactNode
  /**
   * Whether the notifications of the board go to the email and the chat of the user, and what turns them off or on;
   * without it, as for a guest or a user without such channels, there is no such item.
   */
  notifications?: { muted: boolean; onToggle: () => void }
  disabled?: boolean
}

/** What the menu shows: its items, the confirmation of the deletion, the tags or the folder of the board. */
type View = 'items' | 'confirm' | 'tags' | 'folder' | 'workspace'

/**
 * Menu of a board: its owner renames and deletes it, anybody with a role on it copies it, whoever edits it opens its
 * versions, in the list of boards the
 * user gives it their tags and folder, and on the board the user stops or lets its notifications go to their email and
 * chat. Deleting moves it to the owner's trash.
 */
export function BoardActions({
  title,
  deleteLabel = m.delete,
  onRename,
  onCopy,
  onHistory,
  onDelete,
  tags,
  folder,
  workspace,
  notifications,
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
          aria-label={m.boardMenu(title)}
          title={m.boardActions}
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
        {view === 'workspace' && workspace?.(() => setOpen(false))}
        {view === 'confirm' && (
          <div role="alertdialog" aria-label={m.deletingBoard} className="flex flex-col gap-2 p-2">
            <p className="text-sm">{m.deleteBoardConfirm(title)}</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setView('items')}>
                {m.cancel}
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
                {m.delete}
              </Button>
            </div>
          </div>
        )}
        {view === 'items' && (
          <div role="menu" aria-label={m.board(title)} className="flex flex-col">
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
                {m.rename}
              </Button>
            )}
            {onCopy && (
              <Button
                type="button"
                role="menuitem"
                variant="ghost"
                size="sm"
                className={item}
                title="Новая доска с теми же страницами и изображениями, без участников, комментариев и истории"
                onClick={() => {
                  setOpen(false)
                  onCopy()
                }}
              >
                Создать копию
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
                {m.tags}
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
                {m.moveToFolder}
              </Button>
            )}
            {workspace && (
              <Button
                type="button"
                role="menuitem"
                variant="ghost"
                size="sm"
                className={item}
                onClick={() => setView('workspace')}
              >
                {m.moveToWorkspace}
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
                {m.versionHistory}
              </Button>
            )}
            {notifications && (
              <Button
                type="button"
                role="menuitem"
                variant="ghost"
                size="sm"
                className={item}
                title={
                  notifications.muted
                    ? m.unmuteHint
                    : m.muteHint
                }
                onClick={() => {
                  setOpen(false)
                  notifications.onToggle()
                }}
              >
                {notifications.muted ? m.unmute : m.mute}
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
