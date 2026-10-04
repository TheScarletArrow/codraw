import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { createBoard, deleteBoard, fetchBoards, fetchSharedBoards, renameBoard, type Board, type SharedBoard } from '../api/boards.ts'
import { BoardActions } from '../board/BoardActions.tsx'
import { TitleInput } from '../board/TitleInput.tsx'
import { DRAWIO_FILE_TYPES, setPendingImport, titleFromFileName } from '../drawio/files.ts'
import { DrawioFormatError, parseDrawio } from '../drawio/parse.ts'

export const NEW_BOARD_TITLE = 'Новая доска'

/** Query key of the boards of other users that the user opened through their links. */
const SHARED_BOARDS_QUERY_KEY = ['shared-boards'] as const

const dateFormat = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })

export function BoardsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const boards = useQuery({ queryKey: ['boards'], queryFn: fetchBoards })
  const shared = useQuery({ queryKey: SHARED_BOARDS_QUERY_KEY, queryFn: fetchSharedBoards })
  const create = useMutation({
    mutationFn: () => createBoard(NEW_BOARD_TITLE),
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
  const busy = create.isPending || open.isPending

  return (
    <section className="mx-auto w-full max-w-3xl overflow-auto px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold">Доски</h2>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInput}
            type="file"
            accept={DRAWIO_FILE_TYPES}
            aria-label="Файл draw.io"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) open.mutate(file)
            }}
          />
          <Button type="button" variant="outline" onClick={() => fileInput.current?.click()} disabled={busy}>
            Открыть .drawio
          </Button>
          <Button type="button" onClick={() => create.mutate()} disabled={busy}>
            Создать доску
          </Button>
        </div>
      </div>
      {create.isError && (
        <p role="alert" className="mt-4 text-destructive">
          Не удалось создать доску
        </p>
      )}
      {open.isError && (
        <p role="alert" className="mt-4 text-destructive">
          {open.error instanceof DrawioFormatError ? open.error.message : 'Не удалось создать доску из файла'}
        </p>
      )}

      {boards.isPending && <p className="mt-4 text-muted-foreground">Загрузка…</p>}
      {boards.isError && (
        <p role="alert" className="mt-4 text-destructive">
          Не удалось загрузить доски
        </p>
      )}
      {boards.data?.length === 0 && <p className="mt-4 text-muted-foreground">Досок пока нет</p>}
      {boards.data && boards.data.length > 0 && (
        <ul className="mt-4 divide-y">
          {boards.data.map((board) => (
            <OwnBoardItem key={board.id} board={board} />
          ))}
        </ul>
      )}

      {shared.data && shared.data.length > 0 && (
        <section aria-labelledby="shared-boards" className="mt-8">
          <h3 id="shared-boards" className="text-lg font-semibold">
            Открытые по ссылке
          </h3>
          <ul className="mt-2 divide-y">
            {shared.data.map((board) => (
              <SharedBoardItem key={board.id} board={board} />
            ))}
          </ul>
        </section>
      )}
    </section>
  )
}

/** A board of the user: it opens, and its menu renames or deletes it. */
function OwnBoardItem({ board }: { board: Board }) {
  const queryClient = useQueryClient()
  const [renaming, setRenaming] = useState(false)
  // The list changes at once; then it catches up with the server, where a renamed board moves to the top.
  const updateList = (change: (boards: Board[]) => Board[]) => {
    queryClient.setQueryData<Board[]>(['boards'], (boards) => boards && change(boards))
    return queryClient.invalidateQueries({ queryKey: ['boards'], exact: true })
  }
  const rename = useMutation({
    mutationFn: (title: string) => renameBoard(board.id, title),
    onSuccess: (renamed) => {
      queryClient.setQueryData(['boards', board.id], renamed)
      return updateList((boards) => boards.map((other) => (other.id === renamed.id ? renamed : other)))
    },
  })
  const remove = useMutation({
    mutationFn: () => deleteBoard(board.id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['boards', board.id], exact: true })
      return updateList((boards) => boards.filter((other) => other.id !== board.id))
    },
  })
  const title = rename.isPending ? rename.variables : board.title

  return (
    <li className="flex items-center justify-between gap-4 py-2">
      {renaming ? (
        <TitleInput
          title={board.title}
          label="Название доски"
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
      <div className="flex shrink-0 items-center gap-2">
        {(rename.isError || remove.isError) && (
          <span role="alert" className="text-sm text-destructive">
            {rename.isError ? 'Не удалось переименовать' : 'Не удалось удалить'}
          </span>
        )}
        <time dateTime={board.updatedAt} className="whitespace-nowrap text-muted-foreground">
          {dateFormat.format(new Date(board.updatedAt))}
        </time>
        <BoardActions
          title={board.title}
          deleteLabel="Удалить"
          disabled={remove.isPending}
          onRename={() => setRenaming(true)}
          onDelete={() => remove.mutate()}
        />
      </div>
    </li>
  )
}

/** A board of another user that the user opened through its link, with its owner. */
function SharedBoardItem({ board }: { board: SharedBoard }) {
  return (
    <li className="flex items-center justify-between gap-4 py-3">
      <div className="flex min-w-0 flex-col">
        <span className="flex min-w-0 items-center gap-2">
          <Link to={`/boards/${board.id}`} className="truncate font-medium hover:underline">
            {board.title}
          </Link>
          {board.role === 'viewer' && (
            <span className="shrink-0 rounded bg-muted px-1.5 text-xs text-muted-foreground">только просмотр</span>
          )}
        </span>
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {board.owner.avatarUrl && <img src={board.owner.avatarUrl} alt="" className="size-4 rounded-full" />}
          {board.owner.name}
        </span>
      </div>
      <time dateTime={board.openedAt} className="whitespace-nowrap text-muted-foreground" title="Открыта">
        {dateFormat.format(new Date(board.openedAt))}
      </time>
    </li>
  )
}
