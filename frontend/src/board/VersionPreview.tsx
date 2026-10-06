import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GitCompareArrows } from 'lucide-react'
import { useId, useMemo, useState, type ReactNode } from 'react'
import * as Y from 'yjs'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { fetchVersionState, saveVersion, type BoardVersion } from '../api/versions.ts'
import { snapshotPage, type CellSnapshot } from '../diagram/diff.ts'
import { restoreDocument, restorePage } from '../diagram/restore.ts'
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
  /** The board, or its page `pageId`, has the content of the version now. */
  onRestored: (pageId?: string) => void
  /** Cells of the version are to come back: the board page restores them on the canvas of their page. */
  onRestoreCells: (request: CellsRestore) => void
  onClose: () => void
}

/**
 * A version of the board in place of the board, for viewing only, or compared with the board (see {@link VersionView}).
 * The selected cells of the version, a removed or changed element of the comparison, a page or the whole version can be
 * brought back. Restoring a page or the version keeps the current state as a version first; restoring cells is an
 * ordinary change, which whoever restores undoes.
 */
export function VersionPreview({
  boardId,
  version,
  document,
  comparing,
  onCompareChange,
  participantId,
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
        {versionDocument && page && (
          <ConfirmedRestore
            label="Восстановить страницу"
            title="Восстановление страницы"
            variant="outline"
            disabled={restore.isPending}
            onConfirm={() => restore.mutate({ target: versionDocument, pageId: page.id })}
          >
            {onBoard
              ? `Страница «${page.name}» станет такой, как в версии от ${time}, у всех участников.`
              : `Страница «${page.name}» вернётся на доску такой, как в версии от ${time}, у всех участников.`}{' '}
            Текущее состояние сохранится в истории.
          </ConfirmedRestore>
        )}
        <ConfirmedRestore
          label="Восстановить эту версию"
          title="Восстановление версии"
          disabled={!versionDocument || restore.isPending}
          onConfirm={() => versionDocument && restore.mutate({ target: versionDocument })}
        >
          Доска станет такой, как в версии от {time}, у всех участников. Текущее состояние сохранится в истории.
        </ConfirmedRestore>
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

interface ConfirmedRestoreProps {
  label: string
  /** The name of the confirmation. */
  title: string
  variant?: 'default' | 'outline'
  disabled: boolean
  onConfirm: () => void
  /** What the restore does. */
  children: ReactNode
}

/** A button of a restore that changes the board for everybody once the user confirms it. */
function ConfirmedRestore({ label, title, variant = 'default', disabled, onConfirm, children }: ConfirmedRestoreProps) {
  const [confirming, setConfirming] = useState(false)
  return (
    <Popover open={confirming} onOpenChange={setConfirming}>
      <PopoverTrigger asChild>
        <Button type="button" variant={variant} size="sm" disabled={disabled}>
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-1" onCloseAutoFocus={(event) => event.preventDefault()}>
        <div role="alertdialog" aria-label={title} className="flex flex-col gap-2 p-2">
          <p className="text-sm">{children}</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Отмена
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setConfirming(false)
                onConfirm()
              }}
            >
              Восстановить
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
