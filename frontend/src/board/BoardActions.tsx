import { Ellipsis } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface BoardActionsProps {
  title: string
  /** Label of the delete item: «Удалить» in the list of boards, «Удалить доску» on the board. */
  deleteLabel: string
  onRename: () => void
  /** Called once the user has confirmed the deletion. */
  onDelete: () => void
  disabled?: boolean
}

/** Menu of a board for its owner; deleting asks for confirmation, as a deleted board cannot be restored. */
export function BoardActions({ title, deleteLabel, onRename, onDelete, disabled = false }: BoardActionsProps) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const item = 'justify-start font-normal'

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setConfirming(false)
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
      <PopoverContent align="end" className="w-64 p-1" onCloseAutoFocus={(event) => event.preventDefault()}>
        {confirming ? (
          <div role="alertdialog" aria-label="Удаление доски" className="flex flex-col gap-2 p-2">
            <p className="text-sm">Удалить доску «{title}»? Её нельзя будет восстановить.</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                Отмена
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={() => {
                  setOpen(false)
                  onDelete()
                }}
              >
                Удалить
              </Button>
            </div>
          </div>
        ) : (
          <div role="menu" aria-label={`Доска «${title}»`} className="flex flex-col">
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
            <Button
              type="button"
              role="menuitem"
              variant="ghost"
              size="sm"
              className={cn(item, 'text-destructive hover:text-destructive')}
              onClick={() => setConfirming(true)}
            >
              {deleteLabel}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
