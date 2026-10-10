import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Ellipsis } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { boardLimitOf, deleteBoard, OWN_BOARDS_QUERY_KEY, TRASH_QUERY_KEY } from '../api/boards.ts'
import { isNotFound } from '../api/http.ts'
import {
  createProject,
  createWorkspaceBoard,
  deleteProject,
  deleteWorkspace,
  fetchProjects,
  fetchWorkspace,
  fetchWorkspaceBoards,
  isProjectNameTaken,
  moveBoardToWorkspace,
  renameProject,
  renameWorkspace,
  workspaceBoardsKey,
  workspaceKey,
  workspaceLimitOf,
  workspaceProjectsKey,
  WORKSPACES_QUERY_KEY,
  type Workspace,
  type WorkspaceBoard,
  type WorkspaceProject,
} from '../api/workspaces.ts'
import { useCurrentUser } from '../auth/session.ts'
import { BoardActions } from '../board/BoardActions.tsx'
import { ConfirmedAction } from '../board/ConfirmedAction.tsx'
import { useCopyBoard } from '../board/copyBoard.ts'
import { TitleInput } from '../board/TitleInput.tsx'
import { deleteLocalCopiesOfBoard } from '../offline/localCopies.ts'
import { ProjectBar } from '../workspaces/ProjectBar.tsx'
import { WorkspaceMembers } from '../workspaces/WorkspaceMembers.tsx'
import {
  ALL_PROJECTS,
  createsBoards,
  inProject,
  managesWorkspace,
  WORKSPACE_NAME_MAX_LENGTH,
  workspaceRoleLabel,
  type ProjectFilter,
} from '../workspaces/workspaces.ts'
import { perLocale } from '../i18n/i18n.ts'
import { workspacePageMessages as m } from './WorkspacePage.messages.ts'

const dateFormat = perLocale((tag) => new Intl.DateTimeFormat(tag, { dateStyle: 'medium', timeStyle: 'short' }))

/** Why a change of the projects did not happen. */
function projectErrorOf(error: unknown): string {
  if (isProjectNameTaken(error)) return m.projectNameTaken
  const limit = workspaceLimitOf(error)
  if (limit !== null) return m.projectsLimit(limit.limit)
  return m.projectsChangeFailed
}

/**
 * A team workspace: its name, projects and the boards that the user has a role on, with what they may do by their role
 * — create boards, keep projects, move and delete boards — and its members.
 */
export function WorkspacePage() {
  const { workspaceId = '' } = useParams()
  const user = useCurrentUser()
  const workspace = useQuery({ queryKey: workspaceKey(workspaceId), queryFn: () => fetchWorkspace(workspaceId) })

  if (workspace.isPending) return <p className="p-6 text-muted-foreground">{m.loading}</p>
  if (workspace.isError) {
    return (
      <section className="mx-auto flex w-full max-w-xl flex-col gap-3 px-4 py-6">
        {isNotFound(workspace.error) ? (
          <>
            <h2 className="text-2xl font-semibold">{m.notFound}</h2>
            <p className="text-muted-foreground">{m.notFoundHint}</p>
          </>
        ) : (
          <p role="alert" className="text-destructive">
            {m.loadFailed}
          </p>
        )}
        <Link to="/" className="underline">
          {m.toBoards}
        </Link>
      </section>
    )
  }
  return <WorkspaceView workspace={workspace.data} userId={user.data?.id ?? ''} />
}

function WorkspaceView({ workspace, userId }: { workspace: Workspace; userId: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const manages = managesWorkspace(workspace.role)
  const boards = useQuery({ queryKey: workspaceBoardsKey(workspace.id), queryFn: () => fetchWorkspaceBoards(workspace.id) })
  const projects = useQuery({ queryKey: workspaceProjectsKey(workspace.id), queryFn: () => fetchProjects(workspace.id) })
  const [filter, setFilter] = useState<ProjectFilter>(ALL_PROJECTS)
  const [renaming, setRenaming] = useState(false)
  const projectList = projects.data ?? []
  // A project that is gone filters nothing.
  const chosen = filter.kind === 'project' && !projectList.some((one) => one.id === filter.id) ? ALL_PROJECTS : filter
  const refreshWorkspace = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: workspaceKey(workspace.id), exact: true }),
      queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY, exact: true }),
    ])
  const refreshProjects = () => queryClient.invalidateQueries({ queryKey: workspaceProjectsKey(workspace.id), exact: true })
  const rename = useMutation({
    mutationFn: (name: string) => renameWorkspace(workspace.id, name),
    onSuccess: (renamed) => {
      queryClient.setQueryData(workspaceKey(workspace.id), renamed)
      return refreshWorkspace()
    },
  })
  const create = useMutation({
    mutationFn: () => createWorkspaceBoard(workspace.id, m.newBoardTitle, chosen.kind === 'project' ? chosen.id : null),
    onSuccess: async (board) => {
      await refreshWorkspace()
      await navigate(`/boards/${board.id}`)
    },
  })
  const addProject = useMutation({ mutationFn: (name: string) => createProject(workspace.id, name), onSuccess: refreshProjects })
  const changeProject = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameProject(workspace.id, id, name),
    onSuccess: refreshProjects,
  })
  const removeProject = useMutation({
    mutationFn: (id: string) => deleteProject(workspace.id, id),
    onSuccess: () =>
      Promise.all([
        refreshProjects(),
        queryClient.invalidateQueries({ queryKey: workspaceBoardsKey(workspace.id), exact: true }),
      ]),
  })
  const remove = useMutation({
    mutationFn: () => deleteWorkspace(workspace.id),
    onSuccess: async () => {
      await navigate('/', { replace: true })
      queryClient.removeQueries({ queryKey: ['workspaces', workspace.id] })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY, exact: true }),
        queryClient.invalidateQueries({ queryKey: TRASH_QUERY_KEY }),
      ])
    },
  })
  const projectError = addProject.isError
    ? projectErrorOf(addProject.error)
    : changeProject.isError
      ? projectErrorOf(changeProject.error)
      : removeProject.isError
        ? m.projectDeleteFailed
        : null
  const shown = (boards.data ?? []).filter((board) => inProject(chosen, board.projectId))
  const boardLimit = boardLimitOf(create.error)

  return (
    <section className="mx-auto w-full max-w-3xl overflow-auto px-4 py-6">
      <nav aria-label={m.breadcrumbs} className="text-sm text-muted-foreground">
        <Link to="/" className="hover:underline">
          {m.boards}
        </Link>{' '}
        / {m.workspace}
      </nav>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          {renaming ? (
            <TitleInput
              title={workspace.name}
              label={m.workspaceName}
              maxLength={WORKSPACE_NAME_MAX_LENGTH}
              className="w-72 text-2xl font-semibold"
              onDone={(name) => {
                setRenaming(false)
                if (name !== null) rename.mutate(name)
              }}
            />
          ) : manages ? (
            <h2 className="min-w-0 text-2xl font-semibold">
              <button
                type="button"
                className="max-w-full truncate rounded px-1 hover:bg-accent"
                title={m.renameWorkspace}
                onClick={() => setRenaming(true)}
              >
                {rename.isPending ? rename.variables : workspace.name}
              </button>
            </h2>
          ) : (
            <h2 className="min-w-0 truncate text-2xl font-semibold">{workspace.name}</h2>
          )}
          <span title={m.yourRole} className="rounded bg-muted px-1.5 text-xs whitespace-nowrap">
            {workspaceRoleLabel(workspace.role)}
          </span>
        </div>
        {createsBoards(workspace.role) && (
          <Button type="button" onClick={() => create.mutate()} disabled={create.isPending}>
            {m.createBoard}
          </Button>
        )}
      </div>
      {rename.isError && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {m.renameFailed}
        </p>
      )}
      {create.isError && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {boardLimit === null
            ? m.createFailed
            : m.boardsLimit(boardLimit)}
        </p>
      )}

      <ProjectBar
        projects={projectList}
        selected={chosen}
        onSelect={setFilter}
        manage={
          manages
            ? {
                onCreate: (name) => addProject.mutate(name),
                onRename: (id, name) => changeProject.mutate({ id, name }),
                onDelete: (id) => removeProject.mutate(id),
              }
            : undefined
        }
        error={projectError}
      />

      {boards.isPending && <p className="mt-4 text-muted-foreground">{m.loading}</p>}
      {boards.isError && (
        <p role="alert" className="mt-4 text-destructive">
          {m.boardsFailed}
        </p>
      )}
      {boards.data && shown.length === 0 && (
        <p className="mt-4 text-muted-foreground">
          {chosen.kind === 'all' ? m.noBoards : m.noBoardsInProject}
        </p>
      )}
      {shown.length > 0 && (
        <ul aria-label={m.workspaceBoards} className="mt-4 divide-y">
          {shown.map((board) => (
            <WorkspaceBoardItem
              key={board.id}
              board={board}
              workspace={workspace}
              projects={projectList}
              showProject={chosen.kind === 'all'}
            />
          ))}
        </ul>
      )}

      <WorkspaceMembers workspace={workspace} userId={userId} />

      {workspace.role === 'owner' && (
        <section aria-labelledby="workspace-delete" className="mt-8 flex flex-col gap-2 border-t pt-4">
          <h3 id="workspace-delete" className="text-lg font-semibold">
            {m.deletion}
          </h3>
          <p className="text-sm text-muted-foreground">
            {m.deletionHint}
          </p>
          <div>
            <ConfirmedAction
              label={m.deleteWorkspace}
              title={m.deletion}
              confirmLabel={m.delete}
              variant="outline"
              disabled={remove.isPending}
              onConfirm={() => remove.mutate()}
            >
              {m.deleteQuestion(workspace.name)}
            </ConfirmedAction>
          </div>
          {remove.isError && (
            <p role="alert" className="text-sm text-destructive">
              {m.deleteFailed}
            </p>
          )}
        </section>
      )}
    </section>
  )
}

interface WorkspaceBoardItemProps {
  board: WorkspaceBoard
  workspace: Workspace
  projects: WorkspaceProject[]
  /** The row names the project of its board: the page shows all projects. */
  showProject: boolean
}

/** A board of the workspace: its title, project, responsible member and the role of the user, and its menu. */
function WorkspaceBoardItem({ board, workspace, projects, showProject }: WorkspaceBoardItemProps) {
  const queryClient = useQueryClient()
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: workspaceBoardsKey(workspace.id), exact: true }),
      queryClient.invalidateQueries({ queryKey: workspaceKey(workspace.id), exact: true }),
      queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY, exact: true }),
    ])
  const move = useMutation({
    mutationFn: (projectId: string | null) => moveBoardToWorkspace(board.id, workspace.id, projectId),
    onSuccess: refresh,
  })
  const takeOut = useMutation({
    mutationFn: () => moveBoardToWorkspace(board.id, null),
    onSuccess: () => Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: OWN_BOARDS_QUERY_KEY, exact: true })]),
  })
  const remove = useMutation({
    mutationFn: () => deleteBoard(board.id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['boards', board.id], exact: true })
      return Promise.all([refresh(), deleteLocalCopiesOfBoard(board.id)])
    },
  })
  const copy = useCopyBoard(board.id)
  const project = showProject ? projects.find((one) => one.id === board.projectId) : undefined
  const manages = board.role === 'owner'
  const limit = boardLimitOf(takeOut.error)
  const error = move.isError
    ? m.moveFailed
    : takeOut.isError
      ? limit === null
        ? m.takeOutFailed
        : m.ownBoardsLimit(limit)
      : remove.isError
        ? m.boardDeleteFailed
        : copy.error
  const at = board.updatedAt

  return (
    <li className="flex items-center justify-between gap-4 py-2">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link to={`/boards/${board.id}`} className="min-w-0 truncate py-1 font-medium hover:underline">
          {board.title}
        </Link>
        <span className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          {board.owner.avatarUrl && <img src={board.owner.avatarUrl} alt="" className="size-4 rounded-full" />}
          <span title={m.responsible}>{board.owner.name}</span>
          <span className="rounded bg-muted px-1.5 text-xs">
            {board.role === 'owner' ? m.roleOnBoard.owner : board.role === 'editor' ? m.roleOnBoard.editor : m.roleOnBoard.viewer}
          </span>
          {project && (
            <span className="truncate text-xs">
              <span className="sr-only">{m.projectPrefix}</span>
              {project.name}
            </span>
          )}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {error && (
          <span role="alert" className="text-sm text-destructive">
            {error}
          </span>
        )}
        <time dateTime={at} className="whitespace-nowrap text-muted-foreground" title={m.updated}>
          {dateFormat().format(new Date(at))}
        </time>
        {manages ? (
          <WorkspaceBoardMenu
            title={board.title}
            projects={projects}
            current={board.projectId}
            disabled={move.isPending || takeOut.isPending || remove.isPending || copy.pending}
            onCopy={copy.copy}
            onMove={(projectId) => move.mutate(projectId)}
            onTakeOut={managesWorkspace(workspace.role) ? () => takeOut.mutate() : undefined}
            onDelete={() => remove.mutate()}
          />
        ) : (
          <BoardActions title={board.title} disabled={copy.pending} onCopy={copy.copy} />
        )}
      </div>
    </li>
  )
}

interface WorkspaceBoardMenuProps {
  title: string
  projects: WorkspaceProject[]
  /** The project the board is in; `null` for none. */
  current: string | null
  disabled: boolean
  /** Copies the board, into this workspace as the user creates boards in it. */
  onCopy: () => void
  onMove: (projectId: string | null) => void
  /** Takes the board out of the workspace into the personal boards of the user; only for who manages the workspace. */
  onTakeOut?: () => void
  /** Called once the user has confirmed the deletion. */
  onDelete: () => void
}

type MenuView = 'items' | 'project' | 'take-out' | 'delete'

/** Menu of a board of a workspace for who manages the board: copying it, its project, taking it out, deleting it. */
function WorkspaceBoardMenu({ title, projects, current, disabled, onCopy, onMove, onTakeOut, onDelete }: WorkspaceBoardMenuProps) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<MenuView>('items')
  const item = 'justify-start font-normal'
  const confirm = (text: string, label: string, action: () => void) => (
    <div role="alertdialog" aria-label={label} className="flex flex-col gap-2 p-2">
      <p className="text-sm">{text}</p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setView('items')}>
          {m.cancel}
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setOpen(false)
            action()
          }}
        >
          {label}
        </Button>
      </div>
    </div>
  )
  const choice = (id: string | null, label: string) => (
    <Button
      key={id ?? ''}
      type="button"
      role="menuitemradio"
      aria-checked={current === id}
      variant="ghost"
      size="sm"
      className="justify-between font-normal"
      onClick={() => {
        setOpen(false)
        if (id !== current) onMove(id)
      }}
    >
      <span className="truncate">{label}</span>
      {current === id && <Check aria-hidden />}
    </Button>
  )

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setView('items')
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={m.boardMenu(title)} disabled={disabled}>
          <Ellipsis />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-1" onCloseAutoFocus={(event) => event.preventDefault()}>
        {view === 'project' && (
          <div role="menu" aria-label={m.boardProject(title)} className="flex max-h-64 flex-col overflow-y-auto">
            {choice(null, m.noProject)}
            {projects.map((project) => choice(project.id, project.name))}
          </div>
        )}
        {view === 'take-out' &&
          onTakeOut &&
          confirm(
            m.takeOutQuestion(title),
            m.takeOut,
            onTakeOut,
          )}
        {view === 'delete' &&
          confirm(m.trashQuestion(title), m.delete, onDelete)}
        {view === 'items' && (
          <div role="menu" aria-label={m.board(title)} className="flex flex-col">
            <Button
              type="button"
              role="menuitem"
              variant="ghost"
              size="sm"
              className={item}
              onClick={() => {
                setOpen(false)
                onCopy()
              }}
            >
              {m.copy}
            </Button>
            <Button type="button" role="menuitem" variant="ghost" size="sm" className={item} onClick={() => setView('project')}>
              {m.moveToProject}
            </Button>
            {onTakeOut && (
              <Button type="button" role="menuitem" variant="ghost" size="sm" className={item} onClick={() => setView('take-out')}>
                {m.takeOutOfWorkspace}
              </Button>
            )}
            <Button
              type="button"
              role="menuitem"
              variant="ghost"
              size="sm"
              className={cn(item, 'text-destructive hover:text-destructive')}
              onClick={() => setView('delete')}
            >
              {m.delete}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
