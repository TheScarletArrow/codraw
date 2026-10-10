import { MessageSquarePlus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { startThread, type CommentText, type CommentThread } from '../api/comments.ts'
import { CommentComposer } from '../comments/CommentComposer.tsx'
import { ThreadCard } from '../comments/ThreadCard.tsx'
import { useCommentChange, usePeople, useThreadActions } from '../comments/useComments.ts'
import { decisionsMessages as m } from './messages.ts'

interface DecisionDiscussionProps {
  boardId: string
  userId: string
  isOwner: boolean
  decisionId: string
  /** The threads about the decision, oldest first. */
  threads: CommentThread[]
  /** A page of the board, which every thread names; the decision is of the whole board. */
  pageId: string | null
  /** The thread the participant came to, e.g. from a notification. */
  highlightedThreadId: string | null
  /** Tells the other participants that the comments changed. */
  onChanged: () => void
}

/**
 * The discussion of a decision: threads of comments about it, with mentions, reactions, assignees and notifications
 * like any others, and a new thread.
 */
export function DecisionDiscussion({
  boardId,
  userId,
  isOwner,
  decisionId,
  threads,
  pageId,
  highlightedThreadId,
  onChanged,
}: DecisionDiscussionProps) {
  const people = usePeople(boardId).data ?? []
  const actions = useThreadActions(boardId, onChanged)
  const start = useCommentChange(boardId, onChanged, (text: CommentText) =>
    startThread(boardId, { pageId: pageId!, cellId: null, point: null, decisionId, ...text }),
  )
  const [composing, setComposing] = useState(false)

  return (
    <section aria-label={m.discussion} className="flex flex-col gap-2">
      <h5 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{m.discussion}</h5>
      {threads.map((thread) => (
        <ThreadCard
          key={thread.id}
          thread={thread}
          cell={null}
          userId={userId}
          isOwner={isOwner}
          people={people}
          highlighted={thread.id === highlightedThreadId}
          actions={actions}
        />
      ))}
      {pageId &&
        (threads.length === 0 || composing ? (
          <CommentComposer
            people={people}
            label={m.decisionComment}
            placeholder={m.discussPlaceholder}
            submitLabel={m.send}
            autoFocus={composing}
            pending={start.isPending}
            error={start.isError ? m.sendFailed : null}
            onSubmit={(text) => start.mutateAsync(text).then(() => setComposing(false))}
            onCancel={composing ? () => setComposing(false) : undefined}
          />
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={() => setComposing(true)}>
            <MessageSquarePlus />
            {m.newThread}
          </Button>
        ))}
    </section>
  )
}
