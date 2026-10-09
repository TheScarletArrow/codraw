import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { boardLimitOf, fetchTrash, purgeTrashedBoard, restoreTrashedBoard, TRASH_QUERY_KEY } from '../api/boards.ts'

const date = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })

/** Recovery belongs only to the owner; a trashed board cannot be opened by its former participants. */
export function BoardTrash() {
  const client = useQueryClient()
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)
  const trash = useQuery({ queryKey: TRASH_QUERY_KEY, queryFn: fetchTrash, enabled: open, staleTime: 0 })
  const refresh = async () => {
    setConfirm(null)
    await Promise.all([
      client.invalidateQueries({ queryKey: TRASH_QUERY_KEY }),
      client.invalidateQueries({ queryKey: ['boards'] }),
      client.invalidateQueries({ queryKey: ['shared-boards'] }),
    ])
  }
  const restore = useMutation({ mutationFn: restoreTrashedBoard, onSuccess: refresh })
  const purge = useMutation({ mutationFn: purgeTrashedBoard, onSuccess: refresh })
  const busy = restore.isPending || purge.isPending
  const limit = boardLimitOf(restore.error)

  return (
    <section className="mt-6 border-t pt-4" aria-label="Корзина досок">
      <Button type="button" variant="outline" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Скрыть корзину' : 'Корзина'}
      </Button>
      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-muted-foreground">Доски хранятся здесь 30 дней. После этого они удаляются окончательно.</p>
          {trash.isPending && <p role="status">Загрузка корзины…</p>}
          {trash.isError && <p role="alert">Не удалось загрузить корзину</p>}
          {restore.isError && <p role="alert">{limit === null ? 'Не удалось восстановить доску. Возможно, срок хранения истёк.' : `Достигнут лимит ${limit} досок. Переместите ненужную доску в корзину и повторите восстановление.`}</p>}
          {purge.isError && <p role="alert">Не удалось удалить доску окончательно</p>}
          {trash.data?.length === 0 && <p className="text-sm text-muted-foreground">Корзина пуста</p>}
          {trash.data?.map((board) => (
            <div key={board.id} className="rounded-md border p-3">
              <p className="font-medium">{board.title}</p>
              <p className="text-sm text-muted-foreground">Удалена {date.format(new Date(board.deletedAt))}. Хранится до {date.format(new Date(board.expiresAt))}.</p>
              {confirm === board.id ? (
                <div role="alertdialog" aria-label={`Окончательное удаление «${board.title}»`} className="mt-2">
                  <p className="text-sm">Удалить доску окончательно? Восстановить её будет невозможно.</p>
                  <Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirm(null)}>Отмена</Button>
                  <Button type="button" className="bg-destructive text-white hover:bg-destructive/90" disabled={busy} onClick={() => purge.mutate(board.id)}>Удалить навсегда</Button>
                </div>
              ) : (
                <div className="mt-2 flex gap-2">
                  <Button type="button" variant="outline" disabled={busy} onClick={() => restore.mutate(board.id)}>Восстановить</Button>
                  <Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirm(board.id)}>Удалить окончательно</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
