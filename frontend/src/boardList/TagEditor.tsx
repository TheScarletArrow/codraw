import { X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { addTag, sameLabel, TAG_MAX_LENGTH, tagSuggestions } from './boardList.ts'
import { boardListMessages as m } from './messages.ts'

interface TagEditorProps {
  /** The title of the board, which names the editor. */
  title: string
  tags: string[]
  /** All tags of the user, which the editor suggests. */
  known: string[]
  /** Gets all tags of the board after a change. */
  onChange: (tags: string[]) => void
  /** Why the latest change did not happen. */
  error?: string | null
}

/**
 * The personal tags of a board in its menu: each with a button that removes it, and a field that adds a tag on Enter,
 * suggesting the tags of the user that have what is typed.
 */
export function TagEditor({ title, tags, known, onChange, error }: TagEditorProps) {
  const [input, setInput] = useState('')
  const suggestions = tagSuggestions(known, tags, input)
  const add = (tag: string) => {
    const next = addTag(tags, tag, known)
    if (next !== tags) onChange(next)
    setInput('')
  }

  return (
    <div role="group" aria-label={m.boardTags(title)} className="flex flex-col gap-2 p-2">
      {tags.length > 0 ? (
        <ul aria-label={m.tags} className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <li key={tag} className="flex items-center gap-0.5 rounded bg-muted py-0.5 pr-0.5 pl-2 text-sm">
              {tag}
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={m.removeTag(tag)}
                onClick={() => onChange(tags.filter((other) => !sameLabel(other, tag)))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{m.noTags}</p>
      )}
      <input
        aria-label={m.newTag}
        autoFocus
        value={input}
        maxLength={TAG_MAX_LENGTH}
        placeholder={m.addTag}
        className="rounded border bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          add(input)
        }}
      />
      {suggestions.length > 0 && (
        <div role="group" aria-label={m.tagSuggestions} className="flex flex-wrap gap-1">
          {suggestions.map((tag) => (
            <Button key={tag} type="button" variant="outline" size="xs" onClick={() => add(tag)}>
              {tag}
            </Button>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
