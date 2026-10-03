import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams } from 'react-router'
import { cn } from '@/lib/utils'
import { fetchBoard, isNotFound, type Board } from '../api/boards.ts'
import { getGuestIdentity } from '../board/guest.ts'
import { Participants } from '../board/Participants.tsx'
import { useBoardConnection, type ConnectionStatus } from '../board/useBoardConnection.ts'
import { DiagramCanvas } from '../diagram/DiagramCanvas.tsx'
import type { DiagramEditor } from '../diagram/editor.ts'
import { EditorToolbar } from '../diagram/EditorToolbar.tsx'
import { ShapePalette } from '../diagram/ShapePalette.tsx'

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  connecting: 'Подключение',
  synced: 'Синхронизировано',
  offline: 'Нет связи',
  'not-found': 'Доска не найдена',
}

const STATUS_COLORS: Record<ConnectionStatus, string> = {
  connecting: 'bg-muted-foreground',
  synced: 'bg-success',
  offline: 'bg-destructive',
  'not-found': 'bg-destructive',
}

export function BoardPage() {
  const { boardId = '' } = useParams()
  const board = useQuery({ queryKey: ['boards', boardId], queryFn: () => fetchBoard(boardId) })

  if (board.isPending) return <Message>Загрузка…</Message>
  if (isNotFound(board.error)) return <BoardNotFound />
  if (board.isError) return <Message alert>Не удалось загрузить доску</Message>
  return <BoardWorkspace board={board.data} />
}

function BoardWorkspace({ board }: { board: Board }) {
  const { status, participants, document } = useBoardConnection(board.id, getGuestIdentity())
  const [editor, setEditor] = useState<DiagramEditor | null>(null)

  if (status === 'not-found') return <BoardNotFound />

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-3 py-2">
        <h2 className="font-semibold">{board.title}</h2>
        <span role="status" className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span aria-hidden className={cn('size-2 rounded-full', STATUS_COLORS[status])} />
          {STATUS_LABELS[status]}
        </span>
        <EditorToolbar editor={editor} />
        <Participants participants={participants} className="ml-auto" />
      </div>
      <div className="flex min-h-0 flex-1">
        <ShapePalette editor={editor} />
        <div className="relative min-w-0 flex-1">
          {document ? (
            <DiagramCanvas document={document} onEditor={setEditor} />
          ) : (
            <Message>Загрузка доски…</Message>
          )}
        </div>
      </div>
    </div>
  )
}

function BoardNotFound() {
  return <Message alert>{STATUS_LABELS['not-found']}</Message>
}

function Message({ children, alert = false }: { children: string; alert?: boolean }) {
  return (
    <p role={alert ? 'alert' : undefined} className={cn('p-6', alert ? 'text-destructive' : 'text-muted-foreground')}>
      {children}
    </p>
  )
}
