import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { createBoard, fetchBoards } from '../api/boards.ts'
import { DRAWIO_FILE_TYPES, setPendingImport, titleFromFileName } from '../drawio/files.ts'
import { DrawioFormatError, parseDrawio } from '../drawio/parse.ts'

export const NEW_BOARD_TITLE = 'Новая доска'

const dateFormat = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })

export function BoardsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const boards = useQuery({ queryKey: ['boards'], queryFn: fetchBoards })
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
            <li key={board.id} className="flex justify-between gap-4 py-3">
              <Link to={`/boards/${board.id}`} className="font-medium hover:underline">
                {board.title}
              </Link>
              <time dateTime={board.updatedAt} className="whitespace-nowrap text-muted-foreground">
                {dateFormat.format(new Date(board.updatedAt))}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
