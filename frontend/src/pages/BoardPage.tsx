import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { CurrentUser } from '../api/auth.ts'
import { canEdit, fetchBoard, type Board } from '../api/boards.ts'
import type { BoardVersion } from '../api/versions.ts'
import type { CommentThread } from '../api/comments.ts'
import { isForbidden, isNotFound } from '../api/http.ts'
import { useCurrentUser } from '../auth/session.ts'
import { BoardHeading } from '../board/BoardHeading.tsx'
import { participantIdentity } from '../board/identity.ts'
import { PageTabs } from '../board/PageTabs.tsx'
import { Participants } from '../board/Participants.tsx'
import { PresenceLayer } from '../board/PresenceLayer.tsx'
import { readRemotePresence, usePresencePublisher } from '../board/presence.ts'
import { ShareButton } from '../board/ShareButton.tsx'
import { VersionHistory } from '../board/VersionHistory.tsx'
import { VersionPreview } from '../board/VersionPreview.tsx'
import { useBoardConnection, type ConnectionStatus } from '../board/useBoardConnection.ts'
import { usePages } from '../board/usePages.ts'
import { CommentBadges } from '../comments/CommentBadges.tsx'
import { CommentsButton } from '../comments/CommentsButton.tsx'
import { CommentsPanel, type ThreadDraft, type ThreadFocus } from '../comments/CommentsPanel.tsx'
import { useThreads } from '../comments/useComments.ts'
import { fetchEmbed } from '../api/embed.ts'
import { embedKey } from '../embed/links.ts'
import { useEmbedPublisher } from '../embed/useEmbedPublisher.ts'
import { PageHistories } from '../diagram/binding.ts'
import { CanvasMenu } from '../diagram/CanvasMenu.tsx'
import { DiagramCanvas } from '../diagram/DiagramCanvas.tsx'
import type { DiagramEditor } from '../diagram/editor.ts'
import { EditorToolbar } from '../diagram/EditorToolbar.tsx'
import { QuickConnect } from '../diagram/QuickConnect.tsx'
import { initializeDocument } from '../diagram/model.ts'
import { addPage, deletePage, duplicatePage, movePage, renamePage } from '../diagram/pages.ts'
import { DrawioActions } from '../drawio/DrawioActions.tsx'
import { takePendingImport } from '../drawio/files.ts'
import { importPages } from '../drawio/importPages.ts'
import { ImageExportMenu } from '../image/ImageExportMenu.tsx'
import { SqlMenu } from '../sql/SqlMenu.tsx'
import { EmptyBoardTemplates } from '../templates/EmptyBoardTemplates.tsx'
import { ShapePalette } from '../diagram/ShapePalette.tsx'
import { ShortcutsHelp } from '../diagram/ShortcutsHelp.tsx'

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  connecting: 'Подключение',
  synced: 'Синхронизировано',
  offline: 'Нет связи',
  'not-found': 'Доска не найдена',
  forbidden: 'Нет доступа',
}

const STATUS_COLORS: Record<ConnectionStatus, string> = {
  connecting: 'bg-muted-foreground',
  synced: 'bg-success',
  offline: 'bg-destructive',
  'not-found': 'bg-destructive',
  forbidden: 'bg-destructive',
}

export function BoardPage() {
  const { boardId = '' } = useParams()
  const board = useQuery({ queryKey: ['boards', boardId], queryFn: () => fetchBoard(boardId) })
  const user = useCurrentUser()

  if (board.isPending || user.isPending) return <Message>Загрузка…</Message>
  if (isNotFound(board.error)) return <BoardNotFound />
  if (isForbidden(board.error)) return <NoAccess />
  if (board.isError || user.isError) return <Message alert>Не удалось загрузить доску</Message>
  return <BoardWorkspace board={board.data} user={user.data} />
}

function BoardWorkspace({ board, user }: { board: Board; user: CurrentUser }) {
  const identity = useMemo(() => participantIdentity(user), [user])
  const viewer = !canEdit(board)
  const connection = useBoardConnection(board.id, identity, viewer)
  const { status, participants, document, awareness, notifyBoardChanged, notifyCommentsChanged } = connection
  const [editor, setEditor] = useState<DiagramEditor | null>(null)
  usePresencePublisher(editor, awareness)
  // Until the page fetches the role again, the access of the connection may be narrower than the role.
  const readOnly = viewer || connection.readOnly
  // A participant who may only view never writes to the document: collab would reject it, and their document would
  // differ from everybody else's. A board nobody has edited yet has no page for them.
  useEffect(() => {
    if (document && !readOnly) initializeDocument(document)
  }, [document, readOnly])
  const pages = usePages(document, !readOnly)
  // Versions of the board, which only its owner sees; a selected version shows in place of the board.
  const [historyOpen, setHistoryOpen] = useState(false)
  const [previewed, setPreviewed] = useState<BoardVersion | null>(null)
  const isOwner = board.role === 'owner'
  const preview = isOwner && previewed && document ? previewed : null
  // Comments of the board, which every participant reads and writes, in a panel in place of the history of versions.
  const threads = useThreads(board.id)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentDraft, setCommentDraft] = useState<ThreadDraft | null>(null)
  const [commentFocus, setCommentFocus] = useState<ThreadFocus | null>(null)
  const openComments = () => {
    setCommentsOpen(true)
    setHistoryOpen(false)
    setPreviewed(null)
  }
  const closeComments = () => {
    setCommentsOpen(false)
    setCommentDraft(null)
    setCommentFocus(null)
  }
  // The live image of a page: the browsers of the participants who edit publish its picture after their changes.
  const embed = useQuery({ queryKey: embedKey(board.id), queryFn: () => fetchEmbed(board.id) })
  useEmbedPublisher(board.id, document, embed.data, !readOnly)
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

  // Going to a thread: switch to its page, then show its element once that page is shown.
  const revealing = useRef<{ pageId: string; cellId: string } | null>(null)
  const showThread = (thread: CommentThread) => {
    if (!pages.some((page) => page.id === thread.pageId)) return
    if (editor && editor.pageId === thread.pageId) {
      if (thread.cellId) editor.revealCell(thread.cellId)
      return
    }
    revealing.current = thread.cellId ? { pageId: thread.pageId, cellId: thread.cellId } : null
    selectPage(thread.pageId)
  }
  useEffect(() => {
    const target = revealing.current
    if (!editor || !target || editor.pageId !== target.pageId) return
    editor.revealCell(target.cellId)
    revealing.current = null
  }, [editor])
  const commentOn = (cellId: string) => {
    if (!editor) return
    openComments()
    setCommentFocus(null)
    setCommentDraft({ pageId: editor.pageId, cellId })
  }
  const showThreadsOf = (cellId: string) => {
    if (!editor) return
    openComments()
    setCommentFocus({ pageId: editor.pageId, cellId })
  }

  if (status === 'not-found') return <BoardNotFound />
  if (status === 'forbidden') return <NoAccess />

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* One line: the tools that appear with a selection must not move the canvas down. */}
      <div className="flex items-center gap-x-4 border-b px-3 py-2">
        <BoardHeading
          board={board}
          onChanged={notifyBoardChanged}
          onOpenHistory={() => {
            setHistoryOpen(true)
            closeComments()
          }}
        />
        <span role="status" className="flex shrink-0 items-center gap-1.5 text-sm whitespace-nowrap text-muted-foreground">
          <span aria-hidden className={cn('size-2 rounded-full', STATUS_COLORS[status])} />
          {STATUS_LABELS[status]}
        </span>
        {readOnly && (
          <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-sm whitespace-nowrap text-muted-foreground">
            Только просмотр
          </span>
        )}
        <DrawioActions document={document} title={board.title} onImported={selectPage} readOnly={readOnly} />
        <ImageExportMenu
          editor={editor}
          document={document}
          boardTitle={board.title}
          pageName={currentPage?.name ?? ''}
          pageCount={pages.length}
        />
        <SqlMenu
          editor={editor}
          document={document}
          pageId={currentPage?.id ?? null}
          boardTitle={board.title}
          pageName={currentPage?.name ?? ''}
          pageCount={pages.length}
          readOnly={readOnly}
        />
        <span aria-hidden className="h-5 w-px shrink-0 bg-border" />
        <EditorToolbar editor={editor} readOnly={readOnly} />
        <Participants
          participants={participants}
          pages={pages}
          currentPageId={currentPage?.id ?? null}
          onFollow={follow}
          className="ml-auto shrink-0"
        />
        <CommentsButton
          threads={threads.data}
          open={commentsOpen}
          onToggle={() => (commentsOpen ? closeComments() : openComments())}
        />
        <ShortcutsHelp readOnly={readOnly} />
        <ShareButton
          board={board}
          pageId={currentPage?.id ?? null}
          onChanged={notifyBoardChanged}
          embed={embed.data}
          pages={pages}
          document={document}
        />
      </div>
      {connection.tooLarge && (
        <div
          role="alert"
          className="flex items-center gap-3 border-b bg-destructive/10 px-3 py-1.5 text-sm text-destructive"
        >
          <span className="flex-1">
            Доска достигла предельного размера, последнее изменение не сохранено. Удалите лишнее, чтобы продолжить
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={connection.dismissTooLarge}>
            Понятно
          </Button>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        {!readOnly && !preview && <ShapePalette editor={editor} />}
        {preview && document ? (
          <VersionPreview
            key={preview.id}
            boardId={board.id}
            version={preview}
            document={document}
            onRestored={() => setPreviewed(null)}
            onClose={() => setPreviewed(null)}
          />
        ) : (
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="relative min-h-0 flex-1">
              {document && currentPage ? (
                <>
                  <DiagramCanvas
                    document={document}
                    pageId={currentPage.id}
                    histories={histories}
                    readOnly={readOnly}
                    onEditor={setEditor}
                  />
                  <PresenceLayer editor={editor} awareness={awareness} />
                  <CommentBadges editor={editor} threads={threads.data} onOpen={showThreadsOf} />
                  {!readOnly && <QuickConnect editor={editor} />}
                  <CanvasMenu editor={editor} onComment={commentOn} />
                  {!readOnly && <EmptyBoardTemplates editor={editor} onlyPage={pages.length === 1} />}
                </>
              ) : (
                <Message>{document && readOnly ? 'Доска пока пуста' : 'Загрузка доски…'}</Message>
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
                readOnly={readOnly}
              />
            )}
          </div>
        )}
        {commentsOpen && (
          <CommentsPanel
            boardId={board.id}
            userId={user.id}
            isOwner={isOwner}
            threads={threads.data}
            failed={threads.isError}
            pages={pages}
            currentPageId={currentPage?.id ?? null}
            document={document}
            draft={commentDraft}
            onDraftChange={setCommentDraft}
            focus={commentFocus}
            onShow={showThread}
            onChanged={notifyCommentsChanged}
            onClose={closeComments}
          />
        )}
        {isOwner && historyOpen && (
          <VersionHistory
            boardId={board.id}
            document={document}
            selectedId={preview?.id ?? null}
            onSelect={setPreviewed}
            onClose={() => {
              setHistoryOpen(false)
              setPreviewed(null)
            }}
          />
        )}
      </div>
    </div>
  )
}

function BoardNotFound() {
  return <Message alert>{STATUS_LABELS['not-found']}</Message>
}

function NoAccess() {
  return <Message alert>Нет доступа: владелец закрыл доступ к доске по ссылке</Message>
}

function Message({ children, alert = false }: { children: string; alert?: boolean }) {
  return (
    <p role={alert ? 'alert' : undefined} className={cn('p-6', alert ? 'text-destructive' : 'text-muted-foreground')}>
      {children}
    </p>
  )
}
