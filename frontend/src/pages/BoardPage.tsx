import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { cn } from '@/lib/utils'
import type { CurrentUser } from '../api/auth.ts'
import { fetchBoard, type Board } from '../api/boards.ts'
import { isNotFound } from '../api/http.ts'
import { useCurrentUser } from '../auth/session.ts'
import { participantIdentity } from '../board/identity.ts'
import { PageTabs } from '../board/PageTabs.tsx'
import { Participants } from '../board/Participants.tsx'
import { PresenceLayer } from '../board/PresenceLayer.tsx'
import { readRemotePresence, usePresencePublisher } from '../board/presence.ts'
import { useBoardConnection, type ConnectionStatus } from '../board/useBoardConnection.ts'
import { usePages } from '../board/usePages.ts'
import { PageHistories } from '../diagram/binding.ts'
import { DiagramCanvas } from '../diagram/DiagramCanvas.tsx'
import type { DiagramEditor } from '../diagram/editor.ts'
import { EditorToolbar } from '../diagram/EditorToolbar.tsx'
import { addPage, deletePage, duplicatePage, movePage, renamePage } from '../diagram/pages.ts'
import { DrawioActions } from '../drawio/DrawioActions.tsx'
import { takePendingImport } from '../drawio/files.ts'
import { importPages } from '../drawio/importPages.ts'
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
  const user = useCurrentUser()

  if (board.isPending || user.isPending) return <Message>Загрузка…</Message>
  if (isNotFound(board.error)) return <BoardNotFound />
  if (board.isError || user.isError) return <Message alert>Не удалось загрузить доску</Message>
  return <BoardWorkspace board={board.data} user={user.data} />
}

function BoardWorkspace({ board, user }: { board: Board; user: CurrentUser }) {
  const identity = useMemo(() => participantIdentity(user), [user])
  const { status, participants, document, awareness } = useBoardConnection(board.id, identity)
  const [editor, setEditor] = useState<DiagramEditor | null>(null)
  usePresencePublisher(editor, awareness)
  const pages = usePages(document)
  // Undo histories of the pages outlive the canvas of a page; destroying them only forgets them.
  const histories = useMemo(() => document && new PageHistories(document), [document])
  useEffect(() => () => histories?.destroy(), [histories])

  // The current page is the participant's own and lives in the address, so a link opens the board on it.
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedPage = searchParams.get('page')
  const currentPage = pages.find((page) => page.id === requestedPage) ?? pages[0] ?? null
  const selectPage = useCallback(
    (id: string) =>
      setSearchParams(
        (params) => {
          const next = new URLSearchParams(params)
          next.set('page', id)
          return next
        },
        { replace: true },
      ),
    [setSearchParams],
  )
  // An unknown page, e.g. one deleted by another participant, is replaced with the first page.
  useEffect(() => {
    if (currentPage && currentPage.id !== requestedPage) selectPage(currentPage.id)
  }, [currentPage, requestedPage, selectPage])

  // A board created from a file on the list of boards gets the pages of the file once its document is synced.
  useEffect(() => {
    const pending = document && takePendingImport(board.id)
    if (!pending) return
    const [first] = importPages(document, pending)
    if (first) selectPage(first)
  }, [document, board.id, selectPage])

  // Going to another participant: switch to their page, then centre their cursor once that page is shown.
  const following = useRef<number | null>(null)
  const centreOn = useCallback(
    (editor: DiagramEditor, clientId: number) => {
      const target = awareness && readRemotePresence(awareness).find((participant) => participant.clientId === clientId)
      // Waiting for the canvas of the participant's page.
      if (target && target.page !== editor.pageId) return false
      if (target?.cursor) editor.centerOn(target.cursor)
      return true
    },
    [awareness],
  )
  const follow = (clientId: number) => {
    const target = participants.find((participant) => participant.clientId === clientId)
    if (!target) return
    if (editor && target.page === editor.pageId) {
      centreOn(editor, clientId)
    } else if (pages.some((page) => page.id === target.page)) {
      following.current = clientId
      selectPage(target.page)
    }
  }
  useEffect(() => {
    if (editor && following.current !== null && centreOn(editor, following.current)) following.current = null
  }, [editor, centreOn])

  if (status === 'not-found') return <BoardNotFound />

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* One line: the tools that appear with a selection must not move the canvas down. */}
      <div className="flex items-center gap-x-4 border-b px-3 py-2">
        <h2 className="max-w-64 shrink-0 truncate font-semibold">{board.title}</h2>
        <span role="status" className="flex shrink-0 items-center gap-1.5 text-sm whitespace-nowrap text-muted-foreground">
          <span aria-hidden className={cn('size-2 rounded-full', STATUS_COLORS[status])} />
          {STATUS_LABELS[status]}
        </span>
        <DrawioActions document={document} title={board.title} onImported={selectPage} />
        <span aria-hidden className="h-5 w-px shrink-0 bg-border" />
        <EditorToolbar editor={editor} />
        <Participants
          participants={participants}
          pages={pages}
          currentPageId={currentPage?.id ?? null}
          onFollow={follow}
          className="ml-auto shrink-0"
        />
      </div>
      <div className="flex min-h-0 flex-1">
        <ShapePalette editor={editor} />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            {document && currentPage ? (
              <>
                <DiagramCanvas document={document} pageId={currentPage.id} histories={histories} onEditor={setEditor} />
                <PresenceLayer editor={editor} awareness={awareness} />
              </>
            ) : (
              <Message>Загрузка доски…</Message>
            )}
          </div>
          {document && (
            <PageTabs
              pages={pages}
              currentPageId={currentPage?.id ?? null}
              visitors={participants.filter((participant) => !participant.isSelf)}
              onSelect={selectPage}
              onAdd={() => selectPage(addPage(document, currentPage?.id))}
              onRename={(id, name) => renamePage(document, id, name)}
              onDuplicate={(id) => {
                const copy = duplicatePage(document, id)
                if (copy) selectPage(copy)
              }}
              onDelete={(id) => deletePage(document, id)}
              onMove={(id, index) => movePage(document, id, index)}
            />
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
