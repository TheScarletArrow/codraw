import { useEffect, useMemo, useRef, useState } from 'react'
import * as Y from 'yjs'
import { DiagramCanvas } from '../diagram/DiagramCanvas.tsx'
import type { ChangeType } from '../diagram/diff.ts'
import type { DiagramEditor, Point } from '../diagram/editor.ts'
import { LastChange } from '../diagram/LastChange.tsx'
import { ChangeHighlights } from './ChangeHighlights.tsx'
import { ChangeList, type ChangeTarget } from './ChangeList.tsx'
import { ghostCenter } from './changes.ts'
import { PageTabs } from './PageTabs.tsx'
import { useBoardDiff } from './useBoardDiff.ts'
import { usePages } from './usePages.ts'

interface VersionViewProps {
  /** An earlier state of the board, e.g. a version. */
  version: Y.Doc
  /** The board now, compared with the version; `null` shows the version alone. */
  board: Y.Doc | null
  /** What the list of changes says when the board has not changed since the version. */
  unchanged?: string
  /** The id of the user who looks: who changed the selected element last says «(вы)» for their own changes. */
  participantId?: string
  /** Reports the page the canvas shows, `null` without pages. */
  onPageChange?: (pageId: string | null) => void
  /** Reports the ids of the cells selected on the canvas, an empty list when the canvas changes. */
  onSelectionChange?: (ids: string[]) => void
  /** Brings an element of the list of changes back as the version has it; without it the list offers none. */
  onRevert?: (target: ChangeTarget) => void
}

/** An element chosen in the list of changes, with the middle of its ghost when it was removed. */
interface Revealed extends ChangeTarget {
  ghost: Point | null
}

/**
 * An earlier state of the board for viewing only: its own pages on a canvas of its own, which publishes no presence, so
 * other participants do not see whoever looks at it on pages they do not have.
 *
 * Compared with the board, the canvas shows a page as the board has it now, read-only, with the changes since the
 * earlier state over it and the list of the changes beside it; a page removed since is shown as the earlier state has
 * it. Nothing is written to either document. Under the canvas, as on the board, is who changed the selected element
 * last.
 */
export function VersionView({
  version,
  board,
  unchanged,
  participantId,
  onPageChange,
  onSelectionChange,
  onRevert,
}: VersionViewProps) {
  const versionPages = usePages(version, false)
  const boardPages = usePages(board, false)
  const diff = useBoardDiff(version, board)
  // Compared, the pages of the board now, then those removed since the version.
  const pages = useMemo(() => {
    if (!diff) return versionPages
    const current = new Set(boardPages.map((page) => page.id))
    return [...boardPages, ...versionPages.filter((page) => !current.has(page.id))]
  }, [diff, boardPages, versionPages])
  const [pageId, setPageId] = useState<string | null>(null)
  const currentPage = pages.find((page) => page.id === pageId) ?? pages[0] ?? null
  const shown = diff && board && boardPages.some((page) => page.id === currentPage?.id) ? board : version
  const pageChanges = useMemo(
    () => diff && new Map<string, ChangeType>(diff.pages.map((page) => [page.id, page.type])),
    [diff],
  )
  const [editor, setEditor] = useState<DiagramEditor | null>(null)
  const shownPageId = currentPage?.id ?? null
  useEffect(() => onPageChange?.(shownPageId), [onPageChange, shownPageId])
  useEffect(() => {
    onSelectionChange?.([])
    return editor && onSelectionChange ? editor.onSelectionChange(onSelectionChange) : undefined
  }, [editor, onSelectionChange])

  // Going to a change: switch to its page, then show its element once that page is shown.
  const [selected, setSelected] = useState<ChangeTarget | null>(null)
  const revealing = useRef<Revealed | null>(null)
  const showChange = (target: ChangeTarget) => {
    const page = diff?.pages.find((item) => item.id === target.pageId)
    const removed = page?.cells.some((change) => change.id === target.cellId && change.type === 'removed')
    const revealed = { ...target, ghost: removed && page?.before ? ghostCenter(page.before.cells, target.cellId) : null }
    setSelected(target)
    if (editor && editor.pageId === target.pageId) {
      reveal(editor, revealed)
      return
    }
    revealing.current = revealed
    setPageId(target.pageId)
  }
  useEffect(() => {
    const target = revealing.current
    if (!editor || !target || editor.pageId !== target.pageId) return
    reveal(editor, target)
    revealing.current = null
  }, [editor])

  return (
    <>
      <div className="flex min-h-0 flex-1">
        {diff && (
          <ChangeList
            diff={diff}
            pages={pages}
            currentPageId={currentPage?.id ?? null}
            selected={selected}
            onSelect={showChange}
            onRevert={onRevert}
            unchanged={unchanged}
          />
        )}
        <div className="relative min-h-0 min-w-0 flex-1">
          {currentPage ? (
            <>
              <DiagramCanvas
                document={shown}
                pageId={currentPage.id}
                readOnly
                participantId={participantId}
                onEditor={setEditor}
              />
              {diff && (
                <ChangeHighlights
                  editor={editor}
                  page={diff.pages.find((page) => page.id === currentPage.id)}
                  selectedId={selected?.pageId === currentPage.id ? selected.cellId : null}
                />
              )}
            </>
          ) : (
            <p className="p-6 text-muted-foreground">В версии нет страниц</p>
          )}
        </div>
      </div>
      <PageTabs
        pages={pages}
        currentPageId={currentPage?.id ?? null}
        onSelect={setPageId}
        onAdd={() => {}}
        onRename={() => {}}
        onDuplicate={() => {}}
        onDelete={() => {}}
        onMove={() => {}}
        readOnly
        changes={pageChanges ?? undefined}
      >
        <LastChange editor={editor} />
      </PageTabs>
    </>
  )
}

/**
 * Shows an element on the canvas of its page: selects it and centres the canvas on it, or, for an element the canvas
 * does not have because it was removed, selects nothing and centres the canvas on its ghost.
 */
function reveal(editor: DiagramEditor, { cellId, ghost }: Revealed) {
  if (editor.revealCell(cellId)) return
  editor.clearSelection()
  if (ghost) editor.centerOn(ghost)
}
