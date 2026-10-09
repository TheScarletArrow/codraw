import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { CurrentUser } from '../api/auth.ts'
import { fetchBoard, type Board } from '../api/boards.ts'
import { isForbidden, isNotFound } from '../api/http.ts'
import { fetchProposal, withdrawProposal, type Proposal } from '../api/proposals.ts'
import { useCurrentUser } from '../auth/session.ts'
import { DetailCrumbs } from '../board/DetailCrumbs.tsx'
import { CanvasSearch } from '../board/CanvasSearch.tsx'
import { ConfirmedAction } from '../board/ConfirmedAction.tsx'
import { Minimap } from '../board/Minimap.tsx'
import { PageTabs } from '../board/PageTabs.tsx'
import { StatusBadges } from '../board/StatusBadges.tsx'
import type { ConnectionStatus } from '../board/useBoardConnection.ts'
import { useImageUploads } from '../board/imageUploads.ts'
import { ImageUploadError, ImageUploadProgress } from '../board/ImageUploadStatus.tsx'
import { usePages } from '../board/usePages.ts'
import type { Author } from '../diagram/attribution.ts'
import { PageHistories } from '../diagram/binding.ts'
import { CanvasMenu } from '../diagram/CanvasMenu.tsx'
import { DiagramCanvas } from '../diagram/DiagramCanvas.tsx'
import type { ContextMenuRequest, DiagramEditor } from '../diagram/editor.ts'
import { EditorToolbar } from '../diagram/EditorToolbar.tsx'
import { FieldPopover } from '../diagram/FieldPopover.tsx'
import { LastChange } from '../diagram/LastChange.tsx'
import { LockBadges } from '../diagram/LockBadges.tsx'
import { initializeDocument } from '../diagram/model.ts'
import { addPage, deletePage, duplicatePage, movePage, renamePage } from '../diagram/pages.ts'
import { QuickConnect } from '../diagram/QuickConnect.tsx'
import { StickyPanel } from '../diagram/StickyPanel.tsx'
import { StickySignatures } from '../diagram/StickySignatures.tsx'
import { ShapePalette } from '../diagram/ShapePalette.tsx'
import { ShortcutsHelp } from '../diagram/ShortcutsHelp.tsx'
import { DrawioActions } from '../drawio/DrawioActions.tsx'
import { ImageExportMenu } from '../image/ImageExportMenu.tsx'
import { EdgeApiPanel, type EdgeApiRequest } from '../edgeApi/EdgeApiPanel.tsx'
import { DeleteElementDialog, MergeElementsDialog } from '../elements/ElementDialogs.tsx'
import { ElementsButton, ElementsPanel, type ElementsRequest } from '../elements/ElementsPanel.tsx'
import { PropertiesButton, PropertiesPanel, SidePanels, type PropertiesRequest } from '../elements/PropertiesPanel.tsx'
import { SharedBadges } from '../elements/SharedBadges.tsx'
import { useRevealCell } from '../elements/useRevealCell.ts'
import { SaveToLibraryDialog } from '../libraries/SaveToLibraryDialog.tsx'
import { useLibraries } from '../libraries/useLibraries.ts'
import { LinkDialog } from '../links/LinkDialog.tsx'
import { ShapeLinks } from '../links/ShapeLinks.tsx'
import { proposalKey, proposalsKey, reviewPath, STATUS_LABELS } from '../proposals/proposals.ts'
import { applySchemaUpdate, takePendingSchemaImportUpdate } from '../proposals/schemaImportUpdate.ts'
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
  const appliedImport = useRef<string | null>(null)
  // The author adds images to the draft; they are images of the board, which it gets when the proposal is accepted.
  const imageUploads = useImageUploads(readOnly ? null : { boardId: board.id, proposalId: proposal.id })
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
  useEffect(() => {
    if (!document || readOnly || appliedImport.current === proposal.id) return
    const update = takePendingSchemaImportUpdate(proposal.id)
    appliedImport.current = proposal.id
    if (!update) return
    applySchemaUpdate(document, update.pageId, update.cells, author)
    selectPage(update.pageId)
  }, [document, readOnly, proposal.id, author, selectPage])
  const showCell = useRevealCell(editor, selectPage)

  // The window of the link of an element, which the menu of a right click opens on the canvas of a page.
  const [linking, setLinking] = useState<{ editor: DiagramEditor; request: ContextMenuRequest } | null>(null)
  const libraries = useLibraries()
  const [savingToLibrary, setSavingToLibrary] = useState<{ editor: DiagramEditor; request: ContextMenuRequest } | null>(null)
  // The description of the call of an edge that its menu asked to edit.
  const [apiRequest, setApiRequest] = useState<EdgeApiRequest | null>(null)
  // The panel of properties, open until it is closed, and the element whose properties the menu asked for.
  const [propertiesOpen, setPropertiesOpen] = useState(false)
  const [propertiesRequest, setPropertiesRequest] = useState<PropertiesRequest | null>(null)
  // The panel of the elements of the board, and the element whose cells the menu or a badge asked for.
  const [elementsOpen, setElementsOpen] = useState(false)
  const [elementsRequest, setElementsRequest] = useState<ElementsRequest | null>(null)
  const showWhereUsed = (key: string) => {
    setElementsOpen(true)
    setElementsRequest({ key })
  }
  // The window that merges the selected shapes into one element, or that removes an element from all pages.
  const [elementWindow, setElementWindow] = useState<{
    kind: 'merge' | 'delete'
    editor: DiagramEditor
    request: ContextMenuRequest
  } | null>(null)

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
        <DrawioActions
          document={document}
          title={proposal.title}
          onImported={selectPage}
          readOnly={readOnly}
          author={author}
          images={imageUploads.host}
        />
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
        <div className="flex shrink-0 items-center gap-1">
          <PropertiesButton open={propertiesOpen} onToggle={() => setPropertiesOpen((open) => !open)} />
          <ElementsButton open={elementsOpen} onToggle={() => setElementsOpen((open) => !open)} />
          <ShortcutsHelp readOnly={readOnly} collaboration={false} />
        </div>
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
      <div aria-live="polite">
        <ImageUploadProgress state={imageUploads.state} />
      </div>
      <ImageUploadError state={imageUploads.state} onDismiss={imageUploads.dismiss} />
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
        {!readOnly && <ShapePalette editor={editor} libraries={libraries} />}
        <div className="relative flex min-w-0 flex-1 flex-col">
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
                  images={imageUploads.host}
                  onEditor={setEditor}
                  onDropComponent={libraries.drop}
                />
                <StickySignatures editor={editor} />
                <DetailCrumbs document={document} pageId={currentPage.id} onSelectPage={selectPage} />
                <StatusBadges editor={editor} document={document} />
                <SharedBadges editor={editor} document={document} onShow={showWhereUsed} />
                <LockBadges editor={editor} />
                <ShapeLinks editor={editor} pages={pages} onSelectPage={selectPage} />
                {!readOnly && <QuickConnect editor={editor} />}
                {!readOnly && <FieldPopover editor={editor} />}
                {!readOnly && <StickyPanel editor={editor} />}
                <SidePanels>
                  <EdgeApiPanel editor={editor} request={apiRequest} />
                  {propertiesOpen && (
                    <PropertiesPanel
                      editor={editor}
                      document={document}
                      request={propertiesRequest}
                      onClose={() => {
                        setPropertiesOpen(false)
                        editor?.focus()
                      }}
                    />
                  )}
                  {elementsOpen && (
                    <ElementsPanel
                      document={document}
                      canPlace={!readOnly}
                      request={elementsRequest}
                      onShow={showCell}
                      onClose={() => {
                        setElementsOpen(false)
                        editor?.focus()
                      }}
                    />
                  )}
                </SidePanels>
                <CanvasMenu
                  editor={editor}
                  onEdgeApi={readOnly ? undefined : (cellId) => setApiRequest({ cellId })}
                  onProperties={(cellId) => {
                    setPropertiesOpen(true)
                    setPropertiesRequest({ cellId })
                  }}
                  onWhereUsed={(cellId) => {
                    const element = editor?.selectedElement()
                    showWhereUsed(element?.elementId ?? `${currentPage.id}/${cellId}`)
                  }}
                  onDeleteElementEverywhere={
                    readOnly || !editor ? undefined : (request) => setElementWindow({ kind: 'delete', editor, request })
                  }
                  onMergeElements={readOnly || !editor ? undefined : (request) => setElementWindow({ kind: 'merge', editor, request })}
                  onDetail={selectPage}
                  onLink={readOnly || !editor ? undefined : (request) => setLinking({ editor, request })}
                  onSaveToLibrary={editor ? (request) => setSavingToLibrary({ editor, request }) : undefined}
                />
                {elementWindow &&
                  elementWindow.editor === editor &&
                  (elementWindow.kind === 'merge' ? (
                    <MergeElementsDialog
                      editor={elementWindow.editor}
                      request={elementWindow.request}
                      onClose={() => setElementWindow(null)}
                    />
                  ) : (
                    <DeleteElementDialog
                      editor={elementWindow.editor}
                      document={document}
                      request={elementWindow.request}
                      onClose={() => setElementWindow(null)}
                    />
                  ))}
                {savingToLibrary && savingToLibrary.editor === editor && (
                  <SaveToLibraryDialog
                    editor={savingToLibrary.editor}
                    shelf={libraries}
                    request={savingToLibrary.request}
                    onClose={() => setSavingToLibrary(null)}
                  />
                )}
                {linking && linking.editor === editor && (
                  <LinkDialog
                    editor={linking.editor}
                    request={linking.request}
                    pages={pages}
                    currentPageId={currentPage.id}
                    boardId={board.id}
                    onClose={() => setLinking(null)}
                  />
                )}
                <Minimap editor={editor} />
              </>
            ) : (
              <Message>{document && readOnly ? 'Черновик пока пуст' : 'Загрузка черновика…'}</Message>
            )}
          </div>
          {document && currentPage && (
            <CanvasSearch document={document} pages={pages} pageId={currentPage.id} editor={editor} onSelectPage={selectPage} />
          )}
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
