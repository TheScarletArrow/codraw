import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { boardLimitOf, fetchTrash, purgeTrashedBoard, restoreTrashedBoard, TRASH_QUERY_KEY } from '../api/boards.ts'
import { perLocale } from '../i18n/i18n.ts'
import { boardMessages, trashMessages as m } from './board.messages.ts'

const date = perLocale((tag) => new Intl.DateTimeFormat(tag, { dateStyle: 'medium', timeStyle: 'short' }))

/**
 * Recovery belongs to the owner, and for a board of a workspace to those who manage the workspace; a trashed board cannot
 * be opened by its former participants.
 */
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
      client.invalidateQueries({ queryKey: ['workspaces'] }),
    ])
  }
  const restore = useMutation({ mutationFn: restoreTrashedBoard, onSuccess: refresh })
  const purge = useMutation({ mutationFn: purgeTrashedBoard, onSuccess: refresh })
  const busy = restore.isPending || purge.isPending
  const limit = boardLimitOf(restore.error)

  return (
    <section className="mt-6 border-t pt-4" aria-label={m.region}>
      <Button type="button" variant="outline" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? m.hide : m.show}
      </Button>
      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-muted-foreground">{m.about}</p>
          {trash.isPending && <p role="status">{m.loading}</p>}
          {trash.isError && <p role="alert">{m.loadFailed}</p>}
          {restore.isError && <p role="alert">{limit === null ? m.restoreFailed : m.limitReached(limit)}</p>}
          {purge.isError && <p role="alert">{m.purgeFailed}</p>}
          {trash.data?.length === 0 && <p className="text-sm text-muted-foreground">{m.empty}</p>}
          {trash.data?.map((board) => (
            <div key={board.id} className="rounded-md border p-3">
              <p className="font-medium">{board.title}</p>
              {board.workspace && (
                <p className="text-sm text-muted-foreground">{m.workspace(board.workspace.name)}</p>
              )}
              <p className="text-sm text-muted-foreground">{m.deleted(date().format(new Date(board.deletedAt)), date().format(new Date(board.expiresAt)))}</p>
              {confirm === board.id ? (
                <div role="alertdialog" aria-label={m.purging(board.title)} className="mt-2">
                  <p className="text-sm">{m.purgeConfirm}</p>
                  <Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirm(null)}>{boardMessages.cancel}</Button>
                  <Button type="button" className="bg-destructive text-white hover:bg-destructive/90" disabled={busy} onClick={() => purge.mutate(board.id)}>{m.purgeForever}</Button>
                </div>
              ) : (
                <div className="mt-2 flex gap-2">
                  <Button type="button" variant="outline" disabled={busy} onClick={() => restore.mutate(board.id)}>{m.restore}</Button>
                  <Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirm(board.id)}>{m.purge}</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
