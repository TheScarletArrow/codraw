import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Folder } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  boardLimitOf,
  createBoard,
  deleteBoard,
  fetchBoards,
  fetchSharedBoards,
  OWN_BOARDS_QUERY_KEY,
  renameBoard,
  SHARED_BOARDS_QUERY_KEY,
  type ListedBoard,
  type SharedBoard,
} from '../api/boards.ts'
import { fetchFolders, FOLDERS_QUERY_KEY, type BoardFolder } from '../api/folders.ts'
import { BoardActions } from '../board/BoardActions.tsx'
import { BoardTrash } from '../board/BoardTrash.tsx'
import { TitleInput } from '../board/TitleInput.tsx'
import { BoardFilters } from '../boardList/BoardFilters.tsx'
import {
  ALL_FOLDERS,
  boardTime,
  collectTags,
  filterBoards,
  folderErrorMessage,
  highlightMatch,
  isFiltering,
  readBoardSort,
  sameLabel,
  saveBoardSort,
  searchQueryOf,
  sortBoards,
  tagErrorMessage,
  titleMatches,
  type BoardSort,
  type FolderFilter,
} from '../boardList/boardList.ts'
import { FolderBar } from '../boardList/FolderBar.tsx'
import { FolderPicker } from '../boardList/FolderPicker.tsx'
import { TagEditor } from '../boardList/TagEditor.tsx'
import {
  useBoardTags,
  useCreateFolder,
  useDeleteFolder,
  useMoveBoard,
  useRenameFolder,
  type BoardListKey,
} from '../boardList/useBoardOrganization.ts'
import { useBoardTextSearch } from '../boardList/useBoardTextSearch.ts'
import { DRAWIO_FILE_TYPES, setPendingImport, titleFromFileName } from '../drawio/files.ts'
import { DrawioFormatError, parseDrawio } from '../drawio/parse.ts'
import { deleteLocalCopiesOfBoard } from '../offline/localCopies.ts'
import { TemplateCards } from '../templates/TemplateCards.tsx'
import { PersonalTemplates } from '../templates/PersonalTemplates.tsx'
import { templatePage, type BoardTemplate } from '../templates/templates.ts'
import { moveBoardToWorkspace, WORKSPACES_QUERY_KEY, workspaceLimitOf } from '../api/workspaces.ts'
import { useCurrentUser } from '../auth/session.ts'
import { WorkspacePicker } from '../workspaces/WorkspacePicker.tsx'
import { WorkspacesSection } from '../workspaces/WorkspacesSection.tsx'
import { perLocale } from '../i18n/i18n.ts'
import { boardsPageMessages as m } from './BoardsPage.messages.ts'

const dateFormat = perLocale((tag) => new Intl.DateTimeFormat(tag, { dateStyle: 'medium', timeStyle: 'short' }))

/** Tells the user that they own as many boards as allowed, when that is why a board was not created. */
function boardLimitMessage(error: unknown): string | null {
  const limit = boardLimitOf(error)
  if (limit === null) return null
  return m.boardLimit(limit)
}

/** What a row of a board in the list needs besides the board: how the list is shown and what the user has. */
interface RowContext {
  sort: BoardSort
  /** The query in the search field. */
  query: string
  /** Fragments of the texts of boards that have the query, by board id. */
  textMatches: ReadonlyMap<string, string> | null
  folders: BoardFolder[]
  /** All tags of the user, which the editor of tags suggests. */
  knownTags: string[]
  /** The row names the folder of its board: the list shows all folders. */
  showFolder: boolean
}

export function BoardsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const boards = useQuery({ queryKey: OWN_BOARDS_QUERY_KEY, queryFn: fetchBoards })
  const shared = useQuery({ queryKey: SHARED_BOARDS_QUERY_KEY, queryFn: fetchSharedBoards })
  const folders = useQuery({ queryKey: FOLDERS_QUERY_KEY, queryFn: fetchFolders })
  const create = useMutation({
    mutationFn: () => createBoard(m.newBoardTitle),
    onSuccess: async (board) => {
      await queryClient.invalidateQueries({ queryKey: ['boards'] })
      await navigate(`/boards/${board.id}`)
    },
  })
  // The file is read before the board is created, so a wrong file leaves no empty board behind.
  const fileInput = useRef<HTMLInputElement>(null)
  const open = useMutation({
    mutationFn: async (file: File) => {
      const pages = await parseDrawio(await file.text())
      const board = await createBoard(titleFromFileName(file.name))
      setPendingImport(board.id, pages)
      return board
    },
    onSuccess: async (board) => {
      await queryClient.invalidateQueries({ queryKey: ['boards'] })
      await navigate(`/boards/${board.id}`)
    },
  })
  // A board from a template gets its diagram as the pages of a file do.
  const fromTemplate = useMutation({
    mutationFn: async (template: BoardTemplate) => {
      const board = await createBoard(template.title)
      setPendingImport(board.id, [templatePage(template)])
      return board
    },
    onSuccess: async (board) => {
      await queryClient.invalidateQueries({ queryKey: ['boards'] })
      await navigate(`/boards/${board.id}`)
    },
  })
  const busy = create.isPending || open.isPending || fromTemplate.isPending

  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<BoardSort>(readBoardSort)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [folder, setFolder] = useState<FolderFilter>(ALL_FOLDERS)
  const text = useBoardTextSearch(query)
  const createFolder = useCreateFolder()
  const renameFolder = useRenameFolder()
  const deleteFolder = useDeleteFolder()

  const own = boards.data ?? []
  const others = shared.data ?? []
  const folderList = folders.data ?? []
  const knownTags = collectTags([...own, ...others])
  // A tag that no board has any more and a folder that is gone filter nothing.
  const tags = selectedTags.filter((tag) => knownTags.some((known) => sameLabel(known, tag)))
  const chosenFolder = folder.kind === 'folder' && !folderList.some((one) => one.id === folder.id) ? ALL_FOLDERS : folder
  const filter = { query, tags, folder: chosenFolder }
  const filtering = isFiltering(filter)
  const ownShown = sortBoards(filterBoards(own, filter, text.matches), sort)
  const sharedShown = sortBoards(filterBoards(others, filter, text.matches), sort)
  const hasBoards = own.length > 0 || others.length > 0
  const row: RowContext = {
    sort,
    query,
    textMatches: text.matches,
    folders: folderList,
    knownTags,
    showFolder: chosenFolder.kind === 'all',
  }
  const resetFilters = () => {
    setQuery('')
    setSelectedTags([])
    setFolder(ALL_FOLDERS)
  }
  const folderError = createFolder.isError
    ? folderErrorMessage(createFolder.error, 'create')
    : renameFolder.isError
      ? folderErrorMessage(renameFolder.error, 'rename')
      : deleteFolder.isError
        ? m.folderDeleteFailed
        : null

  return (
    <section className="mx-auto w-full max-w-3xl overflow-auto px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold">{m.boards}</h2>
        <div className="flex flex-wrap gap-2">
          <PersonalTemplates />
          <input
            ref={fileInput}
            type="file"
            accept={DRAWIO_FILE_TYPES}
            aria-label={m.drawioFile}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) open.mutate(file)
            }}
          />
          <Button type="button" variant="outline" onClick={() => fileInput.current?.click()} disabled={busy}>
            {m.openDrawio}
          </Button>
          <Button type="button" onClick={() => create.mutate()} disabled={busy}>
            {m.createBoard}
          </Button>
        </div>
      </div>
      {create.isError && (
        <p role="alert" className="mt-4 text-destructive">
          {boardLimitMessage(create.error) ?? m.createFailed}
        </p>
      )}
      {fromTemplate.isError && (
        <p role="alert" className="mt-4 text-destructive">
          {boardLimitMessage(fromTemplate.error) ?? m.fromTemplateFailed}
        </p>
      )}
      {open.isError && (
        <p role="alert" className="mt-4 text-destructive">
          {open.error instanceof DrawioFormatError
            ? open.error.message
            : (boardLimitMessage(open.error) ?? m.fromFileFailed)}
        </p>
      )}

      <WorkspacesSection />

      {(hasBoards || folderList.length > 0) && (
        <>
          <BoardFilters
            query={query}
            onQueryChange={setQuery}
            sort={sort}
            onSortChange={(next) => {
              setSort(next)
              saveBoardSort(next)
            }}
            tags={knownTags}
            selectedTags={tags}
            onToggleTag={(tag) =>
              setSelectedTags((current) =>
                current.some((one) => sameLabel(one, tag)) ? current.filter((one) => !sameLabel(one, tag)) : [...current, tag],
              )
            }
          />
          <FolderBar
            folders={folderList}
            selected={chosenFolder}
            onSelect={setFolder}
            onCreate={(name) => createFolder.mutate(name)}
            onRename={(id, name) => renameFolder.mutate({ id, name })}
            onDelete={(id) => deleteFolder.mutate(id)}
            error={folderError}
          />
        </>
      )}
      {text.failed && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {m.textSearchFailed}
        </p>
      )}
      {filtering && (
        <p role="status" className="sr-only">
          {text.searching ? m.searchingText : m.found(ownShown.length + sharedShown.length)}
        </p>
      )}

      {boards.isPending && <p className="mt-4 text-muted-foreground">{m.loading}</p>}
      {boards.isError && (
        <p role="alert" className="mt-4 text-destructive">
          {m.loadFailed}
        </p>
      )}
      {boards.data && !filtering && own.length === 0 && <p className="mt-4 text-muted-foreground">{m.noBoards}</p>}
      {boards.data && filtering && ownShown.length === 0 && sharedShown.length === 0 && (
        <EmptyResult
          searching={text.searching}
          folderOnly={chosenFolder.kind !== 'all' && searchQueryOf(query) === '' && tags.length === 0}
          onReset={resetFilters}
        />
      )}
      {ownShown.length > 0 && (
        <ul className="mt-4 divide-y">
          {ownShown.map((board) => (
            <OwnBoardItem key={board.id} board={board} context={row} />
          ))}
        </ul>
      )}

      {sharedShown.length > 0 && (
        <section aria-labelledby="shared-boards" className="mt-8">
          <h3 id="shared-boards" className="text-lg font-semibold">
            {m.sharedWithMe}
          </h3>
          <ul className="mt-2 divide-y">
            {sharedShown.map((board) => (
              <SharedBoardItem key={board.id} board={board} context={row} />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="templates" className="mt-8">
        <h3 id="templates" className="text-lg font-semibold">
          {m.startFromTemplate}
        </h3>
        <TemplateCards className="mt-2" disabled={busy} onChoose={(template) => fromTemplate.mutate(template)} />
      </section>

      <nav aria-label={m.documents} className="mt-10 flex flex-wrap gap-4 border-t pt-4 text-sm text-muted-foreground">
        <Link to="/terms" className="underline">
          {m.terms}
        </Link>
        <Link to="/privacy" className="underline">
          {m.privacy}
        </Link>
      </nav>
      <BoardTrash />
    </section>
  )
}

/** Why the list is empty under its filters: nothing found yet, an empty folder, or nothing found at all. */
function EmptyResult({ searching, folderOnly, onReset }: { searching: boolean; folderOnly: boolean; onReset: () => void }) {
  if (searching) return <p className="mt-4 text-muted-foreground">{m.searchingTextNow}</p>
  if (folderOnly) return <p className="mt-4 text-muted-foreground">{m.emptyFolder}</p>
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <p className="text-muted-foreground">{m.nothingFound}</p>
      <Button type="button" variant="outline" size="sm" onClick={onReset}>
        {m.resetFilters}
      </Button>
    </div>
  )
}

/**
 * The personal tags and folder of a board in its menu, changed at once in its list `key`. A move into a folder closes
 * the menu; a folder created there takes the board.
 */
function useOrganizationMenu(key: BoardListKey, board: ListedBoard, context: RowContext) {
  const tags = useBoardTags(key, board)
  const move = useMoveBoard(key, board)
  const create = useCreateFolder()
  const moveTo = (folderId: string | null) => {
    if (folderId !== board.folderId) move.mutate(folderId)
  }
  return {
    tags: () => (
      <TagEditor
        title={board.title}
        tags={board.tags}
        known={context.knownTags}
        onChange={(next) => tags.mutate(next)}
        error={tags.isError ? tagErrorMessage(tags.error) : null}
      />
    ),
    folder: (close: () => void) => (
      <FolderPicker
        title={board.title}
        folders={context.folders}
        current={board.folderId}
        disabled={create.isPending}
        error={create.isError ? folderErrorMessage(create.error, 'create') : null}
        onMove={(folderId) => {
          moveTo(folderId)
          close()
        }}
        onCreate={(name) =>
          create.mutate(name, {
            onSuccess: (folder) => {
              moveTo(folder.id)
              close()
            },
          })
        }
      />
    ),
    moveFailed: move.isError,
  }
}

/** Under the title of a board: the line of its text that has the query, its tags and its folder. */
function BoardDetails({ board, context }: { board: ListedBoard; context: RowContext }) {
  const fragment = titleMatches(board.title, context.query) ? undefined : context.textMatches?.get(board.id)
  const parts = fragment === undefined ? null : highlightMatch(fragment, context.query)
  const folder = context.showFolder ? context.folders.find((one) => one.id === board.folderId) : undefined
  if (fragment === undefined && board.tags.length === 0 && !folder) return null
  return (
    <>
      {fragment !== undefined && (
        <span className="truncate text-sm text-muted-foreground">
          <span className="sr-only">{m.foundOnBoard}</span>
          {parts ? (
            <>
              {parts.before}
              <mark className="rounded-sm bg-yellow-200 px-0.5 text-foreground dark:bg-yellow-700">{parts.match}</mark>
              {parts.after}
            </>
          ) : (
            fragment
          )}
        </span>
      )}
      {(board.tags.length > 0 || folder) && (
        <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          {folder && (
            <span className="flex min-w-0 items-center gap-1" title={m.folder}>
              <Folder aria-hidden className="size-3.5 shrink-0" />
              <span className="sr-only">{m.folderPrefix}</span>
              <span className="truncate">{folder.name}</span>
            </span>
          )}
          {board.tags.length > 0 && <span className="sr-only">{m.tagsPrefix}</span>}
          {board.tags.map((tag) => (
            <span key={tag} className="rounded bg-muted px-1.5 py-0.5 text-foreground">
              {tag}
            </span>
          ))}
        </span>
      )}
    </>
  )
}

/** The time the list is ordered by, or that a board was never opened. */
function BoardTime({ board, sort }: { board: ListedBoard; sort: BoardSort }) {
  const { at, label } = boardTime(board, sort)
  if (at === null) return <span className="whitespace-nowrap text-muted-foreground">{m.neverOpened}</span>
  return (
    <time dateTime={at} className="whitespace-nowrap text-muted-foreground" title={label}>
      {dateFormat().format(new Date(at))}
    </time>
  )
}

/** The layout of a row: the title and what is under it on the left, the time and the menu on the right. */
function BoardRow({ children, aside }: { children: ReactNode; aside: ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-4 py-2">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">{children}</div>
      <div className="flex shrink-0 items-center gap-2">{aside}</div>
    </li>
  )
}

/**
 * A board of the user: it opens, and its menu renames it, gives it tags, puts it into a folder, brings it into a
 * workspace or deletes it.
 */
function OwnBoardItem({ board, context }: { board: ListedBoard; context: RowContext }) {
  const queryClient = useQueryClient()
  const user = useCurrentUser()
  const [renaming, setRenaming] = useState(false)
  // The list changes at once; then it catches up with the server, where a renamed board moves to the top.
  const updateList = (change: (boards: ListedBoard[]) => ListedBoard[]) => {
    queryClient.setQueryData<ListedBoard[]>(OWN_BOARDS_QUERY_KEY, (boards) => boards && change(boards))
    return queryClient.invalidateQueries({ queryKey: OWN_BOARDS_QUERY_KEY, exact: true })
  }
  const rename = useMutation({
    mutationFn: (title: string) => renameBoard(board.id, title),
    onSuccess: (renamed) => {
      queryClient.setQueryData(['boards', board.id], renamed)
      return updateList((boards) => boards.map((other) => (other.id === renamed.id ? { ...other, ...renamed } : other)))
    },
  })
  const remove = useMutation({
    mutationFn: () => deleteBoard(board.id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['boards', board.id], exact: true })
      // A deleted board does not stay in the browser either.
      return Promise.all([
        updateList((boards) => boards.filter((other) => other.id !== board.id)),
        deleteLocalCopiesOfBoard(board.id),
      ])
    },
  })
  // The board leaves the personal boards for the workspace, with all it has.
  const toWorkspace = useMutation({
    mutationFn: (workspaceId: string) => moveBoardToWorkspace(board.id, workspaceId),
    onSuccess: (moved) => {
      queryClient.setQueryData(['boards', board.id], moved)
      return Promise.all([
        updateList((boards) => boards.filter((other) => other.id !== board.id)),
        queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY }),
      ])
    },
  })
  const organization = useOrganizationMenu(OWN_BOARDS_QUERY_KEY, board, context)
  const title = rename.isPending ? rename.variables : board.title
  const workspaceLimit = workspaceLimitOf(toWorkspace.error)
  const error = rename.isError
    ? m.renameFailed
    : remove.isError
      ? m.deleteFailed
      : organization.moveFailed
        ? m.moveFailed
        : toWorkspace.isError
          ? workspaceLimit === null
            ? m.toWorkspaceFailed
            : m.workspaceBoardsLimit(workspaceLimit.limit)
          : null

  return (
    <BoardRow
      aside={
        <>
          {error && (
            <span role="alert" className="text-sm text-destructive">
              {error}
            </span>
          )}
          <BoardTime board={board} sort={context.sort} />
          <BoardActions
            title={board.title}
            deleteLabel={m.delete}
            disabled={remove.isPending}
            onRename={() => setRenaming(true)}
            tags={organization.tags}
            folder={organization.folder}
            workspace={
              user.data && !user.data.guest
                ? (close) => (
                    <WorkspacePicker
                      title={board.title}
                      disabled={toWorkspace.isPending}
                      onPick={(workspace) => {
                        close()
                        toWorkspace.mutate(workspace.id)
                      }}
                    />
                  )
                : undefined
            }
            onDelete={() => remove.mutate()}
          />
        </>
      }
    >
      {renaming ? (
        <TitleInput
          title={board.title}
          label={m.boardTitle}
          className="flex-1 py-1 font-medium"
          onDone={(next) => {
            setRenaming(false)
            if (next !== null) rename.mutate(next)
          }}
        />
      ) : (
        <Link to={`/boards/${board.id}`} className="min-w-0 truncate py-1 font-medium hover:underline">
          {title}
        </Link>
      )}
      <BoardDetails board={board} context={context} />
    </BoardRow>
  )
}

/**
 * A board of another user that the user is a member of or opened through its link, with its owner and their role; its
 * menu gives it the tags and the folder of the user.
 */
function SharedBoardItem({ board, context }: { board: SharedBoard; context: RowContext }) {
  const organization = useOrganizationMenu(SHARED_BOARDS_QUERY_KEY, board, context)
  return (
    <BoardRow
      aside={
        <>
          {organization.moveFailed && (
            <span role="alert" className="text-sm text-destructive">
              {m.moveFailed}
            </span>
          )}
          <BoardTime board={board} sort={context.sort} />
          <BoardActions title={board.title} tags={organization.tags} folder={organization.folder} />
        </>
      }
    >
      <Link to={`/boards/${board.id}`} className="truncate py-1 font-medium hover:underline">
        {board.title}
      </Link>
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {board.owner.avatarUrl && <img src={board.owner.avatarUrl} alt="" className="size-4 rounded-full" />}
        {board.owner.name}
        <span className="rounded bg-muted px-1.5 text-xs">{board.role === 'viewer' ? m.viewing : m.editing}</span>
      </span>
      <BoardDetails board={board} context={context} />
    </BoardRow>
  )
}
