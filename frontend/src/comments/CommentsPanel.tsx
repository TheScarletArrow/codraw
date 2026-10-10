import { MessageSquare, MessageSquarePlus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { startThread, type CommentText, type CommentThread, type ThreadPoint } from '../api/comments.ts'
import { CommentComposer } from './CommentComposer.tsx'
import { commentsMessages as m } from './messages.ts'
import { ThreadCard } from './ThreadCard.tsx'
import {
  filterFor,
  filterThreads,
  groupByPage,
  isFocused,
  threadTarget,
  type ThreadFilter,
  type ThreadFocus,
} from './threads.ts'
import { useCellInfo, useCommentChange, usePeople, useThreadActions } from './useComments.ts'

/** What a new thread will be about: an element of a page, a point of it, or the page when neither is set. */
export interface ThreadDraft {
  pageId: string
  cellId: string | null
  point: ThreadPoint | null
}

/**
 * The field of a new thread stays while the draft keeps its page and its element, or stands at a point anywhere: a new
 * point moves the draft and keeps what was typed.
 */
const draftKey = ({ pageId, cellId, point }: ThreadDraft) =>
  `${pageId}:${cellId !== null ? `cell:${cellId}` : point ? 'point' : 'page'}`

const FILTERS: ThreadFilter[] = ['open', 'resolved', 'mentions', 'assigned']

interface CommentsPanelProps {
  boardId: string
  userId: string
  isOwner: boolean
  threads: CommentThread[] | undefined
  /** The threads failed to load. */
  failed: boolean
  pages: { id: string; name: string }[]
  currentPageId: string | null
  /** The board document, for what the threads are about. */
  document: Y.Doc | null
  draft: ThreadDraft | null
  onDraftChange: (draft: ThreadDraft | null) => void
  focus: ThreadFocus | null
  /** Learns which threads the panel shows, e.g. to show the marks of resolved threads on the canvas with them. */
  onFilterChange?: (filter: ThreadFilter) => void
  /** Goes to the page of the thread and to its element or its point. */
  onShow: (thread: CommentThread) => void
  /** Tells the other participants that the comments changed. */
  onChanged: () => void
  onClose: () => void
}

/**
 * The comments of the board: threads by page, the current page first, filtered to the open, the resolved, those that
 * mention the participant or those assigned to them, and a new thread about the page or about the element chosen on the
 * canvas.
 */
export function CommentsPanel({
  boardId,
  userId,
  isOwner,
  threads,
  failed,
  pages,
  currentPageId,
  document,
  draft,
  onDraftChange,
  focus,
  onFilterChange,
  onShow,
  onChanged,
  onClose,
}: CommentsPanelProps) {
  const [filter, setFilter] = useState<ThreadFilter>('open')
  useEffect(() => onFilterChange?.(filter), [filter, onFilterChange])
  // A new thread and the threads of an element from its badge come into view among the open ones, a thread from a
  // notification among those it belongs to, once the threads are known.
  const loaded = threads !== undefined
  const [shownFor, setShownFor] = useState({ focus, draft, loaded: false })
  if (shownFor.focus !== focus || shownFor.draft !== draft || shownFor.loaded !== loaded) {
    setShownFor({ focus, draft, loaded })
    if (focus && (focus !== shownFor.focus || loaded !== shownFor.loaded)) setFilter(filterFor(focus, threads))
    else if (draft && draft !== shownFor.draft) setFilter('open')
  }
  const people = usePeople(boardId).data ?? []
  const cellInfo = useCellInfo(document)
  const list = useRef<HTMLDivElement>(null)

  const start = useCommentChange(boardId, onChanged, (variables: ThreadDraft & CommentText) =>
    startThread(boardId, variables),
  )
  const actions = useThreadActions(boardId, onChanged)

  useEffect(() => {
    if (!focus || !threads) return
    const first = threads.find((thread) => isFocused(thread, focus))
    list.current?.querySelector(`[data-thread="${first?.id}"]`)?.scrollIntoView?.({ block: 'nearest' })
  }, [focus, threads, filter])

  const shown = threads ? filterThreads(threads, filter, userId) : []
  const groups = groupByPage(shown, pages, currentPageId)
  const draftTarget = draft && threadTarget(draft, draft.cellId === null ? null : cellInfo(draft.pageId, draft.cellId))

  return (
    <aside aria-label={m.comments} className="flex w-80 shrink-0 flex-col border-l bg-background">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <MessageSquare className="size-4 text-muted-foreground" />
        <h3 className="flex-1 text-sm font-semibold">{m.comments}</h3>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={m.closeComments} onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="flex flex-col gap-2 border-b p-3">
        <div role="group" aria-label={m.whichThreads} className="flex flex-wrap gap-1">
          {FILTERS.map((value) => (
            <Button
              key={value}
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={filter === value}
              className={cn('h-7 px-2 text-xs', filter === value && 'bg-accent')}
              onClick={() => setFilter(value)}
            >
              {m.filters[value]}
            </Button>
          ))}
        </div>
        {draft && draftTarget ? (
          <div role="group" aria-label={m.newThread} className="flex flex-col gap-1.5">
            <p className="text-xs text-muted-foreground">
              {m.newThreadLabel} <span className="font-medium text-foreground">{draftTarget.label}</span>
            </p>
            <CommentComposer
              key={draftKey(draft)}
              people={people}
              label={m.newComment}
              placeholder={m.commentPlaceholder}
              submitLabel={m.send}
              autoFocus
              pending={start.isPending}
              error={start.isError ? m.sendFailed : null}
              onSubmit={(text) => start.mutateAsync({ ...draft, ...text }).then(() => onDraftChange(null))}
              onCancel={() => onDraftChange(null)}
            />
          </div>
        ) : (
          currentPageId && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onDraftChange({ pageId: currentPageId, cellId: null, point: null })}
            >
              <MessageSquarePlus />
              {m.pageComment}
            </Button>
          )
        )}
      </div>
      <div ref={list} className="min-h-0 flex-1 overflow-y-auto p-2">
        {!threads && !failed && <p className="p-2 text-sm text-muted-foreground">{m.loading}</p>}
        {failed && (
          <p role="alert" className="p-2 text-sm text-destructive">
            {m.loadFailed}
          </p>
        )}
        {threads && groups.length === 0 && <p className="p-2 text-sm text-muted-foreground">{m.empty[filter]}</p>}
        {groups.map((group) => (
          <section key={group.pageId ?? 'deleted'} aria-label={group.title} className="mb-3 flex flex-col gap-2 last:mb-0">
            <h4 className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{group.title}</h4>
            {group.threads.map((thread) => (
              <ThreadCard
                key={thread.id}
                thread={thread}
                cell={thread.cellId === null ? null : cellInfo(thread.pageId, thread.cellId)}
                userId={userId}
                isOwner={isOwner}
                people={people}
                highlighted={isFocused(thread, focus)}
                actions={actions}
                onShow={onShow}
              />
            ))}
          </section>
        ))}
      </div>
    </aside>
  )
}
