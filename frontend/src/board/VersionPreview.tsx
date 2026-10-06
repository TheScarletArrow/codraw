import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GitCompareArrows } from 'lucide-react'
import { useMemo, useState } from 'react'
import * as Y from 'yjs'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { fetchVersionState, saveVersion, type BoardVersion } from '../api/versions.ts'
import { restoreDocument } from '../diagram/restore.ts'
import { VersionView } from './VersionView.tsx'
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

/**
 * A version of the board in place of the board, for viewing only, or compared with the board (see {@link VersionView}).
 * Restoring keeps the current state as a version first.
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
      {state.isError ? (
        <p role="alert" className="p-6 text-destructive">
          Не удалось загрузить версию
        </p>
      ) : versionDocument ? (
        <VersionView version={versionDocument} board={comparing ? document : null} participantId={participantId} />
      ) : (
        <p className="p-6 text-muted-foreground">Загрузка версии…</p>
      )}
    </section>
  )
}
