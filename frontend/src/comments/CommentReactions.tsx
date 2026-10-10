import { SmilePlus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { CommentReaction, Reaction } from '../api/comments.ts'
import { commentsMessages as m } from './messages.ts'

/** The reactions of the set in its order: the emoji; what it says, its hint, is in the dictionary. */
const REACTIONS: readonly { reaction: Reaction; emoji: string }[] = [
  { reaction: 'thumbs-up', emoji: '👍' },
  { reaction: 'heart', emoji: '❤️' },
  { reaction: 'party', emoji: '🎉' },
  { reaction: 'smile', emoji: '😄' },
  { reaction: 'eyes', emoji: '👀' },
  { reaction: 'check', emoji: '✅' },
]

const emojiOf = (reaction: Reaction) => REACTIONS.find((entry) => entry.reaction === reaction)?.emoji ?? reaction

interface CommentReactionsProps {
  reactions: CommentReaction[]
  userId: string
  /** Puts the reaction of the user on the comment when `on`, takes it away otherwise. */
  onToggle: (reaction: Reaction, on: boolean) => Promise<unknown>
}

/**
 * The reactions under a comment: a chip for each reaction put, with how many put it, pressed when the user is among
 * them, naming them in its hint; a click puts the reaction of the user or takes it away. «Добавить реакцию» opens the
 * set, where a click does the same.
 */
export function CommentReactions({ reactions, userId, onToggle }: CommentReactionsProps) {
  const [choosing, setChoosing] = useState(false)
  const mine = (reaction: Reaction) =>
    reactions.some((entry) => entry.reaction === reaction && entry.people.some((person) => person.id === userId))
  // The card of the thread tells a failure.
  const toggle = (reaction: Reaction) => void onToggle(reaction, !mine(reaction)).catch(() => {})

  return (
    <div role="group" aria-label={m.reactionsGroup} className="flex flex-wrap items-center gap-1">
      {reactions.map(({ reaction, people }) => (
        <button
          key={reaction}
          type="button"
          aria-pressed={mine(reaction)}
          title={people.map((person) => person.name).join(', ')}
          className={cn(
            'flex h-6 items-center gap-1 rounded-full border px-2 text-xs tabular-nums',
            mine(reaction) ? 'border-primary/40 bg-primary/10 font-medium text-primary' : 'hover:bg-accent',
          )}
          onClick={() => toggle(reaction)}
        >
          {emojiOf(reaction)} {people.length}
        </button>
      ))}
      <Popover open={choosing} onOpenChange={setChoosing}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={m.addReaction}
            title={m.addReaction}
            className="size-6 text-muted-foreground"
          >
            <SmilePlus />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" aria-label={m.reactionSet} className="flex w-auto gap-0.5 p-1">
          {REACTIONS.map(({ reaction, emoji }) => (
            <button
              key={reaction}
              type="button"
              title={m.reactions[reaction]}
              aria-pressed={mine(reaction)}
              className={cn('flex size-8 items-center justify-center rounded-md text-lg hover:bg-accent', mine(reaction) && 'bg-primary/10')}
              onClick={() => {
                setChoosing(false)
                toggle(reaction)
              }}
            >
              {emoji}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  )
}
