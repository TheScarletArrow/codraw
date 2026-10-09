import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Users } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { createWorkspace, fetchWorkspaces, WORKSPACES_QUERY_KEY, workspaceLimitOf } from '../api/workspaces.ts'
import { useCurrentUser } from '../auth/session.ts'
import { counted } from '../board/members.ts'
import { TitleInput } from '../board/TitleInput.tsx'
import { WORKSPACE_NAME_MAX_LENGTH, WORKSPACE_ROLE_LABELS, workspacePath } from './workspaces.ts'

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
        Командные пространства с общими проектами доступны после входа через GitHub или Google.{' '}
        <Link to="/login" className="underline">
          Войти
        </Link>
      </p>
    )
  }
  const limit = workspaceLimitOf(create.error)
  return (
    <section aria-labelledby="workspaces" className="mt-4 flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="workspaces" className="text-lg font-semibold">
          Пространства
        </h3>
        {creating ? (
          <TitleInput
            title=""
            label="Название пространства"
            placeholder="Название пространства"
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
            Создать пространство
          </Button>
        )}
      </div>
      {create.isError && (
        <p role="alert" className="text-sm text-destructive">
          {limit === null
            ? 'Не удалось создать пространство'
            : `Можно состоять не больше чем в ${counted(limit.limit, ['пространстве', 'пространствах', 'пространствах'])}`}
        </p>
      )}
      {workspaces.isError && (
        <p role="alert" className="text-sm text-destructive">
          Не удалось загрузить пространства
        </p>
      )}
      {workspaces.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Пространство — общее место команды: проекты и доски, доступные всем её участникам по их ролям.
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
                  {WORKSPACE_ROLE_LABELS[workspace.role]} · {counted(workspace.boards, ['доска', 'доски', 'досок'])} ·{' '}
                  {counted(workspace.members, ['участник', 'участника', 'участников'])}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
