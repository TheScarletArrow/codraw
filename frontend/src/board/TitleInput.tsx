import { useRef, useState, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'

/** The longest board title the backend accepts. */
export const TITLE_MAX_LENGTH = 200

interface TitleInputProps {
  title: string
  /** Accessible name of the input. */
  label: string
  /** Receives the trimmed new title, or `null` when it was cancelled, left empty or not changed. */
  onDone: (title: string | null) => void
  className?: string
}

/** Inline editor of a title: Enter or leaving it saves, Escape cancels. */
export function TitleInput({ title, label, onDone, className }: TitleInputProps) {
  const [value, setValue] = useState(title)
  // Enter removes the input, and the browser may then report a blur too.
  const finished = useRef(false)
  const finish = (result: string | null) => {
    if (finished.current) return
    finished.current = true
    const trimmed = result?.trim()
    onDone(trimmed && trimmed !== title ? trimmed : null)
  }

  return (
    <input
      aria-label={label}
      autoFocus
      value={value}
      maxLength={TITLE_MAX_LENGTH}
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
