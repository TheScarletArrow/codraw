import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { AccessRequestForm } from './AccessRequestForm.tsx'
import { useOwnAccessRequest } from './accessRequests.ts'

/**
 * «Запросить правку» next to «Только просмотр»: a participant who may only view the board asks its owner for editing.
 * Editing comes without reloading once the owner gives it; the button tells a request that waits or was declined.
 */
export function EditRequestButton({ boardId }: { boardId: string }) {
  const { request, failed, declined, send, cancel } = useOwnAccessRequest(boardId, 'viewer')
  if (request === undefined && !failed) return null

  const label = request ? 'Запрос отправлен' : declined ? 'Запрос отклонён' : 'Запросить правку'
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="shrink-0">
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-80 flex-col gap-3" aria-label="Запрос правки">
        {request ? (
          <>
            <p className="text-sm">Вы попросили правку. Она появится здесь, как только владелец её даст.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate()}
            >
              Отменить запрос
            </Button>
            {cancel.isError && (
              <p role="alert" className="text-sm text-destructive">
                Не удалось отменить запрос
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {declined ? 'Владелец отклонил запрос. Можно попросить снова.' : 'Владелец доски получит запрос на правку.'}
            </p>
            <AccessRequestForm
              label="Запрос правки"
              choice={false}
              submitLabel="Отправить запрос"
              pending={send.isPending}
              error={send.error}
              onSubmit={(wish) => send.mutate(wish)}
            />
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
