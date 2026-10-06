import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { participantColor } from '../board/identity.ts'
import { attributionLabel } from './attribution.ts'
import type { DiagramEditor } from './editor.ts'
import { useEditorState } from './useEditorState.ts'

/** How often the time «5 минут назад» counts from is taken again, in milliseconds. */
const REFRESH_INTERVAL = 30_000

const exactTime = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })

/**
 * Who changed the single selected element last and when: «Изменено: Боб, 5 минут назад» after a dot of the color of
 * the participant, with the exact time in its tooltip. Nothing without a single selected element, or for one that does
 * not keep who changed it.
 */
export function LastChange({ editor, className }: { editor: DiagramEditor | null; className?: string }) {
  const { attribution } = useEditorState(editor)
  const now = useNow()
  if (!attribution) return null

  return (
    <p
      data-testid="last-change"
      title={exactTime.format(attribution.at)}
      className={cn('flex min-w-0 items-center gap-1.5 text-muted-foreground', className)}
    >
      {attribution.by && (
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: participantColor(attribution.by) }}
        />
      )}
      <span className="truncate">{attributionLabel(attribution, now, attribution.mine)}</span>
    </p>
  )
}

/**
 * The time to count how long ago a change was from, taken again every {@link REFRESH_INTERVAL}: at most that late,
 * which minutes can afford. A change that seems later than it is «только что».
 */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), REFRESH_INTERVAL)
    return () => clearInterval(timer)
  }, [])
  return now
}
