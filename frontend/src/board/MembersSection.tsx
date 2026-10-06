import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Crown, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { boardLimitOf, SHARED_BOARDS_QUERY_KEY, type Board } from '../api/boards.ts'
import {
  fetchMembers,
  fetchVisitors,
  limitOf,
  removeMember,
  setMemberRole,
  transferOwnership,
  type MemberRole,
  type Participant,
} from '../api/members.ts'
import { counted, membersKey, ROLE_LABELS, visitorsKey } from './members.ts'

/** Why a change of the members failed, when it ran into a limit. */
function failureOf(error: unknown, transferring: boolean): string {
  if (transferring) {
    const boards = boardLimitOf(error)
    if (boards === null) return 'Не удалось передать владение'
    return `Новый владелец уже владеет ${counted(boards, ['доской', 'досками', 'досками'])} — больше нельзя`
  }
  const members = limitOf(error)
  if (members === null) return 'Не удалось изменить участников'
  return `На доске уже ${counted(members, ['участник', 'участника', 'участников'])} — больше добавить нельзя`
}

interface MembersSectionProps {
  board: Board
  /** Tells the other participants that the access to the board changed, so that collab checks it. */
  onChanged: () => void
}

/**
 * «Участники»: the owner and the members of the board with their roles. The owner changes the roles, removes members,
 * gives the board to a member and adds those who opened the board through its link; the others see the list only.
 */
export function MembersSection({ board, onChanged }: MembersSectionProps) {
  const queryClient = useQueryClient()
  const isOwner = board.role === 'owner'
  const members = useQuery({ queryKey: membersKey(board.id), queryFn: () => fetchMembers(board.id) })
  const visitors = useQuery({ queryKey: visitorsKey(board.id), queryFn: () => fetchVisitors(board.id), enabled: isOwner })
  const [confirming, setConfirming] = useState<Participant | null>(null)

  const refetch = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: membersKey(board.id), exact: true }),
      queryClient.invalidateQueries({ queryKey: visitorsKey(board.id), exact: true }),
    ])
  const changed = () => {
    onChanged()
    return refetch()
  }
  // A role gives the user that role on the board, none removes them from the members.
  const change = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: MemberRole | null }) => {
      if (role) await setMemberRole(board.id, userId, role)
      else await removeMember(board.id, userId)
    },
    onSuccess: changed,
  })
  const transfer = useMutation({
    mutationFn: (userId: string) => transferOwnership(board.id, userId),
    onSuccess: async (previousOwnersBoard) => {
      setConfirming(null)
      queryClient.setQueryData(['boards', board.id], previousOwnersBoard)
      await changed()
      // The board leaves the own boards of its previous owner and is shared with them now.
      await queryClient.invalidateQueries({ queryKey: ['boards'], exact: true })
      await queryClient.invalidateQueries({ queryKey: SHARED_BOARDS_QUERY_KEY })
    },
  })
  const pending = change.isPending || transfer.isPending
  const failed = transfer.isError ? transfer.error : change.isError ? change.error : null

  return (
    <section aria-labelledby="board-members" className="flex flex-col gap-1.5 border-t pt-3">
      <h3 id="board-members" className="text-sm font-medium">
        Участники
      </h3>
      {members.isPending && <p className="text-sm text-muted-foreground">Загрузка…</p>}
      {members.isError && (
        <p role="alert" className="text-sm text-destructive">
          Не удалось загрузить участников
        </p>
      )}
      {members.data && (
        <ul aria-label="Участники доски" className="flex flex-col">
          {members.data.map((participant) => (
            <li key={participant.id} aria-label={participant.name} className="flex items-center gap-2 py-0.5">
              <Avatar person={participant} />
              <span className="min-w-0 flex-1 truncate text-sm">{participant.name}</span>
              {isOwner && participant.role !== 'owner' ? (
                <>
                  <select
                    aria-label={`Роль: ${participant.name}`}
                    className="h-8 rounded-md border bg-background px-1 text-sm"
                    value={participant.role}
                    disabled={pending}
                    onChange={(event) =>
                      change.mutate({ userId: participant.id, role: event.target.value as MemberRole })
                    }
                  >
                    <option value="editor">{ROLE_LABELS.editor}</option>
                    <option value="viewer">{ROLE_LABELS.viewer}</option>
                  </select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Сделать владельцем"
                    title="Сделать владельцем"
                    disabled={pending}
                    onClick={() => setConfirming(participant)}
                  >
                    <Crown />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Убрать"
                    title="Убрать"
                    disabled={pending}
                    onClick={() => change.mutate({ userId: participant.id, role: null })}
                  >
                    <X />
                  </Button>
                </>
              ) : (
                <span className="text-xs whitespace-nowrap text-muted-foreground">{ROLE_LABELS[participant.role]}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {confirming && (
        <div role="alertdialog" aria-label="Передача владения" className="flex flex-col gap-2 rounded-md border p-2">
          <p className="text-sm">
            {confirming.name} станет владельцем доски, а вы останетесь на ней с ролью «{ROLE_LABELS.editor}».
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(null)}>
              Отмена
            </Button>
            <Button type="button" size="sm" disabled={transfer.isPending} onClick={() => transfer.mutate(confirming.id)}>
              Сделать владельцем
            </Button>
          </div>
        </div>
      )}
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {failureOf(failed, transfer.isError)}
        </p>
      )}
      {isOwner && visitors.data && visitors.data.length > 0 && (
        <section aria-labelledby="board-visitors" className="mt-1 flex flex-col gap-1">
          <h4 id="board-visitors" className="text-xs font-medium text-muted-foreground">
            Открывали по ссылке
          </h4>
          <ul className="flex flex-col">
            {visitors.data.map((visitor) => (
              <li key={visitor.id} aria-label={visitor.name} className="flex items-center gap-2 py-0.5">
                <Avatar person={visitor} />
                <span className="min-w-0 flex-1 truncate text-sm">{visitor.name}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => change.mutate({ userId: visitor.id, role: 'editor' })}
                >
                  Добавить
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  )
}

function Avatar({ person }: { person: { name: string; avatarUrl: string | null } }) {
  return person.avatarUrl ? (
    <img src={person.avatarUrl} alt="" className="size-6 shrink-0 rounded-full" />
  ) : (
    <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs">
      {person.name.charAt(0).toUpperCase()}
    </span>
  )
}
