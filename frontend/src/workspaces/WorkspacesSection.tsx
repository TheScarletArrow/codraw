import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Users } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { createWorkspace, fetchWorkspaces, WORKSPACES_QUERY_KEY, workspaceLimitOf } from '../api/workspaces.ts'
import { useCurrentUser } from '../auth/session.ts'
import { TitleInput } from '../board/TitleInput.tsx'
import { workspacesMessages as m } from './messages.tsx'
import { WORKSPACE_NAME_MAX_LENGTH, workspacePath, workspaceRoleLabel } from './workspaces.ts'

/**
 * «Пространства» on the main page: the team workspaces of the user with their roles, and «Создать пространство», which
 * opens the new workspace. A guest has none and is offered to sign in.
 */
export function WorkspacesSection() {
  const user = useCurrentUser()
  const guest = user.data?.guest ?? true
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const workspaces = useQuery({ queryKey: WORKSPACES_QUERY_KEY, queryFn: fetchWorkspaces, enabled: !guest })
  const [creating, setCreating] = useState(false)
  const create = useMutation({
    mutationFn: createWorkspace,
    onSuccess: async (workspace) => {
      await queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY, exact: true })
      await navigate(workspacePath(workspace.id))
    },
  })

  if (user.data === undefined) return null
  if (guest) {
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        {m.guestHint}{' '}
        <Link to="/login" className="underline">
          {m.signIn}
        </Link>
      </p>
    )
  }
  const limit = workspaceLimitOf(create.error)
  return (
    <section aria-labelledby="workspaces" className="mt-4 flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="workspaces" className="text-lg font-semibold">
          {m.workspaces}
        </h3>
        {creating ? (
          <TitleInput
            title=""
            label={m.workspaceName}
            placeholder={m.workspaceName}
            maxLength={WORKSPACE_NAME_MAX_LENGTH}
            className="w-64 py-1"
            onDone={(name) => {
              setCreating(false)
              if (name !== null) create.mutate(name)
            }}
          />
        ) : (
          <Button type="button" variant="outline" size="sm" disabled={create.isPending} onClick={() => setCreating(true)}>
            <Users />
            {m.createWorkspace}
          </Button>
        )}
      </div>
      {create.isError && (
        <p role="alert" className="text-sm text-destructive">
          {limit === null
            ? m.createFailed
            : m.workspacesLimit(limit.limit)}
        </p>
      )}
      {workspaces.isError && (
        <p role="alert" className="text-sm text-destructive">
          {m.workspacesFailed}
        </p>
      )}
      {workspaces.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {m.workspacesIntro}
        </p>
      )}
      {workspaces.data && workspaces.data.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {workspaces.data.map((workspace) => (
            <li key={workspace.id}>
              <Link
                to={workspacePath(workspace.id)}
                className="flex min-w-48 flex-col rounded-md border px-3 py-2 hover:bg-accent"
              >
                <span className="truncate font-medium">{workspace.name}</span>
                <span className="text-xs text-muted-foreground">
                  {workspaceRoleLabel(workspace.role)} · {m.boards(workspace.boards)} · {m.membersCount(workspace.members)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
