import { Check, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Comment, CommentText, CommentThread, Person } from '../api/comments.ts'
import { Avatar } from '../board/Participants.tsx'
import { CommentComposer } from './CommentComposer.tsx'
import { commentTimeFormat, mentionSegments, threadTarget, type CellInfo } from './threads.ts'

export interface ThreadActions {
  reply(thread: CommentThread, text: CommentText): Promise<unknown>
  edit(thread: CommentThread, comment: Comment, text: CommentText): Promise<unknown>
  remove(thread: CommentThread, comment: Comment): Promise<unknown>
  resolve(thread: CommentThread, resolved: boolean): Promise<unknown>
}

interface ThreadCardProps {
  thread: CommentThread
  cell: CellInfo | null
  userId: string
  /** The owner of the board deletes any comment. */
  isOwner: boolean
  people: Person[]
  /** The thread is about the element the participant came from, e.g. by its badge. */
  highlighted: boolean
  actions: ThreadActions
  /** Goes to the page of the thread and to its element. */
  onShow: (thread: CommentThread) => void
}

/** A thread: what it is about, its comments, an answer and the «Решено» mark. */
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
      aria-label={`Ветка: ${target.label}`}
      data-thread={thread.id}
      className={cn('flex flex-col gap-2 rounded-md border p-2', highlighted && 'ring-2 ring-primary', resolved && 'opacity-80')}
    >
      <div className="flex items-start gap-1">
        <button
          type="button"
          title="Показать на холсте"
          className={cn(
            'min-w-0 flex-1 truncate rounded px-1 text-left text-xs font-medium hover:bg-accent',
            target.deleted && 'text-muted-foreground italic',
          )}
          onClick={() => onShow(thread)}
        >
          {target.label}
        </button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 text-xs"
          onClick={() => void attempt(() => actions.resolve(thread, !resolved), 'Не удалось изменить ветку').catch(() => {})}
        >
          {resolved ? <RotateCcw /> : <Check />}
          {resolved ? 'Открыть снова' : 'Решено'}
        </Button>
      </div>
      {resolved && (
        <p className="px-1 text-xs text-muted-foreground">
          Решено{thread.resolvedBy && `: ${thread.resolvedBy.name}`}, {commentTimeFormat.format(new Date(thread.resolvedAt!))}
        </p>
      )}
      <ol className="flex flex-col gap-2">
        {thread.comments.map((comment, index) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            first={index === 0}
            mine={comment.author?.id === userId}
            canDelete={comment.author?.id === userId || isOwner}
            people={people}
            onEdit={(text) => attempt(() => actions.edit(thread, comment, text), 'Не удалось изменить комментарий')}
            onDelete={() => attempt(() => actions.remove(thread, comment), 'Не удалось удалить комментарий')}
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
        label="Ответ"
        placeholder="Ответить… @ — упомянуть"
        submitLabel="Ответить"
        onSubmit={(text) => attempt(() => actions.reply(thread, text), 'Не удалось отправить ответ')}
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
  people: Person[]
  onEdit: (text: CommentText) => Promise<unknown>
  onDelete: () => Promise<unknown>
}

function CommentItem({ comment, first, mine, canDelete, people, onEdit, onDelete }: CommentItemProps) {
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)

  return (
    <li aria-label={`Комментарий: ${comment.author?.name ?? 'Удалённый пользователь'}`} className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-xs">
        <Avatar url={comment.author?.avatarUrl} className="size-5" />
        <span className={cn('font-medium', !comment.author && 'text-muted-foreground italic')}>
          {comment.author?.name ?? 'Удалённый пользователь'}
        </span>
        <time dateTime={comment.createdAt} className="text-muted-foreground">
          {commentTimeFormat.format(new Date(comment.createdAt))}
        </time>
        {comment.editedAt && <span className="text-muted-foreground">(изменено)</span>}
      </div>
      {editing ? (
        <CommentComposer
          people={people}
          label="Текст комментария"
          placeholder="Комментарий"
          submitLabel="Сохранить"
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
      {confirming ? (
        <div role="alertdialog" aria-label="Удаление комментария" className="flex items-center gap-2 text-xs">
          <span className="flex-1">{first ? 'Удалить ветку со всеми ответами?' : 'Удалить комментарий?'}</span>
          <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setConfirming(false)}>
            Отмена
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-6 bg-destructive px-2 text-xs text-white hover:bg-destructive/90"
            onClick={() => void onDelete().then(() => setConfirming(false), () => setConfirming(false))}
          >
            Удалить
          </Button>
        </div>
      ) : (
        !editing &&
        (mine || canDelete) && (
          <div className="flex gap-1">
            {mine && (
              <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-xs" onClick={() => setEditing(true)}>
                Изменить
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
                Удалить
              </Button>
            )}
          </div>
        )
      )}
    </li>
  )
}
