import { SmilePlus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { CommentReaction, Reaction } from '../api/comments.ts'

/** The reactions of the set in its order: the emoji and what it says, as its hint. */
const REACTIONS: readonly { reaction: Reaction; emoji: string; label: string }[] = [
  { reaction: 'thumbs-up', emoji: '👍', label: 'Нравится' },
  { reaction: 'heart', emoji: '❤️', label: 'Сердце' },
  { reaction: 'party', emoji: '🎉', label: 'Праздник' },
  { reaction: 'smile', emoji: '😄', label: 'Смешно' },
  { reaction: 'eyes', emoji: '👀', label: 'Смотрю' },
  { reaction: 'check', emoji: '✅', label: 'Готово' },
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
    <div role="group" aria-label="Реакции" className="flex flex-wrap items-center gap-1">
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
            aria-label="Добавить реакцию"
            title="Добавить реакцию"
            className="size-6 text-muted-foreground"
          >
            <SmilePlus />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" aria-label="Набор реакций" className="flex w-auto gap-0.5 p-1">
          {REACTIONS.map(({ reaction, emoji, label }) => (
            <button
              key={reaction}
              type="button"
              title={label}
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
