import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { CurrentUser } from '../api/auth.ts'
import { canEdit, canManageVersions, fetchBoard, type Board } from '../api/boards.ts'
import type { BoardVersion } from '../api/versions.ts'
import type { CommentThread } from '../api/comments.ts'
import { isForbidden, isNotFound } from '../api/http.ts'
import { useCurrentUser } from '../auth/session.ts'
import { ACCESS_POLL_INTERVAL, accessRequestsKey } from '../board/accessRequests.ts'
import { BoardHeading } from '../board/BoardHeading.tsx'
import { CursorChat } from '../board/CursorChat.tsx'
import { EditRequestButton } from '../board/EditRequestButton.tsx'
import { participantIdentity } from '../board/identity.ts'
import { PageTabs } from '../board/PageTabs.tsx'
import { Participants, PresentButton } from '../board/Participants.tsx'
import { PresenceLayer } from '../board/PresenceLayer.tsx'
import { BANNER_SELECTOR, FollowingBanner } from '../board/FollowBanner.tsx'
import { useFollowing } from '../board/following.ts'
import { NoAccess } from '../board/NoAccess.tsx'
import { useLaserPublisher, usePresencePublisher } from '../board/presence.ts'
import { ShareButton } from '../board/ShareButton.tsx'
import { VersionHistory } from '../board/VersionHistory.tsx'
import { VersionPreview } from '../board/VersionPreview.tsx'
import { useBoardConnection, type ConnectionStatus } from '../board/useBoardConnection.ts'
import { usePages } from '../board/usePages.ts'
import { CommentBadges } from '../comments/CommentBadges.tsx'
import { CommentPins } from '../comments/CommentPins.tsx'
import { CommentsButton } from '../comments/CommentsButton.tsx'
import { CommentsPanel, type ThreadDraft } from '../comments/CommentsPanel.tsx'
import type { ThreadFilter, ThreadFocus } from '../comments/threads.ts'
import { useThreads } from '../comments/useComments.ts'
import { fetchEmbed } from '../api/embed.ts'
import { embedKey } from '../embed/links.ts'
import { useEmbedPublisher } from '../embed/useEmbedPublisher.ts'
import { PageHistories } from '../diagram/binding.ts'
import type { Author } from '../diagram/attribution.ts'
import { CanvasMenu, type CommentTarget } from '../diagram/CanvasMenu.tsx'
import { DiagramCanvas } from '../diagram/DiagramCanvas.tsx'
import type { DiagramEditor } from '../diagram/editor.ts'
import { EditorToolbar } from '../diagram/EditorToolbar.tsx'
import { FieldPopover } from '../diagram/FieldPopover.tsx'
import { LastChange } from '../diagram/LastChange.tsx'
import { LockBadges } from '../diagram/LockBadges.tsx'
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
  const board = useQuery({
    queryKey: ['boards', boardId],
    queryFn: () => fetchBoard(boardId),
    // Without access the page asks again from time to time and opens the board once the owner gives access.
    refetchInterval: (query) => (isForbidden(query.state.error) ? ACCESS_POLL_INTERVAL : false),
  })
  const user = useCurrentUser()

  if (board.isPending || user.isPending) return <Message>Загрузка…</Message>
  if (isNotFound(board.error)) return <BoardNotFound />
  if (isForbidden(board.error)) return <NoAccess boardId={boardId} />
  if (board.isError || user.isError) return <Message alert>Не удалось загрузить доску</Message>
  return <BoardWorkspace board={board.data} user={user.data} />
}

function BoardWorkspace({ board, user }: { board: Board; user: CurrentUser }) {
  const queryClient = useQueryClient()
  const identity = useMemo(() => participantIdentity(user), [user])
  // Who the elements this participant adds and changes name as who changed them last.
  const author = useMemo<Author>(() => ({ id: user.id, name: user.name }), [user.id, user.name])
  const viewer = !canEdit(board)
  const connection = useBoardConnection(board.id, identity, viewer)
  const { status, participants, document, awareness, notifyBoardChanged, notifyCommentsChanged } = connection
  const [editor, setEditor] = useState<DiagramEditor | null>(null)
  usePresencePublisher(editor, awareness)
  // The trail of the laser pointer and the message at the cursor go with the connection.
  const online = status === 'synced'
  useLaserPublisher(editor, awareness, online)
  // Until the page fetches the role again, the access of the connection may be narrower than the role.
  const readOnly = viewer || connection.readOnly
  // A participant who may only view never writes to the document: collab would reject it, and their document would
  // differ from everybody else's. A board nobody has edited yet has no page for them.
  useEffect(() => {
    if (document && !readOnly) initializeDocument(document)
  }, [document, readOnly])
  const pages = usePages(document, !readOnly)
  // Versions of the board, which whoever edits it sees; a selected version shows in place of the board.
  const [historyOpen, setHistoryOpen] = useState(false)
  const [previewed, setPreviewed] = useState<BoardVersion | null>(null)
  const managesVersions = canManageVersions(board)
  const preview = managesVersions && previewed && document ? previewed : null
  // Comments of the board, which every participant reads and writes, in a panel in place of the history of versions.
  const threads = useThreads(board.id)
  const isOwner = board.role === 'owner'
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentDraft, setCommentDraft] = useState<ThreadDraft | null>(null)
  const [commentFocus, setCommentFocus] = useState<ThreadFocus | null>(null)
  // The threads the panel shows: with the resolved ones, the canvas marks the resolved threads at points too.
  const [commentFilter, setCommentFilter] = useState<ThreadFilter>('open')
  const openComments = useCallback(() => {
    setCommentsOpen(true)
    setHistoryOpen(false)
    setPreviewed(null)
  }, [])
  const closeComments = () => {
    setCommentsOpen(false)
    setCommentDraft(null)
    setCommentFocus(null)
    setCommentFilter('open')
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
  // One change of the address per render: a second one would start from the same address and undo the first.
  const changeParams = useCallback(
    (change: (params: URLSearchParams) => void) =>
      setSearchParams(
        (params) => {
          const next = new URLSearchParams(params)
          change(next)
          return next
        },
        { replace: true },
      ),
    [setSearchParams],
  )
  const selectPage = useCallback((id: string) => changeParams((params) => params.set('page', id)), [changeParams])
  // An unknown page, e.g. one deleted by another participant, is replaced with the first page.
  useEffect(() => {
    if (currentPage && currentPage.id !== requestedPage) selectPage(currentPage.id)
  }, [currentPage, requestedPage, selectPage])

  // A board created from a file on the list of boards gets the pages of the file once its document is synced.
  useEffect(() => {
    const pending = document && takePendingImport(board.id)
    if (!pending) return
    const [first] = importPages(document, pending, author)
    if (first) selectPage(first)
  }, [document, board.id, selectPage, author])

  // Following another participant and presenting to everybody.
  const following = useFollowing({ awareness, editor, pages, currentPageId: currentPage?.id ?? null, selectPage })
  const { leader } = following
  // Moving the canvas on one's own ends following; the buttons of the banner over it are not the canvas.
  const stopFollowing = (event: SyntheticEvent) => {
    if (!(event.target instanceof Element && event.target.closest(BANNER_SELECTOR))) following.stop()
  }

  // Going to a thread: switch to its page, then show its element or its point once that page is shown.
  const revealing = useRef<CommentThread | null>(null)
  /**
   * Shows the element or the point of the thread, at once or once its page is on the canvas; `true` when that page is
   * another one.
   */
  const revealThread = useCallback(
    (thread: CommentThread) => {
      if (editor && editor.pageId === thread.pageId) {
        reveal(editor, thread)
        return false
      }
      revealing.current = thread
      return true
    },
    [editor],
  )
  const showThread = (thread: CommentThread) => {
    if (pages.some((page) => page.id === thread.pageId) && revealThread(thread)) selectPage(thread.pageId)
  }
  useEffect(() => {
    const thread = revealing.current
    if (!editor || !thread || editor.pageId !== thread.pageId) return
    reveal(editor, thread)
    revealing.current = null
  }, [editor])
  /** Starts a new thread about an element of the current page or at a point of it, in the panel. */
  const commentOn = useCallback(
    (target: CommentTarget) => {
      if (!editor) return
      openComments()
      setCommentFocus(null)
      setCommentDraft(
        'cellId' in target
          ? { pageId: editor.pageId, cellId: target.cellId, point: null }
          : // Whole units of the diagram are precise enough for a mark, even zoomed in.
            { pageId: editor.pageId, cellId: null, point: { x: Math.round(target.point.x), y: Math.round(target.point.y) } },
      )
    },
    [editor, openComments],
  )
  // A click with the comment tool of the canvas starts a thread at its point.
  useEffect(() => editor?.onCommentPoint((point) => commentOn({ point })), [editor, commentOn])
  const showThreadsOf = (cellId: string) => {
    if (!editor) return
    openComments()
    setCommentFocus({ pageId: editor.pageId, cellId })
  }
  const showThreadAtPoint = (thread: CommentThread) => {
    openComments()
    setCommentFocus({ threadId: thread.id })
  }
  // A link, e.g. from a notification, asks the page once to open something: the page opens it as soon as it can and
  // takes the request out of the address, so that a reload does not open it again.
  // `?thread=` opens the comments on that thread, once the threads and the pages are there, and goes to its page and
  // its element; a thread that is gone opens the comments only.
  const linkedThread = searchParams.get('thread')
  const readyLink = linkedThread !== null && threads.data && pages.length > 0 ? linkedThread : null
  const [openedLink, setOpenedLink] = useState<string | null>(null)
  if (readyLink !== openedLink) {
    setOpenedLink(readyLink)
    if (readyLink) {
      const thread = threads.data?.find((candidate) => candidate.id === readyLink)
      openComments()
      setCommentDraft(null)
      setCommentFocus(thread ? { threadId: thread.id } : null)
    }
  }
  useEffect(() => {
    if (!linkedThread || !threads.data || pages.length === 0) return
    const thread = threads.data.find((candidate) => candidate.id === linkedThread)
    const shown = thread && pages.some((page) => page.id === thread.pageId) ? thread : null
    if (shown) revealThread(shown)
    changeParams((params) => {
      params.delete('thread')
      if (shown) params.set('page', shown.pageId)
    })
  }, [linkedThread, threads.data, pages, revealThread, changeParams])

  // `?share=` opens «Поделиться», e.g. on the requests for access, which it fetches again.
  const shareLinked = searchParams.has('share')
  const [shareOpen, setShareOpen] = useState(false)
  const [openedShare, setOpenedShare] = useState(false)
  if (shareLinked !== openedShare) {
    setOpenedShare(shareLinked)
    if (shareLinked) setShareOpen(true)
  }
  useEffect(() => {
    if (!shareLinked) return
    void queryClient.invalidateQueries({ queryKey: accessRequestsKey(board.id), exact: true })
    changeParams((params) => params.delete('share'))
  }, [shareLinked, queryClient, board.id, changeParams])

  if (status === 'not-found') return <BoardNotFound />
  if (status === 'forbidden') return <NoAccess boardId={board.id} />

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
        {viewer && <EditRequestButton boardId={board.id} />}
        <DrawioActions
          document={document}
          title={board.title}
          onImported={selectPage}
          readOnly={readOnly}
          author={author}
        />
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
          // The presenter leads and follows nobody.
          onFollow={following.presenting ? undefined : following.follow}
          followingClientId={leader?.clientId ?? null}
          className="ml-auto shrink-0"
        />
        <PresentButton
          presenting={following.presenting}
          disabled={!awareness}
          onToggle={following.presenting ? following.stopPresenting : following.startPresenting}
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
          open={shareOpen}
          onOpenChange={setShareOpen}
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
            <div
              className="relative min-h-0 flex-1"
              onPointerDownCapture={leader ? stopFollowing : undefined}
              onWheelCapture={leader ? stopFollowing : undefined}
              style={leader ? { outline: `2px solid ${leader.color}`, outlineOffset: -2 } : undefined}
            >
              <FollowingBanner following={following} color={identity.color} />
              {document && currentPage ? (
                <>
                  <DiagramCanvas
                    document={document}
                    pageId={currentPage.id}
                    histories={histories}
                    readOnly={readOnly}
                    participantName={author.name}
                    participantId={author.id}
                    onEditor={setEditor}
                  />
                  <PresenceLayer editor={editor} awareness={awareness} identity={identity} />
                  <CursorChat editor={editor} awareness={awareness} online={online} color={identity.color} />
                  <CommentBadges editor={editor} threads={threads.data} onOpen={showThreadsOf} />
                  <CommentPins
                    editor={editor}
                    boardId={board.id}
                    threads={threads.data}
                    draft={commentDraft}
                    showResolved={commentsOpen && commentFilter === 'resolved'}
                    focusedThreadId={commentFocus && 'threadId' in commentFocus ? commentFocus.threadId : null}
                    userId={user.id}
                    isOwner={isOwner}
                    onOpen={showThreadAtPoint}
                    onChanged={notifyCommentsChanged}
                  />
                  <LockBadges editor={editor} />
                  {!readOnly && <QuickConnect editor={editor} />}
                  {!readOnly && <FieldPopover editor={editor} />}
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
                onSelect={(id) => {
                  following.stop()
                  selectPage(id)
                }}
                onAdd={() => selectPage(addPage(document, currentPage?.id))}
                onRename={(id, name) => renamePage(document, id, name)}
                onDuplicate={(id) => {
                  const copy = duplicatePage(document, id, author)
                  if (copy) selectPage(copy)
                }}
                onDelete={(id) => deletePage(document, id)}
                onMove={(id, index) => movePage(document, id, index)}
                readOnly={readOnly}
              >
                <LastChange editor={editor} />
              </PageTabs>
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
            onFilterChange={setCommentFilter}
            onShow={showThread}
            onChanged={notifyCommentsChanged}
            onClose={closeComments}
          />
        )}
        {managesVersions && historyOpen && (
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

/** Selects the element of the thread and brings it into view, or brings its point to the middle of the canvas. */
function reveal(editor: DiagramEditor, thread: CommentThread) {
  if (thread.cellId) editor.revealCell(thread.cellId)
  else if (thread.point) editor.centerOn(thread.point)
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
