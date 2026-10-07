import { Check, Eye, PencilLine, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ElementStatus } from './status.ts'

/** How each status looks: a sign on a circle of its color, white in both themes. */
const LOOKS: Record<ElementStatus, { icon: LucideIcon; color: string }> = {
  draft: { icon: PencilLine, color: 'bg-slate-500' },
  review: { icon: Eye, color: 'bg-orange-500' },
  done: { icon: Check, color: 'bg-emerald-600' },
}

/** The sign of a status, as its badge, the menu and the list of statuses show it; its size comes with `className`. */
export function StatusIcon({ status, className }: { status: ElementStatus; className?: string }) {
  const { icon: Icon, color } = LOOKS[status]
  return (
    <span
      aria-hidden
      data-status={status}
      className={cn('flex size-4 shrink-0 items-center justify-center rounded-full text-white', color, className)}
    >
      <Icon className="size-[65%]" strokeWidth={2.5} />
    </span>
  )
}
