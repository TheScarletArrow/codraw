import { useState, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'

interface NumberFieldProps {
  /** Accessible name, e.g. «Размер текста». */
  label: string
  /** Current value; `null` leaves the field empty, e.g. when the selected objects have different values. */
  value: number | null
  min?: number
  max?: number
  disabled?: boolean
  title?: string
  className?: string
  /** Receives the typed value as a whole number within the limits, if it is a number and differs from `value`. */
  onCommit: (value: number) => void
}

/**
 * A field for a number that is applied on Enter or when the field loses focus, not on every typed digit: each applied
 * value is a step of undo. Escape brings the current value back.
 */
export function NumberField({
  label,
  value,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
  disabled,
  title = label,
  className,
  onCommit,
}: NumberFieldProps) {
  // What the participant is typing; `null` while the field shows the current value.
  const [draft, setDraft] = useState<string | null>(null)

  const commit = () => {
    if (draft === null) return
    setDraft(null)
    const typed = draft.trim() === '' ? Number.NaN : Number(draft)
    if (!Number.isFinite(typed)) return
    const next = Math.min(max, Math.max(min, Math.round(typed)))
    if (next !== value) onCommit(next)
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commit()
    } else if (event.key === 'Escape') {
      // Not consumed: Escape also closes the window the field is in.
      setDraft(null)
    }
  }

  return (
    <input
      type="number"
      inputMode="numeric"
      aria-label={label}
      title={title}
      min={Number.isFinite(min) ? min : undefined}
      max={Number.isFinite(max) ? max : undefined}
      step={1}
      disabled={disabled}
      placeholder={value === null ? '—' : undefined}
      value={draft ?? format(value)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
      className={cn(
        'h-8 w-full min-w-0 rounded-md border bg-background px-2 text-sm text-foreground tabular-nums outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
        // Stepping is done by the buttons next to the field, if any; the arrows of the browser would make each step
        // a separate change.
        '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
        className,
      )}
    />
  )
}

function format(value: number | null): string {
  return value === null ? '' : String(Math.round(value * 10) / 10)
}
