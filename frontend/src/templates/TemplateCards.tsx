import { ArrowRightLeft, Boxes, Network, PersonStanding, Ship, Table2, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BOARD_TEMPLATES, type BoardTemplate, type TemplateId } from './templates.ts'

const ICONS: Record<TemplateId, LucideIcon> = {
  er: Table2,
  'c4-containers': Boxes,
  microservices: Network,
  kubernetes: Ship,
  'oauth-login': ArrowRightLeft,
  'use-cases': PersonStanding,
}

interface TemplateCardsProps {
  onChoose: (template: BoardTemplate) => void
  disabled?: boolean
  /** One row of titles, with the descriptions as tooltips: for the card over the canvas. */
  compact?: boolean
  className?: string
}

/** A card for every template: its icon, title and what its diagram shows. */
export function TemplateCards({ onChoose, disabled = false, compact = false, className }: TemplateCardsProps) {
  return (
    <ul className={cn('grid gap-2', compact ? 'grid-cols-2 sm:grid-cols-3' : 'sm:grid-cols-2', className)}>
      {BOARD_TEMPLATES.map((template) => {
        const Icon = ICONS[template.id]
        return (
          <li key={template.id}>
            <button
              type="button"
              disabled={disabled}
              title={compact ? template.description : undefined}
              className={cn(
                'flex h-full w-full rounded-md border bg-background text-left hover:bg-muted disabled:opacity-50',
                compact ? 'flex-col items-center gap-1 p-2 text-center text-sm' : 'items-start gap-3 p-3',
              )}
              onClick={() => onChoose(template)}
            >
              <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
              {compact ? (
                <span className="font-medium">{template.title}</span>
              ) : (
                <span className="flex flex-col">
                  <span className="font-medium">{template.title}</span>
                  <span className="text-sm text-muted-foreground">{template.description}</span>
                </span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
