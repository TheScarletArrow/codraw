import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import * as Y from 'yjs'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { fetchVersionState, saveVersion, type BoardVersion } from '../api/versions.ts'
import { DiagramCanvas } from '../diagram/DiagramCanvas.tsx'
import type { DiagramEditor } from '../diagram/editor.ts'
import { restoreDocument } from '../diagram/restore.ts'
import { PageTabs } from './PageTabs.tsx'
import { usePages } from './usePages.ts'
import { versionsKey, versionTimeFormat } from './versions.ts'

interface VersionPreviewProps {
  boardId: string
  version: BoardVersion
  /** The live board document, which a restore brings to the content of the version. */
  document: Y.Doc
  onRestored: () => void
  onClose: () => void
}

/**
 * A version of the board in place of the board, for viewing only: its own pages on a canvas of its own, which publishes
 * no presence, so other participants do not see whoever looks at it on pages they do not have. Restoring keeps the
 * current state as a version first.
 */
export function VersionPreview({ boardId, version, document, onRestored, onClose }: VersionPreviewProps) {
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

  const pages = usePages(versionDocument, false)
  const [pageId, setPageId] = useState<string | null>(null)
  const currentPage = pages.find((page) => page.id === pageId) ?? pages[0] ?? null
  // The canvas of a version publishes nothing; its editor is only needed by the canvas itself.
  const [, setEditor] = useState<DiagramEditor | null>(null)

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
    <section aria-label={`Версия от ${time}`} className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b bg-muted/50 px-3 py-2 text-sm">
        <span className="font-medium">Версия от {time}</span>
        <span className="text-muted-foreground">только просмотр</span>
        <span className="flex-1" />
        {restore.isError && (
          <span role="alert" className="text-destructive">
            Не удалось восстановить версию
          </span>
        )}
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
      <div className="relative min-h-0 flex-1">
        {state.isError ? (
          <p role="alert" className="p-6 text-destructive">
            Не удалось загрузить версию
          </p>
        ) : versionDocument && currentPage ? (
          <DiagramCanvas document={versionDocument} pageId={currentPage.id} readOnly onEditor={setEditor} />
        ) : (
          <p className="p-6 text-muted-foreground">{versionDocument ? 'В версии нет страниц' : 'Загрузка версии…'}</p>
        )}
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
        />
      )}
    </section>
  )
}
