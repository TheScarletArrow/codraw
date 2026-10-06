import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { declineAccessRequest, grantAccess, type AccessRequest } from '../api/accessRequests.ts'
import type { Board } from '../api/boards.ts'
import { isNotFound } from '../api/http.ts'
import { limitOf, type MemberRole } from '../api/members.ts'
import { accessRequestsKey } from './accessRequests.ts'
import { counted, membersKey, visitorsKey } from './members.ts'
import { Avatar } from './MembersSection.tsx'

const timeFormat = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })

/** What the user asks for, in the words of the roles. */
const WISHES: Record<MemberRole, string> = {
  editor: 'Просит редактирование',
  viewer: 'Просит просмотр',
}

/** Why an answer failed. */
function failureOf(error: unknown): string {
  if (isNotFound(error)) return 'Запрос уже отменён или изменён — посмотрите его ещё раз'
  const members = limitOf(error)
  if (members === null) return 'Не удалось ответить на запрос'
  return `На доске уже ${counted(members, ['участник', 'участника', 'участников'])} — больше добавить нельзя`
}

interface AccessRequestsSectionProps {
  board: Board
  /** The requests for access that wait for an answer, oldest first. */
  requests: AccessRequest[] | undefined
  /** Tells the other participants that the access to the board changed, so that collab checks it. */
  onChanged: () => void
}

/**
 * «Запросы доступа» for the owner: who asks for which role and why. The owner gives editing or viewing, which makes
 * the user a member, or declines; either answers the request.
 */
export function AccessRequestsSection({ board, requests, onChanged }: AccessRequestsSectionProps) {
  const queryClient = useQueryClient()
  const refetch = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: accessRequestsKey(board.id), exact: true }),
      queryClient.invalidateQueries({ queryKey: membersKey(board.id), exact: true }),
      queryClient.invalidateQueries({ queryKey: visitorsKey(board.id), exact: true }),
    ])
  // A role gives the user that role on the board, none declines the request.
  const answer = useMutation({
    mutationFn: async ({ request, role }: { request: AccessRequest; role: MemberRole | null }) => {
      if (role) await grantAccess(board.id, request.id, role)
      else await declineAccessRequest(board.id, request.id)
    },
    onSuccess: (_, { role }) => {
      // A participant who views the board gets editing over their open connection.
      if (role) onChanged()
      return refetch()
    },
    // The user replaced or cancelled the request meanwhile: the list shows what is there now.
    onError: (error) => {
      if (isNotFound(error)) void refetch()
    },
  })

  if (!requests?.length && !answer.isError) return null
  return (
    <section aria-labelledby="board-access-requests" className="flex flex-col gap-1.5 border-t pt-3">
      <h3 id="board-access-requests" className="text-sm font-medium">
        Запросы доступа
      </h3>
      {requests && requests.length > 0 && (
        <ul aria-label="Запросы доступа к доске" className="flex flex-col gap-2">
          {requests.map((request) => (
            <li key={request.id} aria-label={request.name} className="flex flex-col gap-1.5 rounded-md border p-2">
              <div className="flex items-center gap-2">
                <Avatar person={request} />
                <span className="min-w-0 flex-1 truncate text-sm">{request.name}</span>
                <time dateTime={request.createdAt} className="text-xs whitespace-nowrap text-muted-foreground">
                  {timeFormat.format(new Date(request.createdAt))}
                </time>
              </div>
              <span className="text-xs text-muted-foreground">{WISHES[request.role]}</span>
              {request.message && <p className="text-sm break-words whitespace-pre-wrap">{request.message}</p>}
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  disabled={answer.isPending}
                  onClick={() => answer.mutate({ request, role: 'editor' })}
                >
                  Дать редактирование
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={answer.isPending}
                  onClick={() => answer.mutate({ request, role: 'viewer' })}
                >
                  Дать просмотр
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={answer.isPending}
                  onClick={() => answer.mutate({ request, role: null })}
                >
                  Отклонить
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {answer.isError && (
        <p role="alert" className="text-sm text-destructive">
          {failureOf(answer.error)}
        </p>
      )}
    </section>
  )
}
