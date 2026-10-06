import { useRef, useState, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'

/** The longest board title the backend accepts. */
export const TITLE_MAX_LENGTH = 200

interface TitleInputProps {
  title: string
  /** Accessible name of the input. */
  label: string
  /**
   * Receives the trimmed new title, or `null` when it was cancelled or not changed; an emptied title is `null` too,
   * unless `allowEmpty` lets it through as an empty string.
   */
  onDone: (title: string | null) => void
  /** The longest title; board titles by default. */
  maxLength?: number
  /** An empty title is a title too, e.g. a version without a name. */
  allowEmpty?: boolean
  placeholder?: string
  className?: string
}

/** Inline editor of a title: Enter or leaving it saves, Escape cancels. */
export function TitleInput({
  title,
  label,
  onDone,
  maxLength = TITLE_MAX_LENGTH,
  allowEmpty = false,
  placeholder,
  className,
}: TitleInputProps) {
  const [value, setValue] = useState(title)
  // Enter removes the input, and the browser may then report a blur too.
  const finished = useRef(false)
  const finish = (result: string | null) => {
    if (finished.current) return
    finished.current = true
    const trimmed = result?.trim()
    onDone(trimmed !== undefined && (trimmed || allowEmpty) && trimmed !== title ? trimmed : null)
  }

  return (
    <input
      aria-label={label}
      autoFocus
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      className={cn(
        'min-w-0 rounded border bg-background px-1 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        className,
      )}
      onChange={(event) => setValue(event.target.value)}
      onFocus={(event) => event.target.select()}
      onBlur={() => finish(value)}
      onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
        event.stopPropagation()
        if (event.key === 'Enter') finish(value)
        if (event.key === 'Escape') finish(null)
      }}
    />
  )
}
