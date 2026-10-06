import { GitPullRequestArrow } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Proposal } from '../api/proposals.ts'
import { isOpen } from './proposals.ts'

/**
 * Opens and closes the proposals of changes of the board; shows how many of those the user sees are open: all of the
 * board for its owner and editors, their own for anybody else.
 */
export function ProposalsButton({
  proposals,
  open,
  onToggle,
}: {
  proposals: Proposal[] | undefined
  open: boolean
  onToggle: () => void
}) {
  const count = proposals?.filter(isOpen).length ?? 0
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={count > 0 ? `Предложения (${count})` : 'Предложения'}
      aria-pressed={open}
      title="Предложения изменений"
      className="relative shrink-0"
      onClick={onToggle}
    >
      <GitPullRequestArrow />
      {count > 0 && (
        <span aria-hidden className="min-w-4 rounded-full bg-primary px-1 text-xs leading-4 font-semibold text-primary-foreground">
          {count}
        </span>
      )}
    </Button>
  )
}
