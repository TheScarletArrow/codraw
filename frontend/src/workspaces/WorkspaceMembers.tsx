import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  changeWorkspaceRole,
  createWorkspaceInvite,
  fetchWorkspaceInvites,
  fetchWorkspaceMembers,
  isLastOwner,
  removeWorkspaceMember,
  revokeWorkspaceInvite,
  workspaceInvitesKey,
  workspaceLimitOf,
  workspaceMembersKey,
  WORKSPACES_QUERY_KEY,
  type Workspace,
  type WorkspaceInvite,
  type WorkspaceRole,
} from '../api/workspaces.ts'
import { ConfirmedAction } from '../board/ConfirmedAction.tsx'
import { counted, inviteUrl } from '../board/members.ts'
import { Avatar } from '../board/MembersSection.tsx'
import { managesWorkspace, mayGive, rolesGivenBy, WORKSPACE_ROLE_LABELS } from './workspaces.ts'

/** How long «Скопировано» replaces «Копировать», in milliseconds. */
const COPIED_DURATION = 2_000

/** Why a change of the members failed. */
function failureOf(error: unknown): string {
  if (isLastOwner(error)) return 'В пространстве должен остаться владелец: сначала сделайте владельцем другого участника'
  const limit = workspaceLimitOf(error)
  if (limit !== null) return `В пространстве уже ${counted(limit.limit, ['участник', 'участника', 'участников'])}`
  return 'Не удалось изменить участников'
}

interface WorkspaceMembersProps {
  workspace: Workspace
  /** The current user. */
  userId: string
}

/**
 * «Участники» of a workspace: everybody with their roles. A member changes the roles of others and removes them as far
 * as their own role lets them, leaves the workspace, and those who manage it invite others by links.
 */
export function WorkspaceMembers({ workspace, userId }: WorkspaceMembersProps) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const members = useQuery({ queryKey: workspaceMembersKey(workspace.id), queryFn: () => fetchWorkspaceMembers(workspace.id) })
  const refetch = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: workspaceMembersKey(workspace.id), exact: true }),
      queryClient.invalidateQueries({ queryKey: ['workspaces', workspace.id], exact: true }),
      // Roles on the boards follow the roles in the workspace.
      queryClient.invalidateQueries({ queryKey: ['workspaces', workspace.id, 'boards'], exact: true }),
    ])
  const change = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: WorkspaceRole | null }) => {
      if (role) await changeWorkspaceRole(workspace.id, memberId, role)
      else await removeWorkspaceMember(workspace.id, memberId)
    },
    onSuccess: refetch,
  })
  const leave = useMutation({
    mutationFn: () => removeWorkspaceMember(workspace.id, userId),
    onSuccess: async () => {
      await navigate('/', { replace: true })
      queryClient.removeQueries({ queryKey: ['workspaces', workspace.id] })
      await queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY, exact: true })
    },
  })
  const failed = change.isError ? change.error : leave.isError ? leave.error : null

  return (
    <section aria-labelledby="workspace-members" className="mt-8 flex flex-col gap-2 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="workspace-members" className="text-lg font-semibold">
          Участники
        </h3>
        <ConfirmedAction
          label="Покинуть пространство"
          title="Уход из пространства"
          confirmLabel="Покинуть"
          variant="outline"
          disabled={leave.isPending}
          onConfirm={() => leave.mutate()}
        >
          Вы потеряете доступ к доскам пространства, а доски, за которые вы отвечаете, перейдут его владельцу.
        </ConfirmedAction>
      </div>
      {members.isPending && <p className="text-sm text-muted-foreground">Загрузка…</p>}
      {members.isError && (
        <p role="alert" className="text-sm text-destructive">
          Не удалось загрузить участников
        </p>
      )}
      {members.data && (
        <ul aria-label="Участники пространства" className="flex flex-col">
          {members.data.map((member) => {
            const manageable = member.id !== userId && mayGive(workspace.role, member.role)
            return (
              <li key={member.id} aria-label={member.name} className="flex items-center gap-2 py-1">
                <Avatar person={member} />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {member.name}
                  {member.id === userId && <span className="text-muted-foreground"> (вы)</span>}
                </span>
                {manageable ? (
                  <>
                    <select
                      aria-label={`Роль: ${member.name}`}
                      className="h-8 rounded-md border bg-background px-1 text-sm"
                      value={member.role}
                      disabled={change.isPending}
                      onChange={(event) => change.mutate({ memberId: member.id, role: event.target.value as WorkspaceRole })}
                    >
                      {rolesGivenBy(workspace.role).map((role) => (
                        <option key={role} value={role}>
                          {WORKSPACE_ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Убрать: ${member.name}`}
                      title="Убрать из пространства"
                      disabled={change.isPending}
                      onClick={() => change.mutate({ memberId: member.id, role: null })}
                    >
                      <X />
                    </Button>
                  </>
                ) : (
                  <span className="text-xs whitespace-nowrap text-muted-foreground">{WORKSPACE_ROLE_LABELS[member.role]}</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {failureOf(failed)}
        </p>
      )}
      {managesWorkspace(workspace.role) && <WorkspaceInvites workspace={workspace} />}
    </section>
  )
}

/** «Пригласить по ссылке» for those who manage the workspace: links with a role they may give, to copy and revoke. */
function WorkspaceInvites({ workspace }: { workspace: Workspace }) {
  const queryClient = useQueryClient()
  const invites = useQuery({ queryKey: workspaceInvitesKey(workspace.id), queryFn: () => fetchWorkspaceInvites(workspace.id) })
  const roles = rolesGivenBy(workspace.role).filter((role) => role !== 'owner')
  const [role, setRole] = useState<WorkspaceRole>('editor')
  const [copied, setCopied] = useState<string | null>(null)
  const refetch = () => queryClient.invalidateQueries({ queryKey: workspaceInvitesKey(workspace.id), exact: true })
  const create = useMutation({ mutationFn: (role: WorkspaceRole) => createWorkspaceInvite(workspace.id, role), onSuccess: refetch })
  const revoke = useMutation({
    mutationFn: (invite: WorkspaceInvite) => revokeWorkspaceInvite(workspace.id, invite.id),
    onSuccess: refetch,
  })

  useEffect(() => {
    if (!copied) return
    const timeout = setTimeout(() => setCopied(null), COPIED_DURATION)
    return () => clearTimeout(timeout)
  }, [copied])

  const copy = async (invite: WorkspaceInvite) => {
    try {
      await navigator.clipboard.writeText(inviteUrl(invite))
      setCopied(invite.id)
    } catch {
      // The address is in the field, ready to be copied by hand.
    }
  }

  const limit = workspaceLimitOf(create.error)
  return (
    <section aria-labelledby="workspace-invites" className="mt-2 flex flex-col gap-1.5">
      <h4 id="workspace-invites" className="text-sm font-medium">
        Пригласить по ссылке
      </h4>
      <p className="text-xs text-muted-foreground">
        Кто откроет ссылку-приглашение и войдёт через GitHub или Google, станет участником пространства с выбранной ролью
        и получит доступ к его доскам.
      </p>
      <div className="flex gap-2">
        <select
          aria-label="Роль приглашённых"
          className="h-8 min-w-0 flex-1 rounded-md border bg-background px-1 text-sm"
          value={role}
          onChange={(event) => setRole(event.target.value as WorkspaceRole)}
        >
          {roles.map((one) => (
            <option key={one} value={one}>
              {WORKSPACE_ROLE_LABELS[one]}
            </option>
          ))}
        </select>
        <Button type="button" size="sm" disabled={create.isPending} onClick={() => create.mutate(role)}>
          Создать ссылку
        </Button>
      </div>
      {create.isError && (
        <p role="alert" className="text-sm text-destructive">
          {limit === null
            ? 'Не удалось создать приглашение'
            : `У пространства уже ${counted(limit.limit, ['приглашение', 'приглашения', 'приглашений'])} — отзовите ненужные`}
        </p>
      )}
      {invites.isError && (
        <p role="alert" className="text-sm text-destructive">
          Не удалось загрузить приглашения
        </p>
      )}
      {invites.data && invites.data.length > 0 && (
        <ul aria-label="Приглашения в пространство" className="flex flex-col gap-2">
          {invites.data.map((invite) => (
            <li key={invite.id} aria-label={`Приглашение: ${WORKSPACE_ROLE_LABELS[invite.role]}`} className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{WORKSPACE_ROLE_LABELS[invite.role]}</span>
              <div className="flex gap-2">
                <input
                  readOnly
                  aria-label="Ссылка-приглашение"
                  value={inviteUrl(invite)}
                  className="h-8 min-w-0 flex-1 rounded-md border bg-muted/50 px-2 text-sm"
                  onFocus={(event) => event.target.select()}
                />
                <Button type="button" variant="outline" size="sm" className="w-28" onClick={() => void copy(invite)}>
                  {copied === invite.id ? 'Скопировано' : 'Копировать'}
                </Button>
                {mayGive(workspace.role, invite.role) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate(invite)}
                  >
                    Отозвать
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
