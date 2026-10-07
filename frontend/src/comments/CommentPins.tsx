import { Plus } from 'lucide-react'
import { useRef, useState, useSyncExternalStore, type PointerEvent } from 'react'
import { cn } from '@/lib/utils'
import { moveThread, type CommentThread, type ThreadPoint } from '../api/comments.ts'
import type { DiagramEditor } from '../diagram/editor.ts'
import type { ThreadDraft } from './CommentsPanel.tsx'
import { isOpen, threadsAtPoints, type ThreadAtPoint } from './threads.ts'
import { useCommentChange } from './useComments.ts'

/** The size of a mark: a speech bubble whose pointed bottom-left corner stands at the point of its thread. */
const PIN_SIZE = 22
/** How far the pointer goes, in pixels, before a press on a mark drags it rather than clicks it. */
const DRAG_THRESHOLD = 4
/** The most characters of the first comment that the hint of a mark shows. */
const EXCERPT_LENGTH = 60

/** A mark being dragged by the main button, until it is released. */
interface Drag {
  threadId: string
  pointerId: number
  /** Where the press was, in client coordinates. */
  from: { x: number; y: number }
  /** The point of the thread when the press began, and where the mark is now. */
  origin: ThreadPoint
  point: ThreadPoint
  /** The pointer went far enough for a drag. */
  dragging: boolean
}

interface CommentPinsProps {
  editor: DiagramEditor | null
  boardId: string
  threads: CommentThread[] | undefined
  /** The new thread being written; at a point of this page, it has a mark of its own. */
  draft: ThreadDraft | null
  /** The panel shows the resolved threads, so their marks show too. */
  showResolved: boolean
  /** The thread the comments were opened on, e.g. from its mark; its mark is highlighted. */
  focusedThreadId: string | null
  userId: string
  /** The owner of the board moves any mark. */
  isOwner: boolean
  /** Shows the thread in the panel. */
  onOpen: (thread: CommentThread) => void
  /** Tells the other participants that the comments changed. */
  onChanged: () => void
}

/**
 * The marks of the threads of the page that stand at points: a speech bubble with the number of comments of the thread,
 * its pointed corner at the point, and the mark of a new thread at its point. The author of a thread and the owner of
 * the board drag its mark to another point. Like the badges of the elements, it is a layer over the canvas.
 */
export function CommentPins({
  editor,
  boardId,
  threads,
  draft,
  showResolved,
  focusedThreadId,
  userId,
  isOwner,
  onOpen,
  onChanged,
}: CommentPinsProps) {
  // Positions depend on scrolling and zoom: re-render whenever the view changes.
  useSyncExternalStore(editor?.onViewChange ?? noSubscription, () => editor?.getViewVersion() ?? 0)
  // Where a mark is dragged to, until its thread is fetched again with the new point, or back when the move fails.
  const [moving, setMoving] = useState<{ threadId: string; point: ThreadPoint } | null>(null)
  const drag = useRef<Drag | null>(null)
  // The click that a browser may fire after the release of a drag does not open the thread.
  const dragged = useRef(false)
  const move = useCommentChange(boardId, onChanged, ({ threadId, point }: { threadId: string; point: ThreadPoint }) =>
    moveThread(boardId, threadId, point),
  )

  if (!editor || !threads) return null
  const pins = threadsAtPoints(threads, editor.pageId, showResolved)
  const draftPoint = draft?.pageId === editor.pageId ? draft.point : null
  if (pins.length === 0 && !draftPoint) return null

  const pointOf = (thread: ThreadAtPoint) => (moving?.threadId === thread.id ? moving.point : thread.point)
  const movable = (thread: ThreadAtPoint) => isOwner || thread.comments[0]?.author?.id === userId

  const press = (event: PointerEvent<HTMLButtonElement>, thread: ThreadAtPoint) => {
    dragged.current = false
    if (event.button !== 0 || !movable(thread)) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const point = pointOf(thread)
    drag.current = {
      threadId: thread.id,
      pointerId: event.pointerId,
      from: { x: event.clientX, y: event.clientY },
      origin: point,
      point,
      dragging: false,
    }
  }
  const pull = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    if (!current.dragging && Math.hypot(event.clientX - current.from.x, event.clientY - current.from.y) < DRAG_THRESHOLD) {
      return
    }
    current.dragging = true
    // The mark keeps its place under the pointer at any zoom: it moves as far as the pointer in the diagram.
    const from = editor.toDiagramPoint(current.from.x, current.from.y)
    const to = editor.toDiagramPoint(event.clientX, event.clientY)
    current.point = { x: Math.round(current.origin.x + to.x - from.x), y: Math.round(current.origin.y + to.y - from.y) }
    setMoving({ threadId: current.threadId, point: current.point })
  }
  const release = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    drag.current = null
    if (!current.dragging) return
    dragged.current = true
    const { threadId, point } = current
    void move
      .mutateAsync({ threadId, point })
      .catch(() => {})
      .finally(() => setMoving((shown) => (shown?.threadId === threadId ? null : shown)))
  }
  const cancel = () => {
    drag.current = null
    setMoving(null)
  }

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pins.map((thread) => {
        const at = editor.toCanvasPoint(pointOf(thread))
        const open = isOpen(thread)
        const count = thread.comments.length
        const first = thread.comments[0]
        return (
          <button
            key={thread.id}
            type="button"
            data-testid="comment-pin"
            data-thread={thread.id}
            aria-label={open ? `Комментарии в точке: ${count}` : `Комментарии в точке (решено): ${count}`}
            aria-current={thread.id === focusedThreadId || undefined}
            title={first ? `${first.author?.name ?? 'Удалённый пользователь'}: ${excerpt(first.body)}` : undefined}
            className={cn(
              'pointer-events-auto absolute flex items-center justify-center rounded-full rounded-bl-none px-1 text-xs font-semibold shadow-sm',
              open
                ? 'bg-amber-400 text-amber-950 hover:bg-amber-300'
                : 'bg-slate-300 text-slate-700 hover:bg-slate-200 dark:bg-slate-600 dark:text-slate-100 dark:hover:bg-slate-500',
              thread.id === focusedThreadId && 'ring-2 ring-primary',
              movable(thread) && 'cursor-move touch-none',
            )}
            style={{ left: at.x, top: at.y - PIN_SIZE, minWidth: PIN_SIZE, height: PIN_SIZE }}
            onPointerDown={(event) => press(event, thread)}
            onPointerMove={pull}
            onPointerUp={release}
            onPointerCancel={cancel}
            onClick={() => {
              if (dragged.current) dragged.current = false
              else onOpen(thread)
            }}
          >
            {count}
          </button>
        )
      })}
      {draftPoint && <DraftPin at={editor.toCanvasPoint(draftPoint)} />}
    </div>
  )
}

/** The mark of the new thread at its point, until the thread is sent or dropped. */
function DraftPin({ at }: { at: { x: number; y: number } }) {
  return (
    <span
      role="img"
      data-testid="comment-draft-pin"
      aria-label="Новая ветка здесь"
      className="absolute flex items-center justify-center rounded-full rounded-bl-none bg-primary text-primary-foreground shadow-sm"
      style={{ left: at.x, top: at.y - PIN_SIZE, width: PIN_SIZE, height: PIN_SIZE }}
    >
      <Plus aria-hidden className="size-3.5" />
    </span>
  )
}

/** The first line of a comment, shortened for a hint. */
function excerpt(body: string): string {
  const line = body.split('\n').map((part) => part.trim()).find((part) => part !== '') ?? ''
  return line.length > EXCERPT_LENGTH ? `${line.slice(0, EXCERPT_LENGTH - 1)}…` : line
}

const noSubscription = () => () => {}
