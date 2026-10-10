import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { fetchWorkspaces, WORKSPACES_QUERY_KEY, type Workspace } from '../api/workspaces.ts'
import { workspacesMessages as m } from './messages.tsx'
import { createsBoards, workspaceRoleLabel } from './workspaces.ts'

interface WorkspacePickerProps {
  /** The title of the board, which names the menu. */
  title: string
  /** Brings the board into the workspace. */
  onPick: (workspace: Workspace) => void
  disabled?: boolean
}

/**
 * Where a personal board goes: the workspaces where the user creates boards, an editor or more. The board keeps all it
 * has, and the workspace gives its members their roles on it.
 */
export function WorkspacePicker({ title, onPick, disabled = false }: WorkspacePickerProps) {
  const workspaces = useQuery({ queryKey: WORKSPACES_QUERY_KEY, queryFn: fetchWorkspaces })
  const open = (workspaces.data ?? []).filter((workspace) => createsBoards(workspace.role))

  return (
    <div className="flex flex-col gap-1">
      <p className="px-2 pt-1 text-xs text-muted-foreground">
        {m.pickerHint}
      </p>
      {workspaces.isPending && <p className="px-2 py-1 text-sm text-muted-foreground">{m.loading}</p>}
      {workspaces.isError && (
        <p role="alert" className="px-2 py-1 text-sm text-destructive">
          {m.workspacesFailed}
        </p>
      )}
      {workspaces.data && open.length === 0 && (
        <p className="px-2 py-1 text-sm text-muted-foreground">
          {m.noWorkspacesToPick}
        </p>
      )}
      {open.length > 0 && (
        <div role="menu" aria-label={m.workspaceForBoard(title)} className="flex max-h-64 flex-col overflow-y-auto">
          {open.map((workspace) => (
            <Button
              key={workspace.id}
              type="button"
              role="menuitem"
              variant="ghost"
              size="sm"
              className="justify-between font-normal"
              disabled={disabled}
              onClick={() => onPick(workspace)}
            >
              <span className="truncate">{workspace.name}</span>
              <span className="text-xs text-muted-foreground">{workspaceRoleLabel(workspace.role)}</span>
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
