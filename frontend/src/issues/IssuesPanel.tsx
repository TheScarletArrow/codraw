import { X } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import type * as Y from 'yjs'
import { Button } from '@/components/ui/button'
import type { IssueLink } from '../api/issues.ts'
import { useCellInfo } from '../comments/useComments.ts'
import { AddIssue } from './AddIssue.tsx'
import { IssueLinkList } from './IssueLinkList.tsx'
import { isOf } from './issues.ts'
import { useTrackerSettings } from './useIssues.ts'

/** The element whose issues the panel shows, e.g. from its menu or its badge; a new object for every request. */
export interface IssuesRequest {
  pageId: string
  cellId: string
}

/**
 * «Задачи» of an element: the issues of the tracker linked to it, and linking or creating more for whoever edits the
 * board. Everybody who may open the board sees them.
 */
export function IssuesPanel({
  boardId,
  request,
  document,
  links,
  guest,
  canEdit,
  onChanged,
  onClose,
}: {
  boardId: string
  request: IssuesRequest
  /** The document of the board, which names the element. */
  document: Y.Doc | null
  /** All links of the board. */
  links: readonly IssueLink[]
  guest: boolean
  /** The user edits the board: they link issues to elements and unlink them. */
  canEdit: boolean
  onChanged: () => void
  onClose: () => void
}) {
  const panel = useRef<HTMLElement>(null)
  // The keyboard comes to the panel when it is asked for, e.g. from the menu of the element.
  useEffect(() => panel.current?.focus(), [request])
  const settings = useTrackerSettings(!guest)
  // What the element is called on the canvas; empty for an element without a label or one deleted meanwhile.
  const label = useCellInfo(document)(request.pageId, request.cellId)?.label ?? ''
  const connected = settings.data?.connection?.working === true
  const target = useMemo(() => ({ pageId: request.pageId, cellId: request.cellId }), [request.pageId, request.cellId])
  const own = useMemo(() => links.filter((link) => isOf(link, target)), [links, target])

  return (
    <aside
      ref={panel}
      tabIndex={-1}
      aria-label="Задачи элемента"
      className="pointer-events-auto flex min-h-0 w-[320px] max-w-full flex-col overflow-hidden rounded-md border bg-background text-foreground shadow-lg outline-none"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
    >
      <header className="flex items-center gap-1 border-b px-3 py-2">
        <h2 className="mr-auto min-w-0 truncate text-sm font-semibold">{label ? `Задачи «${label}»` : 'Задачи элемента'}</h2>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Закрыть" title="Закрыть" onClick={onClose}>
          <X />
        </Button>
      </header>
      <div className="flex flex-col gap-3 overflow-y-auto p-3">
        {own.length === 0 && <p className="text-sm text-muted-foreground">К элементу не привязано задач</p>}
        <IssueLinkList
          boardId={boardId}
          links={own}
          canUnlink={() => canEdit}
          canTakeOver={canEdit && connected}
          onChanged={onChanged}
        />
        {canEdit ? (
          <AddIssue
            key={`${request.pageId}/${request.cellId}`}
            boardId={boardId}
            target={target}
            guest={guest}
            defaultTitle={label}
            elementLabel={label}
            onChanged={onChanged}
          />
        ) : (
          <p className="text-xs text-muted-foreground">Привязывать задачи к элементам могут владелец и редакторы доски.</p>
        )}
      </div>
    </aside>
  )
}
