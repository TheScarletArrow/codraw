import { Minus, Pencil, Plus, type LucideIcon } from 'lucide-react'
import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import type { ChangeType } from '../diagram/diff.ts'

const ICONS: Record<ChangeType, LucideIcon> = { added: Plus, changed: Pencil, removed: Minus }

const BACKGROUNDS: Record<ChangeType, string> = { added: 'bg-added', changed: 'bg-changed', removed: 'bg-removed' }

/**
 * The sign of a change in a circle of its color — «+», a pencil, «−» — so that the kind of a change does not rest on its
 * color alone. The sign has the color of the page; `className` and `style` set the size and may set another color.
 */
export function ChangeIcon({ type, className, style }: { type: ChangeType; className?: string; style?: CSSProperties }) {
  const Icon = ICONS[type]
  return (
    <span
      aria-hidden
      data-change-icon={type}
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full text-background', BACKGROUNDS[type], className)}
      style={style}
    >
      <Icon className="size-[72%]" strokeWidth={3} />
    </span>
  )
}
