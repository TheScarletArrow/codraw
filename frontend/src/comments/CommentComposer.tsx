import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { CommentText, Person } from '../api/comments.ts'
import { Avatar } from '../board/Participants.tsx'
import { commentsMessages as m } from './messages.ts'
import { insertMention, mentionQueryAt, mentionsIn, suggestPeople, type MentionQuery } from './threads.ts'

/** The most characters of a comment, as the backend takes. */
export const COMMENT_MAX_LENGTH = 4000

interface CommentComposerProps {
  /** Who `@` offers to mention. */
  people: Person[]
  label: string
  placeholder: string
  submitLabel: string
  initialText?: string
  /** Mentions of the text being changed, kept while their `@Name` stays in it. */
  initialMentions?: Person[]
  autoFocus?: boolean
  pending?: boolean
  error?: string | null
  /** Sends the text; the field is emptied once it is sent. */
  onSubmit: (text: CommentText) => Promise<unknown>
  /** Shows «Отмена», which Escape presses too. */
  onCancel?: () => void
}

/**
 * The field of a comment: Enter sends, Shift+Enter starts a new line. `@` and the first letters of a name offer the
 * participants of the board; the chosen one is written as `@Имя` and sent as mentioned.
 */
export function CommentComposer({
  people,
  label,
  placeholder,
  submitLabel,
  initialText = '',
  initialMentions = [],
  autoFocus = false,
  pending = false,
  error = null,
  onSubmit,
  onCancel,
}: CommentComposerProps) {
  const [text, setText] = useState(initialText)
  const [chosen, setChosen] = useState(() => new Map(initialMentions.map((person) => [person.id, person])))
  const [mention, setMention] = useState<MentionQuery | null>(null)
  const [active, setActive] = useState(0)
  const field = useRef<HTMLTextAreaElement>(null)
  /** Where the caret goes once React has written the text with an inserted mention. */
  const caret = useRef<number | null>(null)
  const listId = useId()
  const suggestions = mention ? suggestPeople(people, mention.query) : []
  const suggesting = suggestions.length > 0

  useLayoutEffect(() => {
    if (caret.current === null || !field.current) return
    field.current.setSelectionRange(caret.current, caret.current)
    caret.current = null
  })

  const findMention = (element: HTMLTextAreaElement) => {
    setMention(mentionQueryAt(element.value, element.selectionStart))
    setActive(0)
  }

  const choose = (person: Person) => {
    if (!mention || !field.current) return
    const next = insertMention(text, mention, field.current.selectionStart, person)
    setText(next.text)
    setChosen((current) => new Map(current).set(person.id, person))
    setMention(null)
    caret.current = next.caret
    field.current.focus()
  }

  const submit = async () => {
    const body = text.trim()
    if (body === '' || pending) return
    await onSubmit({ body, mentions: mentionsIn(body, chosen.values()) })
    setText('')
    setChosen(new Map())
    setMention(null)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return
    if (suggesting) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const step = event.key === 'ArrowDown' ? 1 : -1
        setActive((current) => (current + step + suggestions.length) % suggestions.length)
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        choose(suggestions[active] ?? suggestions[0]!)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        setMention(null)
        return
      }
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void submit().catch(() => {})
    } else if (event.key === 'Escape' && onCancel) {
      event.preventDefault()
      onCancel()
    }
  }

  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={(event) => {
        event.preventDefault()
        void submit().catch(() => {})
      }}
    >
      <div className="relative">
        <textarea
          ref={field}
          aria-label={label}
          placeholder={placeholder}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={suggesting}
          aria-controls={suggesting ? listId : undefined}
          aria-activedescendant={suggesting ? `${listId}-${active}` : undefined}
          autoFocus={autoFocus}
          rows={2}
          maxLength={COMMENT_MAX_LENGTH}
          className="block max-h-48 min-h-14 w-full resize-y rounded-md border bg-background px-2 py-1.5 text-sm"
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            findMention(event.target)
          }}
          onSelect={(event) => findMention(event.currentTarget)}
          onBlur={() => setMention(null)}
          onKeyDown={handleKeyDown}
        />
        {suggesting && (
          <ul
            id={listId}
            role="listbox"
            aria-label={m.whomToMention}
            className="absolute top-full right-0 left-0 z-10 mt-1 flex flex-col rounded-md border bg-popover p-1 shadow-md"
          >
            {suggestions.map((person, index) => (
              <li
                key={person.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm',
                  index === active && 'bg-accent',
                )}
                // The field keeps the focus and the caret.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(person)}
              >
                <Avatar url={person.avatarUrl} className="size-5" />
                {person.name}
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            {m.cancel}
          </Button>
        )}
        <Button type="submit" size="sm" disabled={pending || text.trim() === ''}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
