import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { AccessRequestForm } from './AccessRequestForm.tsx'
import { useOwnAccessRequest } from './accessRequests.ts'
import { ROLE_LABELS } from './members.ts'

/**
 * «Нет доступа» on the page of a board that the user may not open, where they ask its owner for access. The page asks
 * for the board from time to time and opens it once the owner gives access; this screen tells a declined request.
 * `children` come under the message, e.g. the edits of the local copy that did not reach the board.
 */
export function NoAccess({ boardId, children }: { boardId: string; children?: ReactNode }) {
  const { request, failed, declined, send, cancel } = useOwnAccessRequest(boardId, null)

  return (
    <div className="flex max-w-md flex-col gap-4 p-6">
      <p role="alert" className="text-destructive">
        Нет доступа: владелец закрыл доступ к доске по ссылке
      </p>
      {children}
      {request ? (
        <section aria-labelledby="access-request-sent" className="flex flex-col gap-2">
          <h2 id="access-request-sent" className="font-medium">
            Запрос отправлен
          </h2>
          <p className="text-sm text-muted-foreground">
            Вы попросили «{ROLE_LABELS[request.role]}». Доска откроется здесь, как только владелец даст доступ.
          </p>
          {request.message && (
            <blockquote className="border-l-2 pl-2 text-sm break-words whitespace-pre-wrap">{request.message}</blockquote>
          )}
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
        </section>
      ) : (
        (request === null || failed) && (
          <section aria-labelledby="access-request" className="flex flex-col gap-3">
            <h2 id="access-request" className="font-medium">
              {declined ? 'Запрос отклонён' : 'Попросите доступ у владельца'}
            </h2>
            {declined && (
              <p className="text-sm text-muted-foreground">Владелец не дал доступ. Можно попросить снова.</p>
            )}
            <AccessRequestForm
              label="Запрос доступа"
              choice
              submitLabel="Запросить доступ"
              pending={send.isPending}
              error={send.error}
              onSubmit={(wish) => send.mutate(wish)}
            />
          </section>
        )
      )}
    </div>
  )
}
