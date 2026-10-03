import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router'
import { fetchBoard, isNotFound, type Board } from '../api/boards.ts'
import { getGuestIdentity } from '../board/guest.ts'
import { useBoardConnection, type ConnectionStatus } from '../board/useBoardConnection.ts'

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  connecting: 'Подключение',
  synced: 'Синхронизировано',
  offline: 'Нет связи',
  'not-found': 'Доска не найдена',
}

export function BoardPage() {
  const { boardId = '' } = useParams()
  const board = useQuery({ queryKey: ['boards', boardId], queryFn: () => fetchBoard(boardId) })

  if (board.isPending) return <p>Загрузка…</p>
  if (isNotFound(board.error)) return <BoardNotFound />
  if (board.isError) return <p role="alert">Не удалось загрузить доску</p>
  return <BoardWorkspace board={board.data} />
}

function BoardWorkspace({ board }: { board: Board }) {
  const { status, participants } = useBoardConnection(board.id, getGuestIdentity())

  if (status === 'not-found') return <BoardNotFound />

  return (
    <section>
      <div className="page-header">
        <h2>{board.title}</h2>
        <span className={`status status-${status}`} role="status">
          {STATUS_LABELS[status]}
        </span>
      </div>
      <h3>Участники</h3>
      <ul className="participants" aria-label="Участники">
        {participants.map((participant) => (
          <li key={participant.clientId}>
            <span className="participant-color" style={{ backgroundColor: participant.color }} />
            {participant.name}
            {participant.isSelf && <span className="participant-self"> (вы)</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}

function BoardNotFound() {
  return <p role="alert">{STATUS_LABELS['not-found']}</p>
}
