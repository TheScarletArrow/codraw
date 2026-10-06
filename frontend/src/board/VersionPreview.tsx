import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GitCompareArrows } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import * as Y from 'yjs'
import { Button } from '@/components/ui/button'
import { fetchVersionState, saveVersion, type BoardVersion } from '../api/versions.ts'
import { snapshotPage, type CellSnapshot } from '../diagram/diff.ts'
import { restoreDocument, restorePage } from '../diagram/restore.ts'
import { ConfirmedAction } from './ConfirmedAction.tsx'
import { usePages } from './usePages.ts'
import { VersionView } from './VersionView.tsx'
import { versionsKey, versionTimeFormat } from './versions.ts'

/** Cells of a page of a version to bring back into the page of the board, see `DiagramEditor.restoreCells`. */
export interface CellsRestore {
  pageId: string
  /** The cells of the page as the version has them. */
  cells: Map<string, CellSnapshot>
  ids: string[]
}

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
  /**
   * The board is synced with collab over a connection that may edit it. Restoring a page or the version keeps the
   * current state of the board as a version first and changes the board for everybody, which needs the state of the
   * board: without a connection, or while a board shown from its local copy has not synced yet, the document lacks what
   * others changed meanwhile.
   */
  synced: boolean
  /** The board, or its page `pageId`, has the content of the version now. */
  onRestored: (pageId?: string) => void
  /** Cells of the version are to come back: the board page restores them on the canvas of their page. */
  onRestoreCells: (request: CellsRestore) => void
  onClose: () => void
}

/**
 * A version of the board in place of the board, for viewing only, or compared with the board (see {@link VersionView}).
 * The selected cells of the version, a removed or changed element of the comparison, a page or the whole version can be
 * brought back. Restoring a page or the version keeps the current state as a version first, so it waits for the board
 * to be synced; restoring cells is an ordinary change, which whoever restores undoes, also without a connection.
 */
export function VersionPreview({
  boardId,
  version,
  document,
  comparing,
  onCompareChange,
  participantId,
  synced,
  onRestored,
  onRestoreCells,
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
  const boardPages = usePages(document, false)
  // The page on the canvas and the cells selected there, which the version has when it is not compared.
  const [pageId, setPageId] = useState<string | null>(null)
  const [selection, setSelection] = useState<string[]>([])
  const page = versionPages.find((item) => item.id === pageId) ?? null
  const onBoard = boardPages.some((item) => item.id === pageId)
  const offBoardHint = useId()
  const unsyncedHint = useId()

  const queryClient = useQueryClient()
  // The whole version, or one of its pages.
  const restore = useMutation({
    mutationFn: async ({ target, pageId }: { target: Y.Doc; pageId?: string }) => {
      // The current state first: if it cannot be kept, the board stays as it is.
      await saveVersion(boardId, Y.encodeStateAsUpdate(document), 'restore')
      if (pageId) restorePage(document, target, pageId)
      else restoreDocument(document, target)
    },
    onSuccess: async (_, { pageId }) => {
      await queryClient.invalidateQueries({ queryKey: versionsKey(boardId), exact: true })
      onRestored(pageId)
    },
  })
  const restoreCells = (pageId: string, ids: string[]) => {
    const cells = versionDocument && snapshotPage(versionDocument, pageId)?.cells
    if (cells && ids.length > 0) onRestoreCells({ pageId, cells, ids })
  }

  const time = versionTimeFormat.format(new Date(version.createdAt))
  return (
    <section aria-label={`Версия от ${time}`} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted/50 px-3 py-2 text-sm">
        <span className="font-medium">{comparing ? `Изменения после версии от ${time}` : `Версия от ${time}`}</span>
        <span className="text-muted-foreground">только просмотр</span>
        <span className="flex-1" />
        {restore.isError && (
          <span role="alert" className="text-destructive">
            {restore.variables?.pageId ? 'Не удалось восстановить страницу' : 'Не удалось восстановить версию'}
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
        {/* Comparing, the canvas shows the board, and the list brings elements back. */}
        {!comparing && page && selection.length > 0 && (
          <>
            {!onBoard && (
              <span id={offBoardHint} className="text-muted-foreground">
                Страницы нет на доске
              </span>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!onBoard}
              aria-describedby={onBoard ? undefined : offBoardHint}
              onClick={() => restoreCells(page.id, selection)}
            >
              Восстановить выделенное
            </Button>
          </>
        )}
        {!synced && (
          <span id={unsyncedHint} className="text-muted-foreground">
            Версию и страницу можно восстановить после синхронизации
          </span>
        )}
        {versionDocument && page && (
          <ConfirmedAction
            label="Восстановить страницу"
            title="Восстановление страницы"
            confirmLabel="Восстановить"
            variant="outline"
            disabled={!synced || restore.isPending}
            describedBy={synced ? undefined : unsyncedHint}
            onConfirm={() => restore.mutate({ target: versionDocument, pageId: page.id })}
          >
            {onBoard
              ? `Страница «${page.name}» станет такой, как в версии от ${time}, у всех участников.`
              : `Страница «${page.name}» вернётся на доску такой, как в версии от ${time}, у всех участников.`}{' '}
            Текущее состояние сохранится в истории.
          </ConfirmedAction>
        )}
        <ConfirmedAction
          label="Восстановить эту версию"
          title="Восстановление версии"
          confirmLabel="Восстановить"
          disabled={!versionDocument || !synced || restore.isPending}
          describedBy={synced ? undefined : unsyncedHint}
          onConfirm={() => versionDocument && restore.mutate({ target: versionDocument })}
        >
          Доска станет такой, как в версии от {time}, у всех участников. Текущее состояние сохранится в истории.
        </ConfirmedAction>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Закрыть
        </Button>
      </div>
      {state.isError ? (
        <p role="alert" className="p-6 text-destructive">
          Не удалось загрузить версию
        </p>
      ) : versionDocument ? (
        <VersionView
          version={versionDocument}
          board={comparing ? document : null}
          participantId={participantId}
          onPageChange={setPageId}
          onSelectionChange={setSelection}
          onRevert={({ pageId, cellId }) => restoreCells(pageId, [cellId])}
        />
      ) : (
        <p className="p-6 text-muted-foreground">Загрузка версии…</p>
      )}
    </section>
  )
}
