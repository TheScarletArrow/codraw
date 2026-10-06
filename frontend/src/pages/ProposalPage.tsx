import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { CurrentUser } from '../api/auth.ts'
import { fetchBoard, type Board } from '../api/boards.ts'
import { isForbidden, isNotFound } from '../api/http.ts'
import { fetchProposal, withdrawProposal, type Proposal } from '../api/proposals.ts'
import { useCurrentUser } from '../auth/session.ts'
import { ConfirmedAction } from '../board/ConfirmedAction.tsx'
import { PageTabs } from '../board/PageTabs.tsx'
import type { ConnectionStatus } from '../board/useBoardConnection.ts'
import { usePages } from '../board/usePages.ts'
import type { Author } from '../diagram/attribution.ts'
import { PageHistories } from '../diagram/binding.ts'
import { CanvasMenu } from '../diagram/CanvasMenu.tsx'
import { DiagramCanvas } from '../diagram/DiagramCanvas.tsx'
import type { DiagramEditor } from '../diagram/editor.ts'
import { EditorToolbar } from '../diagram/EditorToolbar.tsx'
import { FieldPopover } from '../diagram/FieldPopover.tsx'
import { LastChange } from '../diagram/LastChange.tsx'
import { LockBadges } from '../diagram/LockBadges.tsx'
import { initializeDocument } from '../diagram/model.ts'
import { addPage, deletePage, duplicatePage, movePage, renamePage } from '../diagram/pages.ts'
import { QuickConnect } from '../diagram/QuickConnect.tsx'
import { ShapePalette } from '../diagram/ShapePalette.tsx'
import { ShortcutsHelp } from '../diagram/ShortcutsHelp.tsx'
import { DrawioActions } from '../drawio/DrawioActions.tsx'
import { ImageExportMenu } from '../image/ImageExportMenu.tsx'
import { proposalKey, proposalsKey, reviewPath, STATUS_LABELS } from '../proposals/proposals.ts'
import { useDraftConnection } from '../proposals/useDraftConnection.ts'
import { SqlMenu } from '../sql/SqlMenu.tsx'

const STATUS_LABELS_OF_DRAFT: Record<ConnectionStatus, string> = {
  connecting: 'Подключение',
  synced: 'Синхронизировано',
  offline: 'Нет связи',
  'not-found': 'Предложение не найдено',
  forbidden: 'Нет доступа',
}

const STATUS_COLORS: Record<ConnectionStatus, string> = {
  connecting: 'bg-muted-foreground',
  synced: 'bg-success',
  offline: 'bg-destructive',
  'not-found': 'bg-destructive',
  forbidden: 'bg-destructive',
}

/**
 * The draft of a proposal of changes: its author edits it with every tool of the board, while the board stays as it is
 * until the owner or an editor accepts the proposal; they and everybody once the proposal is closed view it only.
 */
export function ProposalPage() {
  const { boardId = '', proposalId = '' } = useParams()
  const board = useQuery({ queryKey: ['boards', boardId], queryFn: () => fetchBoard(boardId) })
  const proposal = useQuery({ queryKey: proposalKey(boardId, proposalId), queryFn: () => fetchProposal(boardId, proposalId) })
  const user = useCurrentUser()

  if (board.isPending || user.isPending || proposal.isPending) return <Message>Загрузка…</Message>
  if (user.isError) return <Message alert>Не удалось загрузить предложение</Message>
  if (isNotFound(board.error)) return <Message alert>Доска не найдена</Message>
  if (isForbidden(board.error) || isForbidden(proposal.error)) return <Message alert>Нет доступа</Message>
  if (isNotFound(proposal.error)) return <Message alert>Предложение не найдено</Message>
  if (board.isError || proposal.isError) return <Message alert>Не удалось загрузить предложение</Message>
  return <DraftWorkspace key={`${user.data.id}:${proposal.data.id}`} board={board.data} proposal={proposal.data} user={user.data} />
}

function DraftWorkspace({ board, proposal, user }: { board: Board; proposal: Proposal; user: CurrentUser }) {
  const queryClient = useQueryClient()
  const connection = useDraftConnection(board.id, proposal.id)
  const { status, document } = connection
  // Who the elements of the draft name as who changed them last: the changes are those of the author.
  const author = useMemo<Author>(() => ({ id: user.id, name: user.name }), [user.id, user.name])
  const mine = proposal.author.id === user.id
  const open = proposal.status === 'open'
  // Collab decides: the author edits an open proposal, anybody else and a closed one are for viewing.
  const readOnly = connection.readOnly
  const [editor, setEditor] = useState<DiagramEditor | null>(null)
  useEffect(() => {
    if (document && !readOnly) initializeDocument(document)
  }, [document, readOnly])
  const pages = usePages(document, !readOnly)
  const histories = useMemo(() => document && new PageHistories(document), [document])
  useEffect(() => () => histories?.destroy(), [histories])

  const [searchParams, setSearchParams] = useSearchParams()
  const requestedPage = searchParams.get('page')
  const currentPage = pages.find((page) => page.id === requestedPage) ?? pages[0] ?? null
  const selectPage = useCallback(
    (id: string) => setSearchParams((params) => new URLSearchParams({ ...Object.fromEntries(params), page: id }), { replace: true }),
    [setSearchParams],
  )
  useEffect(() => {
    if (currentPage && currentPage.id !== requestedPage) selectPage(currentPage.id)
  }, [currentPage, requestedPage, selectPage])

  const withdraw = useMutation({
    mutationFn: () => withdrawProposal(board.id, proposal.id),
    onSuccess: (withdrawn) => {
      queryClient.setQueryData(proposalKey(board.id, proposal.id), withdrawn)
      connection.notifyProposalsChanged()
      return queryClient.invalidateQueries({ queryKey: proposalsKey(board.id) })
    },
  })
  const boardLink = mine ? `/boards/${encodeURIComponent(board.id)}` : reviewPath(board.id, proposal.id)

  if (status === 'not-found') return <Message alert>Предложение не найдено</Message>
  if (status === 'forbidden') return <Message alert>Нет доступа</Message>

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* One line, as on the board: the tools that appear with a selection must not move the canvas down. */}
      <div className="flex items-center gap-x-4 border-b px-3 py-2">
        <h1 className="min-w-0 truncate font-semibold">{proposal.title}</h1>
        <span role="status" className="flex shrink-0 items-center gap-1.5 text-sm whitespace-nowrap text-muted-foreground">
          <span aria-hidden className={cn('size-2 rounded-full', STATUS_COLORS[status])} />
          {STATUS_LABELS_OF_DRAFT[status]}
        </span>
        {readOnly && (
          <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-sm whitespace-nowrap text-muted-foreground">
            Только просмотр
          </span>
        )}
        <DrawioActions document={document} title={proposal.title} onImported={selectPage} readOnly={readOnly} author={author} />
        <ImageExportMenu
          editor={editor}
          document={document}
          boardTitle={proposal.title}
          pageName={currentPage?.name ?? ''}
          pageCount={pages.length}
        />
        <SqlMenu
          editor={editor}
          document={document}
          pageId={currentPage?.id ?? null}
          boardTitle={proposal.title}
          pageName={currentPage?.name ?? ''}
          pageCount={pages.length}
          readOnly={readOnly}
        />
        <span aria-hidden className="h-5 w-px shrink-0 bg-border" />
        {/* Nobody else is on a draft, and comments are about the board: no laser pointer and no comment tool. */}
        <EditorToolbar editor={editor} readOnly={readOnly} collaboration={false} />
        <ShortcutsHelp readOnly={readOnly} collaboration={false} />
      </div>
      <div
        role="note"
        aria-live="polite"
        className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted px-3 py-1.5 text-sm"
      >
        <span className="flex-1">{banner(proposal, board, mine)}</span>
        {withdraw.isError && (
          <span role="alert" className="text-destructive">
            Не удалось отозвать предложение
          </span>
        )}
        <Button asChild variant="outline" size="sm">
          <Link to={boardLink}>К доске</Link>
        </Button>
        {mine && open && (
          <ConfirmedAction
            label="Отозвать"
            title="Отзыв предложения"
            confirmLabel="Отозвать"
            variant="outline"
            disabled={withdraw.isPending}
            onConfirm={() => withdraw.mutate()}
          >
            Предложение закроется, а его черновик останется только для просмотра.
          </ConfirmedAction>
        )}
      </div>
      {connection.tooLarge && (
        <div
          role="alert"
          className="flex items-center gap-x-3 border-b bg-destructive/10 px-3 py-1.5 text-sm text-destructive"
        >
          <span className="flex-1">
            Черновик достиг предельного размера, последнее изменение не сохранено. Удалите лишнее, чтобы продолжить
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={connection.dismissTooLarge}>
            Понятно
          </Button>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        {!readOnly && <ShapePalette editor={editor} />}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            {document && currentPage ? (
              <>
                <DiagramCanvas
                  document={document}
                  pageId={currentPage.id}
                  histories={histories}
                  readOnly={readOnly}
                  participantName={author.name}
                  participantId={author.id}
                  collaboration={false}
                  onEditor={setEditor}
                />
                <LockBadges editor={editor} />
                {!readOnly && <QuickConnect editor={editor} />}
                {!readOnly && <FieldPopover editor={editor} />}
                <CanvasMenu editor={editor} />
              </>
            ) : (
              <Message>{document && readOnly ? 'Черновик пока пуст' : 'Загрузка черновика…'}</Message>
            )}
          </div>
          {document && (
            <PageTabs
              pages={pages}
              currentPageId={currentPage?.id ?? null}
              onSelect={selectPage}
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
      </div>
    </div>
  )
}

/** What the page of a draft is, as the line under its header says it. */
function banner(proposal: Proposal, board: Board, mine: boolean): string {
  if (proposal.status !== 'open') {
    return `Предложение «${proposal.title}» — ${STATUS_LABELS[proposal.status].toLowerCase()}: черновик только для просмотра`
  }
  if (mine) return `Предложение «${proposal.title}»: правки не попадают на доску, пока их не примут`
  return `Черновик предложения «${proposal.title}» к доске «${board.title}» от ${proposal.author.name} — только для просмотра`
}

function Message({ children, alert = false }: { children: string; alert?: boolean }) {
  return (
    <p role={alert ? 'alert' : undefined} className={cn('p-6', alert ? 'text-destructive' : 'text-muted-foreground')}>
      {children}
    </p>
  )
}
