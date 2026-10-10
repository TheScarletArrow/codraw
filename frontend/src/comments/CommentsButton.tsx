import { MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CommentThread } from '../api/comments.ts'
import { commentsMessages as m } from './messages.ts'
import { isOpen } from './threads.ts'

/** Opens and closes the comments of the board; shows how many threads are open. */
export function CommentsButton({
  threads,
  open,
  onToggle,
}: {
  threads: CommentThread[] | undefined
  open: boolean
  onToggle: () => void
}) {
  const count = threads?.filter(isOpen).length ?? 0
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={count > 0 ? m.commentsCount(count) : m.comments}
      aria-pressed={open}
      title={m.comments}
      className="relative shrink-0"
      onClick={onToggle}
    >
      <MessageSquare />
      {count > 0 && (
        <span aria-hidden className="min-w-4 rounded-full bg-amber-400 px-1 text-xs leading-4 font-semibold text-amber-950">
          {count}
        </span>
      )}
    </Button>
  )
}
