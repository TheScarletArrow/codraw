import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { isNotFound } from '../api/http.ts'
import { acceptWorkspaceInvite, isAccountRequired, workspaceKey, workspaceLimitOf, WORKSPACES_QUERY_KEY } from '../api/workspaces.ts'
import { SignInButtons } from '../auth/SignInButtons.tsx'
import { counted } from '../board/members.ts'
import { workspacePath } from '../workspaces/workspaces.ts'

/** Why the invitation could not be accepted, when the user or the workspace ran into a limit. */
function limitMessage(error: unknown): string | null {
  const limit = workspaceLimitOf(error)
  if (limit === null) return null
  return limit.scope === 'workspaces'
    ? `Можно состоять не больше чем в ${counted(limit.limit, ['пространстве', 'пространствах', 'пространствах'])}: покиньте ненужное`
    : `В пространстве уже ${counted(limit.limit, ['участник', 'участника', 'участников'])}: больше добавить нельзя`
}

/**
 * An invitation link into a workspace: a user signed in through a provider accepts it and lands on the workspace
 * with its role. A guest is offered to sign in, since workspaces need an account.
 */
export function WorkspaceInvitePage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const accept = useMutation({
    mutationFn: acceptWorkspaceInvite,
    onSuccess: async (workspace) => {
      queryClient.setQueryData(workspaceKey(workspace.id), workspace)
      await queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY, exact: true })
      await navigate(workspacePath(workspace.id), { replace: true })
    },
  })
  const { mutate } = accept
  // Accepting twice changes nothing, but React runs the effect twice in development.
  const accepted = useRef<string | null>(null)
  useEffect(() => {
    if (accepted.current === token) return
    accepted.current = token
    mutate(token)
  }, [token, mutate])

  if (!accept.isError) return <p className="p-6 text-muted-foreground">Принимаем приглашение…</p>
  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-3 px-4 py-6">
      {isAccountRequired(accept.error) ? (
        <>
          <h2 className="text-2xl font-semibold">Нужен вход</h2>
          <p className="text-muted-foreground">
            Командные пространства доступны после входа. Войдите и снова откройте
            ссылку-приглашение — ваши доски гостя останутся с вами.
          </p>
          <div className="flex flex-wrap gap-2">
            <SignInButtons />
          </div>
        </>
      ) : isNotFound(accept.error) ? (
        <>
          <h2 className="text-2xl font-semibold">Приглашение недействительно</h2>
          <p className="text-muted-foreground">
            Ссылку-приглашение отозвали, или в ней ошибка. Попросите новую у владельца или администратора пространства.
          </p>
        </>
      ) : (
        <p role="alert" className="text-destructive">
          {limitMessage(accept.error) ?? 'Не удалось принять приглашение. Попробуйте ещё раз.'}
        </p>
      )}
      <Link to="/" className="underline">
        К списку досок
      </Link>
    </section>
  )
}
