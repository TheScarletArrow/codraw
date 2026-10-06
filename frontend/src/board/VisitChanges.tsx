import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import * as Y from 'yjs'
import { Button } from '@/components/ui/button'
import { fetchVisitBaseline } from '../api/visits.ts'
import { VersionView } from './VersionView.tsx'
import { visitBaselineKey, visitTime } from './visit.ts'

interface VisitChangesProps {
  boardId: string
  /** When the previous visit ended. */
  since: string
  /** The live board document, which is compared and never changed. */
  document: Y.Doc
  /** The id of the user who looks: who changed the selected element last says «(вы)» for their own changes. */
  participantId?: string
  onClose: () => void
}

/**
 * The changes of the board since the previous visit of the user, in place of the board and for viewing only: the
 * version the visit starts from compared with the board now, as «Сравнить с текущей» shows a version. Every participant
 * gets that version, a viewer too.
 */
export function VisitChanges({ boardId, since, document, participantId, onClose }: VisitChangesProps) {
  const state = useQuery({
    queryKey: visitBaselineKey(boardId, since),
    queryFn: () => fetchVisitBaseline(boardId),
    staleTime: Infinity,
  })
  // A plain document without a provider: nothing to destroy, it goes away with the view.
  const baseline = useMemo(() => {
    if (!state.data) return null
    const doc = new Y.Doc()
    Y.applyUpdate(doc, state.data)
    return doc
  }, [state.data])

  return (
    <section aria-label="Изменения с прошлого визита" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b bg-muted/50 px-3 py-2 text-sm">
        <span className="font-medium">{`Изменения с вашего прошлого визита (${visitTime(new Date(since))})`}</span>
        <span className="text-muted-foreground">только просмотр</span>
        <span className="flex-1" />
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Закрыть
        </Button>
      </div>
      {state.isError ? (
        <p role="alert" className="p-6 text-destructive">
          Не удалось загрузить изменения
        </p>
      ) : baseline ? (
        <VersionView
          version={baseline}
          board={document}
          unchanged="С вашего прошлого визита доска не менялась."
          participantId={participantId}
        />
      ) : (
        <p className="p-6 text-muted-foreground">Загрузка изменений…</p>
      )}
    </section>
  )
}
