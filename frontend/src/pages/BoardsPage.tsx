import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
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
    <section>
      <div className="page-header">
        <h2>Доски</h2>
        <button type="button" onClick={() => create.mutate()} disabled={create.isPending}>
          Создать доску
        </button>
      </div>
      {create.isError && <p role="alert">Не удалось создать доску</p>}

      {boards.isPending && <p>Загрузка…</p>}
      {boards.isError && <p role="alert">Не удалось загрузить доски</p>}
      {boards.data?.length === 0 && <p>Досок пока нет</p>}
      {boards.data && boards.data.length > 0 && (
        <ul className="board-list">
          {boards.data.map((board) => (
            <li key={board.id}>
              <Link to={`/boards/${board.id}`}>{board.title}</Link>
              <time dateTime={board.updatedAt}>{dateFormat.format(new Date(board.updatedAt))}</time>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
