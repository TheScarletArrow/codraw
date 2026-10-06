import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { History, X } from 'lucide-react'
import * as Y from 'yjs'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { fetchVersions, saveVersion, type BoardVersion } from '../api/versions.ts'
import { REASON_LABELS, versionsKey, versionTimeFormat } from './versions.ts'

interface VersionHistoryProps {
  boardId: string
  /** The live board document; saving a version sends its state. */
  document: Y.Doc | null
  selectedId: string | null
  onSelect: (version: BoardVersion) => void
  onClose: () => void
}

/**
 * The versions of a board for whoever edits it: the list, most recent first, and saving the current state as a version.
 */
export function VersionHistory({ boardId, document, selectedId, onSelect, onClose }: VersionHistoryProps) {
  const queryClient = useQueryClient()
  const versions = useQuery({ queryKey: versionsKey(boardId), queryFn: () => fetchVersions(boardId) })
  const save = useMutation({
    mutationFn: (doc: Y.Doc) => saveVersion(boardId, Y.encodeStateAsUpdate(doc), 'manual'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: versionsKey(boardId), exact: true }),
  })

  return (
    <aside aria-label="История версий" className="flex w-72 shrink-0 flex-col border-l bg-background">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <History className="size-4 text-muted-foreground" />
        <h3 className="flex-1 text-sm font-semibold">История версий</h3>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Закрыть историю" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="flex flex-col gap-1 border-b p-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!document || save.isPending}
          onClick={() => document && save.mutate(document)}
        >
          Сохранить версию
        </Button>
        {save.isError && (
          <p role="alert" className="text-sm text-destructive">
            Не удалось сохранить версию
          </p>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {versions.isPending && <p className="p-2 text-sm text-muted-foreground">Загрузка…</p>}
        {versions.isError && (
          <p role="alert" className="p-2 text-sm text-destructive">
            Не удалось загрузить версии
          </p>
        )}
        {versions.data?.length === 0 && (
          <p className="p-2 text-sm text-muted-foreground">
            Версий пока нет: они сохраняются по ходу работы над доской, не реже раза в 10 минут.
          </p>
        )}
        {versions.data && versions.data.length > 0 && (
          <ul aria-label="Версии" className="flex flex-col">
            {versions.data.map((version) => (
              <li key={version.id}>
                <button
                  type="button"
                  aria-pressed={version.id === selectedId}
                  className={cn(
                    'flex w-full flex-col rounded-md px-2 py-1.5 text-left hover:bg-accent',
                    version.id === selectedId && 'bg-accent',
                  )}
                  onClick={() => onSelect(version)}
                >
                  <time dateTime={version.createdAt} className="text-sm">
                    {versionTimeFormat.format(new Date(version.createdAt))}
                  </time>
                  <span className="text-xs text-muted-foreground">{REASON_LABELS[version.reason]}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
