import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { CurrentUser } from '../api/auth.ts'
import { canEdit, canManageVersions, fetchBoard, type Board } from '../api/boards.ts'
import type { BoardVersion } from '../api/versions.ts'
import type { CommentThread } from '../api/comments.ts'
import { isForbidden, isNotFound } from '../api/http.ts'
import { fetchProposals, type Proposal } from '../api/proposals.ts'
import { useCurrentUser } from '../auth/session.ts'
import { ACCESS_POLL_INTERVAL, accessRequestsKey } from '../board/accessRequests.ts'
import { BoardHeading } from '../board/BoardHeading.tsx'
import { CanvasSearch } from '../board/CanvasSearch.tsx'
import { CursorChat } from '../board/CursorChat.tsx'
import { EditRequestButton } from '../board/EditRequestButton.tsx'
import { participantIdentity } from '../board/identity.ts'
import { useImageUploads } from '../board/imageUploads.ts'
import { ImageUploadError, ImageUploadProgress } from '../board/ImageUploadStatus.tsx'
import { PageTabs } from '../board/PageTabs.tsx'
import { Participants, PresentButton } from '../board/Participants.tsx'
import { PresenceLayer } from '../board/PresenceLayer.tsx'
import { BANNER_SELECTOR, FollowingBanner } from '../board/FollowBanner.tsx'
import { useFollowing } from '../board/following.ts'
import { NoAccess } from '../board/NoAccess.tsx'
import { useLaserPublisher, usePresencePublisher } from '../board/presence.ts'
import { ShareButton } from '../board/ShareButton.tsx'
import { VersionHistory } from '../board/VersionHistory.tsx'
import { VersionPreview, type CellsRestore } from '../board/VersionPreview.tsx'
import { useBoardVisit } from '../board/visit.ts'
import { VisitBanner } from '../board/VisitBanner.tsx'
import { VisitChanges } from '../board/VisitChanges.tsx'
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
import { storePageImages } from '../diagram/images.ts'
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
import { UnsentCopy } from '../offline/UnsentCopy.tsx'
import { draftPath, PROPOSALS_POLL_INTERVAL, proposalsKey } from '../proposals/proposals.ts'
import { ProposalReview } from '../proposals/ProposalReview.tsx'
import { ProposalsButton } from '../proposals/ProposalsButton.tsx'
import { ProposalsPanel } from '../proposals/ProposalsPanel.tsx'

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
  if (user.isError) return <Message alert>Не удалось загрузить доску</Message>
  if (isNotFound(board.error)) return <BoardNotFound userId={user.data.id} boardId={boardId} />
  if (isForbidden(board.error)) return <BoardNoAccess userId={user.data.id} boardId={boardId} />
  if (board.isError) return <Message alert>Не удалось загрузить доску</Message>
  // Another board, or another user, is another connection and another local copy, with nothing of the previous one.
  return <BoardWorkspace key={`${user.data.id}:${board.data.id}`} board={board.data} user={user.data} />
}

function BoardWorkspace({ board, user }: { board: Board; user: CurrentUser }) {
  const queryClient = useQueryClient()
  const identity = useMemo(() => participantIdentity(user), [user])
  // Who the elements this participant adds and changes name as who changed them last.
  const author = useMemo<Author>(() => ({ id: user.id, name: user.name }), [user.id, user.name])
  const viewer = !canEdit(board)
  const connection = useBoardConnection({ id: board.id, title: board.title, viewer }, user.id, identity)
  const { status, participants, document, awareness, notifyBoardChanged, notifyCommentsChanged, notifyProposalsChanged } =
    connection
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
  // Images that the participant adds go to the board; one who only views adds none.
  const imageUploads = useImageUploads(readOnly ? null : { boardId: board.id })
  const imageHost = imageUploads.host
  // Versions of the board, which whoever edits it sees; a selected version shows in place of the board.
  const [historyOpen, setHistoryOpen] = useState(false)
  const [previewed, setPreviewed] = useState<BoardVersion | null>(null)
  // Comparing a version with the board stays on for the other versions until the history closes.
  const [comparing, setComparing] = useState(false)
  const managesVersions = canManageVersions(board)
  const preview = managesVersions && previewed && document ? previewed : null
  // What others changed since the previous visit of the user, which every participant sees and compares, a viewer too.
  const visit = useBoardVisit(board.id, status !== 'not-found' && status !== 'forbidden')
  const changedSince = visit?.since && visit.authors.length > 0 ? { ...visit, since: visit.since } : null
  const [visitHidden, setVisitHidden] = useState(false)
  const [showingVisit, setShowingVisit] = useState(false)
  const visitChanges = showingVisit && changedSince && document && !preview ? changedSince : null
  // Comments of the board, which every participant reads and writes, in a panel in place of the history of versions.
  const threads = useThreads(board.id)
  const isOwner = board.role === 'owner'
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentDraft, setCommentDraft] = useState<ThreadDraft | null>(null)
  const [commentFocus, setCommentFocus] = useState<ThreadFocus | null>(null)
  // The threads the panel shows: with the resolved ones, the canvas marks the resolved threads at points too.
  const [commentFilter, setCommentFilter] = useState<ThreadFilter>('open')
  // Proposals of changes, which every participant makes and the owner and the editors review; a reviewed proposal shows
  // in place of the board.
  const navigate = useNavigate()
  const proposals = useQuery({
    queryKey: proposalsKey(board.id),
    queryFn: () => fetchProposals(board.id),
    // Others make and decide proposals without telling every open board, e.g. from the page of a draft.
    refetchInterval: PROPOSALS_POLL_INTERVAL,
  })
  const [proposalsOpen, setProposalsOpen] = useState(false)
  const [reviewed, setReviewed] = useState<string | null>(null)
  const review = reviewed && document && !preview ? reviewed : null
  const closeHistory = useCallback(() => {
    setHistoryOpen(false)
    setPreviewed(null)
    setComparing(false)
  }, [])
  const closeProposals = useCallback(() => {
    setProposalsOpen(false)
    setReviewed(null)
  }, [])
  const openComments = useCallback(() => {
    setCommentsOpen(true)
    closeHistory()
    closeProposals()
    setShowingVisit(false)
  }, [closeHistory, closeProposals])
  const closeComments = () => {
    setCommentsOpen(false)
    setCommentDraft(null)
    setCommentFocus(null)
    setCommentFilter('open')
  }
  const openProposals = () => {
    setProposalsOpen(true)
    closeHistory()
    closeComments()
    setShowingVisit(false)
  }
  const proposalCreated = (proposal: Proposal) => {
    notifyProposalsChanged()
    void navigate(draftPath(board.id, proposal.id))
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

  // A board created from a file on the list of boards gets the pages of the file once its document is synced, and its
  // pictures are stored on the board first.
  useEffect(() => {
    const pending = document && takePendingImport(board.id)
    if (!pending) return
    void (imageHost ? storePageImages(pending, imageHost) : Promise.resolve()).then(() => {
      const [first] = importPages(document, pending, author)
      if (first) selectPage(first)
    })
  }, [document, board.id, selectPage, author, imageHost])

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
  // Restoring cells of a version: close the version and switch to their page, then restore them on its canvas, so that
  // the restore is a change of the user, laid out like any other and undone with the history of the page.
  const restoring = useRef<CellsRestore | null>(null)
  const restoreCells = (request: CellsRestore) => {
    following.stop()
    restoring.current = request
    setPreviewed(null)
    selectPage(request.pageId)
  }
  useEffect(() => {
    const request = restoring.current
    if (!editor || !request || editor.pageId !== request.pageId) return
    restoring.current = null
    editor.restoreCells(request.cells, request.ids)
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
  // `?thread=` opens the comments on that thread, once the threads are there and the board is synced, and goes to its
  // page and its element or its point; a thread that is gone opens the comments only. A local copy shown before the
  // board is synced may lack the element or the page, e.g. one added since the user was here last.
  const linkedThread = searchParams.get('thread')
  const linkable = status === 'synced' && pages.length > 0
  const readyLink = linkedThread !== null && threads.data && linkable ? linkedThread : null
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
    if (!linkedThread || !threads.data || !linkable) return
    const thread = threads.data.find((candidate) => candidate.id === linkedThread)
    const shown = thread && pages.some((page) => page.id === thread.pageId) ? thread : null
    if (shown) revealThread(shown)
    changeParams((params) => {
      params.delete('thread')
      if (shown) params.set('page', shown.pageId)
    })
  }, [linkedThread, threads.data, linkable, pages, revealThread, changeParams])

  // `?proposal=` opens the proposals with the review of that proposal, e.g. from a notification.
  const linkedProposal = searchParams.get('proposal')
  const [openedProposal, setOpenedProposal] = useState<string | null>(null)
  if (linkedProposal !== openedProposal) {
    setOpenedProposal(linkedProposal)
    if (linkedProposal) {
      openProposals()
      setReviewed(linkedProposal)
    }
  }
  useEffect(() => {
    if (linkedProposal) changeParams((params) => params.delete('proposal'))
  }, [linkedProposal, changeParams])

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

  if (status === 'not-found') return <BoardNotFound userId={user.id} boardId={board.id} title={board.title} />
  if (status === 'forbidden') return <BoardNoAccess userId={user.id} boardId={board.id} title={board.title} />
  // Without a connection a participant who edits keeps editing: the local copy keeps their edits for later. Edits go to
  // collab within moments of a synced connection, so only a longer wait shows.
  const savedLocally = status === 'offline' && connection.cached && !readOnly
  const unsent = connection.unsent && status !== 'synced'

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
            closeProposals()
            setShowingVisit(false)
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
          images={imageHost}
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
        <ProposalsButton
          proposals={proposals.data}
          open={proposalsOpen}
          onToggle={() => (proposalsOpen ? closeProposals() : openProposals())}
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
      {/* Under the header, where the tools of a selection keep their room; read out as it changes. */}
      <div aria-live="polite">
        {(savedLocally || unsent) && (
          <p role="note" className="border-b bg-muted px-3 py-1 text-sm text-muted-foreground">
            {savedLocally && 'Нет связи — правки сохраняются на этом устройстве'}
            {savedLocally && unsent && ' · '}
            {unsent && <span className="font-medium text-foreground">Не отправлено: есть правки</span>}
          </p>
        )}
        <ImageUploadProgress state={imageUploads.state} />
      </div>
      <ImageUploadError state={imageUploads.state} onDismiss={imageUploads.dismiss} />
      {connection.tooLarge && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-destructive/10 px-3 py-1.5 text-sm text-destructive"
        >
          <span className="flex-1">
            Доска достигла предельного размера, последнее изменение не сохранено. Удалите лишнее, чтобы продолжить
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={connection.dismissTooLarge}>
            Понятно
          </Button>
          {connection.setAside === 'too-large' && (
            <UnsentCopy
              userId={user.id}
              boardId={board.id}
              title={board.title}
              reason="kept"
              onDeleted={connection.copyDeleted}
              className="w-full"
            />
          )}
        </div>
      )}
      {connection.setAside === 'no-edit-right' && (
        <UnsentCopy
          userId={user.id}
          boardId={board.id}
          title={board.title}
          reason="no-edit-right"
          onDeleted={connection.copyDeleted}
          role="alert"
          className="border-b bg-destructive/10 px-3 py-1.5 text-destructive"
        />
      )}
      {changedSince && !visitHidden && !preview && !review && !visitChanges && (
        <VisitBanner
          since={changedSince.since}
          authors={changedSince.authors}
          onShow={
            changedSince.baseline
              ? () => {
                  setShowingVisit(true)
                  closeHistory()
                  closeComments()
                  closeProposals()
                }
              : null
          }
          onHide={() => setVisitHidden(true)}
        />
      )}
      <div className="flex min-h-0 flex-1">
        {!readOnly && !preview && !review && !visitChanges && <ShapePalette editor={editor} />}
        {preview && document ? (
          <VersionPreview
            key={preview.id}
            boardId={board.id}
            version={preview}
            document={document}
            comparing={comparing}
            onCompareChange={setComparing}
            participantId={author.id}
            // A restore keeps the board as a version first: the board as collab has it, not a copy behind it.
            synced={status === 'synced' && !readOnly}
            onRestored={(pageId) => {
              setPreviewed(null)
              if (pageId) selectPage(pageId)
            }}
            onRestoreCells={restoreCells}
            onClose={() => setPreviewed(null)}
          />
        ) : review && document ? (
          <ProposalReview
            key={review}
            boardId={board.id}
            proposalId={review}
            userId={user.id}
            document={document}
            reviewer={managesVersions}
            // Accepting keeps the board as a version first: the board as collab has it, not a copy behind it.
            synced={status === 'synced' && !readOnly}
            onAccepted={(pageId) => {
              setReviewed(null)
              if (pageId) selectPage(pageId)
            }}
            onChanged={notifyProposalsChanged}
            onClose={() => setReviewed(null)}
          />
        ) : visitChanges && document ? (
          <VisitChanges
            boardId={board.id}
            since={visitChanges.since}
            document={document}
            participantId={author.id}
            onClose={() => setShowingVisit(false)}
          />
        ) : (
          <div className="relative flex min-w-0 flex-1 flex-col">
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
                    images={imageHost}
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
            {/* Over the canvas but not on it: pressing on the search does not end following, going to a match does. */}
            {document && currentPage && (
              <CanvasSearch
                document={document}
                pages={pages}
                pageId={currentPage.id}
                editor={editor}
                onSelectPage={selectPage}
                onNavigate={following.stop}
              />
            )}
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
        {proposalsOpen && (
          <ProposalsPanel
            boardId={board.id}
            proposals={proposals.data}
            failed={proposals.isError}
            selectedId={review}
            onSelect={(proposal) => {
              following.stop()
              setReviewed(proposal.id)
            }}
            onCreated={proposalCreated}
            onClose={closeProposals}
          />
        )}
        {managesVersions && historyOpen && (
          <VersionHistory
            boardId={board.id}
            document={document}
            selectedId={preview?.id ?? null}
            onSelect={setPreviewed}
            onClose={closeHistory}
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

interface LostBoardProps {
  userId: string
  boardId: string
  title?: string
}

/** The board is gone; edits of its local copy that never reached it may still be downloaded. */
function BoardNotFound({ userId, boardId, title }: LostBoardProps) {
  return (
    <div>
      <Message alert>{STATUS_LABELS['not-found']}</Message>
      <UnsentCopy userId={userId} boardId={boardId} title={title} reason="kept" dropSent className="px-6" />
    </div>
  )
}

/**
 * The board gives the participant no access, which they may ask its owner for; edits of its local copy that never
 * reached it may still be downloaded.
 */
function BoardNoAccess({ userId, boardId, title }: LostBoardProps) {
  return (
    <NoAccess boardId={boardId}>
      <UnsentCopy userId={userId} boardId={boardId} title={title} reason="no-edit-right" dropSent />
    </NoAccess>
  )
}

function Message({ children, alert = false }: { children: string; alert?: boolean }) {
  return (
    <p role={alert ? 'alert' : undefined} className={cn('p-6', alert ? 'text-destructive' : 'text-muted-foreground')}>
      {children}
    </p>
  )
}
