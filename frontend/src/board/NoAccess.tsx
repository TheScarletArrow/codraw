import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { AccessRequestForm } from './AccessRequestForm.tsx'
import { useOwnAccessRequest } from './accessRequests.ts'
import { shareMessages as m } from './share.messages.ts'

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
        {m.noAccess}
      </p>
      {children}
      {request ? (
        <section aria-labelledby="access-request-sent" className="flex flex-col gap-2">
          <h2 id="access-request-sent" className="font-medium">
            {m.requestSent}
          </h2>
          <p className="text-sm text-muted-foreground">
            {m.accessAsked(m.roles[request.role])}
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
            {m.cancelRequest}
          </Button>
          {cancel.isError && (
            <p role="alert" className="text-sm text-destructive">
              {m.cancelFailed}
            </p>
          )}
        </section>
      ) : (
        (request === null || failed) && (
          <section aria-labelledby="access-request" className="flex flex-col gap-3">
            <h2 id="access-request" className="font-medium">
              {declined ? m.requestDeclined : m.askOwner}
            </h2>
            {declined && (
              <p className="text-sm text-muted-foreground">{m.accessDeclined}</p>
            )}
            <AccessRequestForm
              label={m.accessRequest}
              choice
              submitLabel={m.requestAccess}
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
