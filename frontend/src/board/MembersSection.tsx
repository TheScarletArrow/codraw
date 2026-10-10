import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Crown, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
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
import { fetchWorkspaceMembers, workspaceMembersKey } from '../api/workspaces.ts'
import { membersKey, visitorsKey } from './members.ts'
import { shareMessages as m } from './share.messages.ts'

/** Why a change of the members failed, when it ran into a limit. */
function failureOf(error: unknown, transferring: boolean): string {
  if (transferring) {
    const boards = boardLimitOf(error)
    if (boards === null) return m.transferFailed
    return m.ownerLimit(boards)
  }
  const members = limitOf(error)
  if (members === null) return m.membersFailed
  return m.memberLimit(members)
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
  const workspaceId = board.workspace?.id
  // Who manages a board of a workspace gives its members roles of their own on it, above what the workspace gives.
  const workspaceMembers = useQuery({
    queryKey: workspaceMembersKey(workspaceId ?? ''),
    queryFn: () => fetchWorkspaceMembers(workspaceId ?? ''),
    enabled: isOwner && workspaceId !== undefined,
  })
  const [confirming, setConfirming] = useState<Participant | null>(null)
  const [adding, setAdding] = useState('')

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
        {m.members}
      </h3>
      {members.isPending && <p className="text-sm text-muted-foreground">{m.loading}</p>}
      {members.isError && (
        <p role="alert" className="text-sm text-destructive">
          {m.membersLoadFailed}
        </p>
      )}
      {members.data && (
        <ul aria-label={m.boardMembers} className="flex flex-col">
          {members.data.map((participant) => (
            <li key={participant.id} aria-label={participant.name} className="flex items-center gap-2 py-0.5">
              <Avatar person={participant} />
              <span className="min-w-0 flex-1 truncate text-sm">{participant.name}</span>
              {isOwner && participant.role !== 'owner' ? (
                <>
                  <select
                    aria-label={m.roleOf(participant.name)}
                    className="h-8 rounded-md border bg-background px-1 text-sm"
                    value={participant.role}
                    disabled={pending}
                    onChange={(event) =>
                      change.mutate({ userId: participant.id, role: event.target.value as MemberRole })
                    }
                  >
                    <option value="editor">{m.roles.editor}</option>
                    <option value="viewer">{m.roles.viewer}</option>
                  </select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={m.makeOwner}
                    title={m.makeOwner}
                    disabled={pending}
                    onClick={() => setConfirming(participant)}
                  >
                    <Crown />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={m.remove}
                    title={m.remove}
                    disabled={pending}
                    onClick={() => change.mutate({ userId: participant.id, role: null })}
                  >
                    <X />
                  </Button>
                </>
              ) : (
                <span className="text-xs whitespace-nowrap text-muted-foreground">{m.roles[participant.role]}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {confirming && (
        <div role="alertdialog" aria-label={m.transferring} className="flex flex-col gap-2 rounded-md border p-2">
          <p className="text-sm">
            {m.transferConfirm(confirming.name, m.roles.editor)}
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(null)}>
              {m.cancel}
            </Button>
            <Button type="button" size="sm" disabled={transfer.isPending} onClick={() => transfer.mutate(confirming.id)}>
              {m.makeOwner}
            </Button>
          </div>
        </div>
      )}
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {failureOf(failed, transfer.isError)}
        </p>
      )}
      {isOwner && workspaceMembers.data && (
        <WorkspaceMemberAdder
          candidates={workspaceMembers.data.filter(
            (member) => !members.data?.some((participant) => participant.id === member.id),
          )}
          value={adding}
          onChange={setAdding}
          disabled={pending}
          onAdd={(userId, role) => {
            setAdding('')
            change.mutate({ userId, role })
          }}
        />
      )}
      {isOwner && visitors.data && visitors.data.length > 0 && (
        <section aria-labelledby="board-visitors" className="mt-1 flex flex-col gap-1">
          <h4 id="board-visitors" className="text-xs font-medium text-muted-foreground">
            {m.visitors}
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
                  {m.add}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  )
}

interface WorkspaceMemberAdderProps {
  /** Members of the workspace of the board who are neither its owner nor its members. */
  candidates: { id: string; name: string }[]
  /** The chosen member. */
  value: string
  onChange: (userId: string) => void
  disabled: boolean
  onAdd: (userId: string, role: MemberRole) => void
}

/** «Добавить участника пространства»: a member of the workspace gets a role of their own on its board. */
function WorkspaceMemberAdder({ candidates, value, onChange, disabled, onAdd }: WorkspaceMemberAdderProps) {
  const [role, setRole] = useState<MemberRole>('editor')
  if (candidates.length === 0) return null
  return (
    <section aria-labelledby="board-workspace-members" className="mt-1 flex flex-col gap-1">
      <h4 id="board-workspace-members" className="text-xs font-medium text-muted-foreground">
        {m.addWorkspaceMember}
      </h4>
      <div className="flex gap-2">
        <select
          aria-label={m.workspaceMember}
          className="h-8 min-w-0 flex-1 rounded-md border bg-background px-1 text-sm"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">{m.chooseMember}</option>
          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </select>
        <select
          aria-label={m.boardRole}
          className="h-8 rounded-md border bg-background px-1 text-sm"
          value={role}
          onChange={(event) => setRole(event.target.value as MemberRole)}
        >
          <option value="editor">{m.roles.editor}</option>
          <option value="viewer">{m.roles.viewer}</option>
        </select>
        <Button type="button" variant="outline" size="sm" disabled={disabled || value === ''} onClick={() => onAdd(value, role)}>
          {m.add}
        </Button>
      </div>
    </section>
  )
}

/** The picture of the profile of a user, or the first letter of their name. */
export function Avatar({
  person,
  className,
}: {
  person: { name: string; avatarUrl: string | null }
  className?: string
}) {
  return person.avatarUrl ? (
    <img src={person.avatarUrl} alt="" className={cn('size-6 shrink-0 rounded-full', className)} />
  ) : (
    <span
      aria-hidden
      className={cn('flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs', className)}
    >
      {person.name.charAt(0).toUpperCase()}
    </span>
  )
}
