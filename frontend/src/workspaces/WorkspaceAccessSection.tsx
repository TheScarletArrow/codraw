import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { cn } from '@/lib/utils'
import { changeWorkspaceAccess, type Board, type WorkspaceAccess } from '../api/boards.ts'
import { WORKSPACE_ACCESS_OF_OTHERS, WORKSPACE_ACCESS_OPTIONS, workspacePath } from './workspaces.ts'

interface WorkspaceAccessSectionProps {
  /** A board of a workspace. */
  board: Board
  /** Tells the other participants that the access to the board changed, so that collab checks it. */
  onChanged: () => void
}

/**
 * «Доступ участникам пространства» in the window «Поделиться» of a board of a workspace: who manages the board chooses
 * what the workspace gives its editors and viewers on it, the others see what it gives. Owners and administrators of the
 * workspace manage the board whatever it is.
 */
export function WorkspaceAccessSection({ board, onChanged }: WorkspaceAccessSectionProps) {
  const queryClient = useQueryClient()
  const [chosen, setChosen] = useState<WorkspaceAccess | null>(null)
  const change = useMutation({
    mutationFn: (access: WorkspaceAccess) => changeWorkspaceAccess(board.id, access),
    onSuccess: (changed) => {
      queryClient.setQueryData(['boards', board.id], changed)
      onChanged()
    },
    onSettled: () => setChosen(null),
  })
  const workspace = board.workspace
  if (!workspace) return null
  const access = chosen ?? board.workspaceAccess ?? 'edit'
  const name = (
    <Link to={workspacePath(workspace.id)} className="underline">
      {workspace.name}
    </Link>
  )

  if (board.role !== 'owner') {
    return (
      <p className="border-t pt-3 text-sm text-muted-foreground">
        Доска пространства «{name}». {WORKSPACE_ACCESS_OF_OTHERS[access]}.
      </p>
    )
  }
  return (
    <fieldset className="flex flex-col gap-1 border-t pt-3" disabled={change.isPending}>
      <legend className="mb-1 text-sm font-medium">Доступ участникам пространства</legend>
      <p className="mb-1 text-xs text-muted-foreground">
        Доска пространства «{name}». Владельцы и администраторы пространства управляют ею всегда.
      </p>
      {WORKSPACE_ACCESS_OPTIONS.map((option) => (
        <label
          key={option.value}
          className={cn(
            'flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-accent',
            access === option.value && 'bg-accent',
          )}
        >
          <input
            type="radio"
            name="workspace-access"
            value={option.value}
            checked={access === option.value}
            aria-describedby={`workspace-access-${option.value}`}
            className="mt-1"
            onChange={() => {
              setChosen(option.value)
              change.mutate(option.value)
            }}
          />
          <span className="flex flex-col">
            <span className="text-sm">{option.label}</span>
            <span id={`workspace-access-${option.value}`} className="text-xs text-muted-foreground">
              {option.description}
            </span>
          </span>
        </label>
      ))}
      {change.isError && (
        <p role="alert" className="text-sm text-destructive">
          Не удалось изменить доступ
        </p>
      )}
    </fieldset>
  )
}
