import { Check, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Comment, CommentText, CommentThread, Person, Reaction } from '../api/comments.ts'
import { Avatar } from '../board/Participants.tsx'
import { ThreadIssues } from '../issues/ThreadIssues.tsx'
import { CommentComposer } from './CommentComposer.tsx'
import { CommentReactions } from './CommentReactions.tsx'
import { AssignButton, ThreadAssignee } from './ThreadAssignee.tsx'
import { commentsMessages as m } from './messages.ts'
import { commentTimeFormat, mentionSegments, threadTarget, type CellInfo } from './threads.ts'

export interface ThreadActions {
  reply(thread: CommentThread, text: CommentText): Promise<unknown>
  edit(thread: CommentThread, comment: Comment, text: CommentText): Promise<unknown>
  remove(thread: CommentThread, comment: Comment): Promise<unknown>
  resolve(thread: CommentThread, resolved: boolean): Promise<unknown>
  /** Puts the reaction of the user on the comment when `on`, takes it away otherwise. */
  react(thread: CommentThread, comment: Comment, reaction: Reaction, on: boolean): Promise<unknown>
  /** Assigns the thread to the person, or to nobody. */
  assign(thread: CommentThread, assignee: Person | null): Promise<unknown>
}

interface ThreadCardProps {
  thread: CommentThread
  cell: CellInfo | null
  userId: string
  /** The owner of the board deletes any comment. */
  isOwner: boolean
  /** Who may be mentioned and assigned. */
  people: Person[]
  /** The thread is about the element the participant came from, e.g. by its badge. */
  highlighted: boolean
  actions: ThreadActions
  /** Goes to the page of the thread and to its element or its point; without it, what the thread is about is a title. */
  onShow?: (thread: CommentThread) => void
}

/**
 * A thread: what it is about, its assignee, the issues linked to it, its comments with their reactions, an answer and the
 * «Решено» mark.
 */
export function ThreadCard({ thread, cell, userId, isOwner, people, highlighted, actions, onShow }: ThreadCardProps) {
  const target = threadTarget(thread, cell)
  const resolved = thread.resolvedAt !== null
  const [error, setError] = useState<string | null>(null)
  const attempt = (action: () => Promise<unknown>, failure: string) =>
    action().then(
      () => setError(null),
      (reason: unknown) => {
        setError(failure)
        throw reason
      },
    )

  return (
    <article
      aria-label={m.thread(target.label)}
      data-thread={thread.id}
      aria-current={highlighted || undefined}
      className={cn('flex flex-col gap-2 rounded-md border p-2', highlighted && 'ring-2 ring-primary', resolved && 'opacity-80')}
    >
      <div className="flex items-start gap-1">
        {onShow ? (
          <button
            type="button"
            title={m.showOnCanvas}
            className={cn(
              'min-w-0 flex-1 truncate rounded px-1 text-left text-xs font-medium hover:bg-accent',
              target.deleted && 'text-muted-foreground italic',
            )}
            onClick={() => onShow(thread)}
          >
            {target.label}
          </button>
        ) : (
          <span className="min-w-0 flex-1 truncate px-1 text-xs font-medium">{target.label}</span>
        )}
        {!thread.assignee && (
          <AssignButton
            people={people}
            onAssign={(person) => attempt(() => actions.assign(thread, person), m.assignFailed)}
          />
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 text-xs"
          onClick={() => void attempt(() => actions.resolve(thread, !resolved), m.threadChangeFailed).catch(() => {})}
        >
          {resolved ? <RotateCcw /> : <Check />}
          {resolved ? m.reopen : m.resolve}
        </Button>
      </div>
      {thread.assignee && (
        <ThreadAssignee
          assignee={thread.assignee}
          people={people}
          onAssign={(person) => attempt(() => actions.assign(thread, person), m.assignFailed)}
        />
      )}
      {resolved && (
        <p className="px-1 text-xs text-muted-foreground">
          {m.resolvedBy(thread.resolvedBy?.name ?? null, commentTimeFormat().format(new Date(thread.resolvedAt!)))}
        </p>
      )}
      <ThreadIssues thread={thread} />
      <ol className="flex flex-col gap-2">
        {thread.comments.map((comment, index) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            first={index === 0}
            mine={comment.author?.id === userId}
            canDelete={comment.author?.id === userId || isOwner}
            userId={userId}
            people={people}
            onEdit={(text) => attempt(() => actions.edit(thread, comment, text), m.editFailed)}
            onDelete={() => attempt(() => actions.remove(thread, comment), m.deleteFailed)}
            onReact={(reaction, on) => attempt(() => actions.react(thread, comment, reaction, on), m.reactFailed)}
          />
        ))}
      </ol>
      {error && (
        <p role="alert" className="px-1 text-xs text-destructive">
          {error}
        </p>
      )}
      <CommentComposer
        people={people}
        label={m.reply}
        placeholder={m.replyPlaceholder}
        submitLabel={m.replySubmit}
        onSubmit={(text) => attempt(() => actions.reply(thread, text), m.replyFailed)}
      />
    </article>
  )
}

interface CommentItemProps {
  comment: Comment
  /** Deleting the first comment deletes the thread. */
  first: boolean
  mine: boolean
  canDelete: boolean
  /** The current user, whose reactions the chips show pressed. */
  userId: string
  people: Person[]
  onEdit: (text: CommentText) => Promise<unknown>
  onDelete: () => Promise<unknown>
  onReact: (reaction: Reaction, on: boolean) => Promise<unknown>
}

function CommentItem({ comment, first, mine, canDelete, userId, people, onEdit, onDelete, onReact }: CommentItemProps) {
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)

  return (
    <li aria-label={m.comment(comment.author?.name ?? m.deletedUser)} className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-xs">
        <Avatar url={comment.author?.avatarUrl} className="size-5" />
        <span className={cn('font-medium', !comment.author && 'text-muted-foreground italic')}>
          {comment.author?.name ?? m.deletedUser}
        </span>
        <time dateTime={comment.createdAt} className="text-muted-foreground">
          {commentTimeFormat().format(new Date(comment.createdAt))}
        </time>
        {comment.editedAt && <span className="text-muted-foreground">{m.edited}</span>}
      </div>
      {editing ? (
        <CommentComposer
          people={people}
          label={m.commentText}
          placeholder={m.commentShort}
          submitLabel={m.save}
          initialText={comment.body}
          initialMentions={comment.mentions}
          autoFocus
          onSubmit={(text) => onEdit(text).then(() => setEditing(false))}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <p className="text-sm break-words whitespace-pre-wrap">
          {mentionSegments(comment.body, comment.mentions).map((segment, index) =>
            segment.mention ? (
              <span key={index} data-mention={segment.mention.id} className="rounded bg-primary/10 px-0.5 font-medium text-primary">
                {segment.text}
              </span>
            ) : (
              segment.text
            ),
          )}
        </p>
      )}
      {!editing && <CommentReactions reactions={comment.reactions} userId={userId} onToggle={onReact} />}
      {confirming ? (
        <div role="alertdialog" aria-label={m.deletingComment} className="flex items-center gap-2 text-xs">
          <span className="flex-1">{first ? m.deleteThreadQuestion : m.deleteCommentQuestion}</span>
          <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setConfirming(false)}>
            {m.cancel}
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-6 bg-destructive px-2 text-xs text-white hover:bg-destructive/90"
            onClick={() => void onDelete().then(() => setConfirming(false), () => setConfirming(false))}
          >
            {m.delete}
          </Button>
        </div>
      ) : (
        !editing &&
        (mine || canDelete) && (
          <div className="flex gap-1">
            {mine && (
              <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-xs" onClick={() => setEditing(true)}>
                {m.edit}
              </Button>
            )}
            {canDelete && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-xs text-destructive hover:text-destructive"
                onClick={() => setConfirming(true)}
              >
                {m.delete}
              </Button>
            )}
          </div>
        )
      )}
    </li>
  )
}
