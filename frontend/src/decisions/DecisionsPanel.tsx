import { FileArchive, FolderOpen, Plus, ScrollText, Upload, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent } from 'react'
import * as Y from 'yjs'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { CommentThread } from '../api/comments.ts'
import {
  addDecision,
  deleteDecision,
  linkDecision,
  updateDecision,
  type Decision,
  type DecisionContent,
  type DecisionElement,
} from '../api/decisions.ts'
import { HttpError } from '../api/http.ts'
import { listStatuses } from '../board/statusList.ts'
import { useCellInfo } from '../comments/useComments.ts'
import type { DiagramEditor } from '../diagram/editor.ts'
import { downloadBlob, fileName } from '../lib/download.ts'
import { zipBytes } from '../lib/zip.ts'
import { DecisionCard, type DecisionActions } from './DecisionCard.tsx'
import { DecisionDiscussion } from './DecisionDiscussion.tsx'
import { DecisionForm } from './DecisionForm.tsx'
import {
  countByStatus,
  DECISION_STATUSES,
  filterDecisions,
  newContent,
  reviewSuggestions,
  sameElement,
  statusLabel,
  today,
  type DecisionFilter,
  type DecisionFocus,
} from './decisions.ts'
import { importDecisions, reportText } from './importDecisions.ts'
import { madrFileName, recordFiles, toMadr } from './madr.ts'
import { decisionsMessages as m } from './messages.ts'
import { useDecisionChange } from './useDecisions.ts'

interface DecisionsPanelProps {
  boardId: string
  boardTitle: string
  userId: string
  isOwner: boolean
  /** The owner and the editors write decisions down, change, link and delete them; everybody reads and discusses them. */
  canEdit: boolean
  decisions: Decision[] | undefined
  /** The decisions failed to load. */
  failed: boolean
  /** The threads of the board; the panel shows those about decisions. */
  threads: CommentThread[] | undefined
  pages: { id: string; name: string }[]
  currentPageId: string | null
  /** The board document, for the elements the decisions are about. */
  document: Y.Doc | null
  /** The canvas of the current page, whose selected elements a decision is linked to. */
  editor: DiagramEditor | null
  focus: DecisionFocus | null
  onFocusChange: (focus: DecisionFocus | null) => void
  /** Goes to the page of an element and selects it. */
  onShowElement: (pageId: string, cellId: string) => void
  /** Tells the other participants that the decisions changed. */
  onChanged: () => void
  /** Tells the other participants that the comments changed. */
  onCommentsChanged: () => void
  onClose: () => void
}

/** Problems of a change of decisions as the panel says them. */
function failure(error: unknown, fallback: string): string {
  if (error instanceof HttpError && error.status === 409 && error.problem?.limit !== undefined) {
    return m.limit(error.problem.limit)
  }
  return fallback
}

/** The ids of the selected cells, the same array until the selection changes. */
function useSelection(editor: DiagramEditor | null): string[] {
  const subscribe = useCallback((onChange: () => void) => editor?.onSelectionChange(onChange) ?? (() => {}), [editor])
  const key = useSyncExternalStore(subscribe, () => editor?.selectedCellIds().join('\n') ?? '')
  return useMemo(() => (key === '' ? [] : key.split('\n')), [key])
}

/**
 * The architecture decisions of the board in the format of MADR: by number, filtered by status or to those of an
 * element, each with its sections, its elements and its discussion; new ones, files of MADR one by one or in a `.zip`,
 * and an import of a folder of records.
 */
export function DecisionsPanel({
  boardId,
  boardTitle,
  userId,
  isOwner,
  canEdit,
  decisions,
  failed,
  threads,
  pages,
  currentPageId,
  document,
  editor,
  focus,
  onFocusChange,
  onShowElement,
  onChanged,
  onCommentsChanged,
  onClose,
}: DecisionsPanelProps) {
  const [filter, setFilter] = useState<DecisionFilter>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // The decision of a focus opens among all of them; the decisions of an element show whatever their status.
  const [focusShown, setFocusShown] = useState<DecisionFocus | null>(null)
  if (focusShown !== focus) {
    setFocusShown(focus)
    if (focus) setFilter('all')
    if (focus && 'decisionId' in focus) setExpandedId(focus.decisionId)
  }
  const [creating, setCreating] = useState<DecisionElement[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [importReport, setImportReport] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const filesInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const cellInfo = useCellInfo(document)
  const selectedIds = useSelection(editor)
  const pageId = editor?.pageId ?? null
  const selection = useMemo(
    () => (pageId ? selectedIds.map((cellId) => ({ pageId, cellId })) : []),
    [pageId, selectedIds],
  )

  const add = useDecisionChange(boardId, onChanged, (variables: DecisionContent & { elements: DecisionElement[] }) =>
    addDecision(boardId, variables),
  )
  const update = useDecisionChange(boardId, onChanged, ({ decision, content }: { decision: Decision; content: DecisionContent }) =>
    updateDecision(boardId, decision.id, content),
  )
  const link = useDecisionChange(boardId, onChanged, ({ decision, elements }: { decision: Decision; elements: DecisionElement[] }) =>
    linkDecision(boardId, decision.id, elements),
  )
  const remove = useDecisionChange(boardId, onChanged, (decision: Decision) => deleteDecision(boardId, decision.id))
  const imported = useDecisionChange(boardId, onChanged, (files: { name: string; text: string }[]) =>
    importDecisions(boardId, files, decisions ?? []),
  )
  const all = decisions ?? []
  const actions: DecisionActions = {
    update: (decision, content) => update.mutateAsync({ decision, content }),
    link: (decision, elements) => link.mutateAsync({ decision, elements }),
    remove: (decision) => remove.mutateAsync(decision),
    download: (decision) =>
      downloadBlob(new Blob([toMadr(decision, all)], { type: 'text/markdown;charset=utf-8' }), madrFileName(decision)),
  }

  useEffect(() => {
    if (!focus || !('decisionId' in focus) || !decisions) return
    list.current?.querySelector(`[data-decision="${focus.decisionId}"]`)?.scrollIntoView?.({ block: 'nearest' })
  }, [focus, decisions])

  const startCreating = () => {
    setImportReport(null)
    // A new decision is about the selected elements, or about the element whose decisions are shown.
    const elements = selection.filter((element) => cellInfo(element.pageId, element.cellId))
    setCreating(elements.length > 0 ? elements : focus && 'cellId' in focus ? [focus] : [])
  }

  const downloadAll = () => {
    const bytes = zipBytes(all.map((decision) => ({ name: madrFileName(decision), text: toMadr(decision, all) })))
    downloadBlob(new Blob([bytes], { type: 'application/zip' }), fileName(m.zipName(boardTitle), 'zip'))
  }

  const importChosen = async (event: ChangeEvent<HTMLInputElement>, fromFolder: boolean) => {
    const chosen = recordFiles([...(event.target.files ?? [])], fromFolder)
    event.target.value = ''
    if (chosen.length === 0) {
      setImportReport(fromFolder ? m.noRecordsInFolder : m.noMdFiles)
      return
    }
    setImporting(true)
    setImportReport(null)
    try {
      const files = await Promise.all(
        chosen.map(async (file) => ({ name: file.webkitRelativePath || file.name, text: await file.text() })),
      )
      setImportReport(reportText(await imported.mutateAsync(files)))
    } catch {
      setImportReport(m.importFailed)
    } finally {
      setImporting(false)
    }
  }

  const elementFocus = focus && 'cellId' in focus ? focus : null
  const elementInfo = elementFocus && cellInfo(elementFocus.pageId, elementFocus.cellId)
  const counts = countByStatus(all)
  const shown = filterDecisions(all, filter, focus)
  const decisionThreads = (decisionId: string) => threads?.filter((thread) => thread.decisionId === decisionId) ?? []
  const expanded = shown.find((decision) => decision.id === expandedId)
  // Statuses are read only for a proposal that is open: the suggestions are for it.
  const statuses = canEdit && document && expanded?.status === 'proposed' ? listStatuses(document) : []
  const filters: [DecisionFilter, string, number][] = [
    ['all', m.all, all.length],
    ...DECISION_STATUSES.map((status): [DecisionFilter, string, number] => [status, statusLabel(status), counts[status]]),
  ]

  return (
    <aside aria-label={m.decisions} className="flex w-80 shrink-0 flex-col border-l bg-background">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <ScrollText className="size-4 text-muted-foreground" />
        <h3 className="flex-1 text-sm font-semibold">{m.decisions}</h3>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={m.closeDecisions} onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="flex flex-col gap-2 border-b p-3">
        <div role="group" aria-label={m.whichDecisions} className="flex flex-wrap gap-1">
          {filters.map(([value, label, count]) => (
            <Button
              key={value}
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={filter === value}
              className={cn('h-7 px-2 text-xs', filter === value && 'bg-accent')}
              onClick={() => setFilter(value)}
            >
              {label}
              {/* A space of its own, so that the name is «Принято 2», not «Принято2». */}{' '}
              <span className="text-muted-foreground">{count}</span>
            </Button>
          ))}
        </div>
        {elementFocus && (
          <div className="flex items-center gap-1 rounded-md bg-muted/60 px-2 py-1 text-xs">
            <span className="min-w-0 flex-1 truncate">
              {m.elementDecisionsOf}{' '}
              <span className="font-medium">
                {elementInfo ? (elementInfo.label !== '' ? m.quoted(elementInfo.label) : m.unlabeledLower) : m.deletedMark}
              </span>
            </span>
            <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-xs" onClick={() => onFocusChange(null)}>
              {m.allDecisions}
            </Button>
          </div>
        )}
        {creating ? (
          <DecisionForm
            initial={newContent('', today())}
            decisionId={null}
            decisions={all}
            label={m.newDecision}
            submitLabel={m.record}
            pending={add.isPending}
            error={add.isError ? failure(add.error, m.recordFailed) : null}
            onSubmit={(content) =>
              void add.mutateAsync({ ...content, elements: creating }).then(
                (decision) => {
                  setCreating(null)
                  setExpandedId(decision.id)
                  add.reset()
                },
                () => {},
              )
            }
            onCancel={() => {
              setCreating(null)
              add.reset()
            }}
          >
            {creating.length > 0 && (
              <div role="group" aria-label={m.decisionElements} className="flex flex-wrap gap-1">
                {creating.map((element) => {
                  const cell = cellInfo(element.pageId, element.cellId)
                  const label = cell?.label ? m.quoted(cell.label) : m.unlabeled
                  return (
                    <span
                      key={`${element.pageId}:${element.cellId}`}
                      className="flex items-center gap-0.5 rounded-md bg-muted px-1.5 py-0.5 text-xs"
                    >
                      {label}
                      <button
                        type="button"
                        aria-label={m.dontLink(label)}
                        className="rounded hover:bg-accent"
                        onClick={() => setCreating(creating.filter((other) => !sameElement(other, element)))}
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  )
                })}
              </div>
            )}
          </DecisionForm>
        ) : (
          <div className="flex flex-wrap gap-1">
            {canEdit && (
              <Button type="button" variant="outline" size="sm" onClick={startCreating}>
                <Plus />
                {m.newDecision}
              </Button>
            )}
            <Button type="button" variant="ghost" size="sm" disabled={all.length === 0} onClick={downloadAll}>
              <FileArchive />
              {m.downloadZip}
            </Button>
            {canEdit && (
              <Popover open={importOpen} onOpenChange={setImportOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" disabled={importing}>
                    <Upload />
                    {importing ? m.importing : m.import}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="flex w-64 flex-col p-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="justify-start"
                    onClick={() => {
                      setImportOpen(false)
                      folderInput.current?.click()
                    }}
                  >
                    <FolderOpen />
                    {m.adrFolder}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="justify-start"
                    onClick={() => {
                      setImportOpen(false)
                      filesInput.current?.click()
                    }}
                  >
                    <Upload />
                    {m.madrFiles}
                  </Button>
                </PopoverContent>
              </Popover>
            )}
            <input
              ref={filesInput}
              type="file"
              accept=".md,.markdown,text/markdown"
              multiple
              hidden
              aria-label={m.decisionFiles}
              onChange={(event) => void importChosen(event, false)}
            />
            <input
              // `webkitdirectory` chooses a folder; React does not know the attribute.
              ref={(input) => {
                folderInput.current = input
                input?.setAttribute('webkitdirectory', '')
              }}
              type="file"
              multiple
              hidden
              aria-label={m.decisionFolder}
              onChange={(event) => void importChosen(event, true)}
            />
          </div>
        )}
        {importReport && (
          <p role="status" className="text-xs text-muted-foreground">
            {importReport}
          </p>
        )}
      </div>
      <div ref={list} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
        {!decisions && !failed && <p className="p-2 text-sm text-muted-foreground">{m.loading}</p>}
        {failed && (
          <p role="alert" className="p-2 text-sm text-destructive">
            {m.loadFailed}
          </p>
        )}
        {decisions && shown.length === 0 && (
          <p className="p-2 text-sm text-muted-foreground">
            {elementFocus
              ? m.noElementDecisions
              : all.length > 0
                ? m.noStatusDecisions
                : `${m.noDecisions}${canEdit ? m.noDecisionsHint : ''}`}
          </p>
        )}
        {shown.map((decision) => (
          <DecisionCard
            key={decision.id}
            decision={decision}
            decisions={all}
            expanded={decision.id === expandedId}
            highlighted={focus !== null && 'decisionId' in focus && focus.decisionId === decision.id}
            canEdit={canEdit}
            cellInfo={cellInfo}
            pages={pages}
            selection={selection}
            suggestions={decision.id === expandedId ? reviewSuggestions(decision, statuses) : []}
            actions={actions}
            discussion={
              <DecisionDiscussion
                boardId={boardId}
                userId={userId}
                isOwner={isOwner}
                decisionId={decision.id}
                threads={decisionThreads(decision.id)}
                pageId={currentPageId ?? pages[0]?.id ?? null}
                highlightedThreadId={focus && 'threadId' in focus ? (focus.threadId ?? null) : null}
                onChanged={onCommentsChanged}
              />
            }
            onToggle={() => setExpandedId(decision.id === expandedId ? null : decision.id)}
            onShowElement={(element) => onShowElement(element.pageId, element.cellId)}
          />
        ))}
      </div>
    </aside>
  )
}
