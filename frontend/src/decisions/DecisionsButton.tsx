import { ScrollText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Decision } from '../api/decisions.ts'

/** Opens and closes the decisions of the board; shows how many are proposed and wait for a decision. */
export function DecisionsButton({
  decisions,
  open,
  onToggle,
}: {
  decisions: Decision[] | undefined
  open: boolean
  onToggle: () => void
}) {
  const proposed = decisions?.filter((decision) => decision.status === 'proposed').length ?? 0
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={proposed > 0 ? `Решения (предложено: ${proposed})` : 'Решения'}
      aria-pressed={open}
      title="Решения (ADR)"
      className="relative shrink-0"
      onClick={onToggle}
    >
      <ScrollText />
      {proposed > 0 && (
        <span aria-hidden className="min-w-4 rounded-full bg-sky-600 px-1 text-xs leading-4 font-semibold text-white">
          {proposed}
        </span>
      )}
    </Button>
  )
}
