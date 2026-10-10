import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { AccessRequestForm } from './AccessRequestForm.tsx'
import { useOwnAccessRequest } from './accessRequests.ts'
import { shareMessages as m } from './share.messages.ts'

/**
 * «Запросить правку» next to «Только просмотр»: a participant who may only view the board asks its owner for editing.
 * Editing comes without reloading once the owner gives it; the button tells a request that waits or was declined.
 */
export function EditRequestButton({ boardId }: { boardId: string }) {
  const { request, failed, declined, send, cancel } = useOwnAccessRequest(boardId, 'viewer')
  if (request === undefined && !failed) return null

  const label = request ? m.requestSent : declined ? m.requestDeclined : m.requestEdit
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="shrink-0">
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-80 flex-col gap-3" aria-label={m.editRequest}>
        {request ? (
          <>
            <p className="text-sm">{m.editAsked}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate()}
            >
              {m.cancelRequest}
            </Button>
            {cancel.isError && (
              <p role="alert" className="text-sm text-destructive">
                {m.cancelFailed}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {declined ? m.editDeclined : m.editAbout}
            </p>
            <AccessRequestForm
              label={m.editRequest}
              choice={false}
              submitLabel={m.sendRequest}
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
