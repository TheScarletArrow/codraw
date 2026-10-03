import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { createBoard, fetchBoards } from '../api/boards.ts'

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

  return (
    <section className="mx-auto w-full max-w-3xl overflow-auto px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold">Доски</h2>
        <Button type="button" onClick={() => create.mutate()} disabled={create.isPending}>
          Создать доску
        </Button>
      </div>
      {create.isError && (
        <p role="alert" className="mt-4 text-destructive">
          Не удалось создать доску
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
