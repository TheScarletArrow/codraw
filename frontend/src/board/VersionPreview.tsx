import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GitCompareArrows } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as Y from 'yjs'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { fetchVersionState, saveVersion, type BoardVersion } from '../api/versions.ts'
import { DiagramCanvas } from '../diagram/DiagramCanvas.tsx'
import type { ChangeType } from '../diagram/diff.ts'
import type { DiagramEditor, Point } from '../diagram/editor.ts'
import { LastChange } from '../diagram/LastChange.tsx'
import { restoreDocument } from '../diagram/restore.ts'
import { ChangeHighlights } from './ChangeHighlights.tsx'
import { ChangeList, type ChangeTarget } from './ChangeList.tsx'
import { ghostCenter } from './changes.ts'
import { PageTabs } from './PageTabs.tsx'
import { useBoardDiff } from './useBoardDiff.ts'
import { usePages } from './usePages.ts'
import { versionsKey, versionTimeFormat } from './versions.ts'

interface VersionPreviewProps {
  boardId: string
  version: BoardVersion
  /** The live board document, which a restore brings to the content of the version. */
  document: Y.Doc
  /** The board is shown as it is now, with its changes since the version, in place of the version. */
  comparing: boolean
  onCompareChange: (comparing: boolean) => void
  /** The id of the user who looks: who changed the selected element last says «(вы)» for their own changes. */
  participantId?: string
  onRestored: () => void
  onClose: () => void
}

/** An element chosen in the list of changes, with the middle of its ghost when it was removed. */
interface Revealed extends ChangeTarget {
  ghost: Point | null
}

/**
 * A version of the board in place of the board, for viewing only: its own pages on a canvas of its own, which publishes
 * no presence, so other participants do not see whoever looks at it on pages they do not have. Restoring keeps the
 * current state as a version first.
 *
 * Compared with the board, the canvas shows a page as the board has it now, read-only, with the changes since the
 * version over it and the list of the changes beside it; a page removed since the version is shown as the version has it.
 * Under the canvas, as on the board, is who changed the selected element last.
 */
export function VersionPreview({
  boardId,
  version,
  document,
  comparing,
  onCompareChange,
  participantId,
  onRestored,
  onClose,
}: VersionPreviewProps) {
  const state = useQuery({
    queryKey: [...versionsKey(boardId), version.id],
    queryFn: () => fetchVersionState(boardId, version.id),
    staleTime: Infinity,
  })
  // A plain document without a provider: nothing to destroy, it goes away with the preview.
  const versionDocument = useMemo(() => {
    if (!state.data) return null
    const doc = new Y.Doc()
    Y.applyUpdate(doc, state.data)
    return doc
  }, [state.data])

  const versionPages = usePages(versionDocument, false)
  const boardPages = usePages(comparing ? document : null, false)
  const diff = useBoardDiff(versionDocument, comparing ? document : null)
  // Compared, the pages of the board now, then those removed since the version.
  const pages = useMemo(() => {
    if (!diff) return versionPages
    const current = new Set(boardPages.map((page) => page.id))
    return [...boardPages, ...versionPages.filter((page) => !current.has(page.id))]
  }, [diff, boardPages, versionPages])
  const [pageId, setPageId] = useState<string | null>(null)
  const currentPage = pages.find((page) => page.id === pageId) ?? pages[0] ?? null
  const onBoard = diff !== null && boardPages.some((page) => page.id === currentPage?.id)
  const pageChanges = useMemo(
    () => diff && new Map<string, ChangeType>(diff.pages.map((page) => [page.id, page.type])),
    [diff],
  )
  const [editor, setEditor] = useState<DiagramEditor | null>(null)

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

  const queryClient = useQueryClient()
  const restore = useMutation({
    mutationFn: async (target: Y.Doc) => {
      // The current state first: if it cannot be kept, the board stays as it is.
      await saveVersion(boardId, Y.encodeStateAsUpdate(document), 'restore')
      restoreDocument(document, target)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: versionsKey(boardId), exact: true })
      onRestored()
    },
  })
  const [confirming, setConfirming] = useState(false)

  const time = versionTimeFormat.format(new Date(version.createdAt))
  return (
    <section aria-label={`Версия от ${time}`} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b bg-muted/50 px-3 py-2 text-sm">
        <span className="font-medium">{comparing ? `Изменения после версии от ${time}` : `Версия от ${time}`}</span>
        <span className="text-muted-foreground">только просмотр</span>
        <span className="flex-1" />
        {restore.isError && (
          <span role="alert" className="text-destructive">
            Не удалось восстановить версию
          </span>
        )}
        <Button
          type="button"
          variant={comparing ? 'secondary' : 'outline'}
          size="sm"
          aria-pressed={comparing}
          disabled={!versionDocument}
          onClick={() => onCompareChange(!comparing)}
        >
          <GitCompareArrows />
          Сравнить с текущей
        </Button>
        <Popover open={confirming} onOpenChange={setConfirming}>
          <PopoverTrigger asChild>
            <Button type="button" size="sm" disabled={!versionDocument || restore.isPending}>
              Восстановить эту версию
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-1" onCloseAutoFocus={(event) => event.preventDefault()}>
            <div role="alertdialog" aria-label="Восстановление версии" className="flex flex-col gap-2 p-2">
              <p className="text-sm">
                Доска станет такой, как в версии от {time}, у всех участников. Текущее состояние сохранится в истории.
              </p>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                  Отмена
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setConfirming(false)
                    if (versionDocument) restore.mutate(versionDocument)
                  }}
                >
                  Восстановить
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Закрыть
        </Button>
      </div>
      <div className="flex min-h-0 flex-1">
        {diff && (
          <ChangeList
            diff={diff}
            pages={pages}
            currentPageId={currentPage?.id ?? null}
            selected={selected}
            onSelect={showChange}
          />
        )}
        <div className="relative min-h-0 min-w-0 flex-1">
          {state.isError ? (
            <p role="alert" className="p-6 text-destructive">
              Не удалось загрузить версию
            </p>
          ) : versionDocument && currentPage ? (
            <>
              <DiagramCanvas
                document={onBoard ? document : versionDocument}
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
            <p className="p-6 text-muted-foreground">{versionDocument ? 'В версии нет страниц' : 'Загрузка версии…'}</p>
          )}
        </div>
      </div>
      {versionDocument && (
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
      )}
    </section>
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
