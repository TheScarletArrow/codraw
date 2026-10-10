import { GitCompareArrows } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { DiagramEditor } from './editor.ts'
import { pickerMessages } from './pickers.messages.ts'
import { PLAN_COLORS, PLAN_LABELS, PLAN_VIEW_LABELS, PLAN_VIEWS, type Plan, type PlanView } from './plan.ts'
import { useEditorState } from './useEditorState.ts'

const m = pickerMessages.plan

function Swatch({ plan }: { plan: Plan }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-3 shrink-0 rounded-sm border-2', plan === 'removed' && 'border-dashed')}
      style={{ borderColor: PLAN_COLORS[plan] }}
    />
  )
}

/**
 * «Как есть и как будет» on the toolbar while the page has elements that will appear or will go, or is shown otherwise
 * than with the difference (see `plan.ts`): how to show the page — with the difference, as it is, as it will be — and how
 * many elements will appear and go. The view is the participant's own: the page keeps it in its address, so `view` and
 * `onChange` come from there. Who edits the board applies the target state.
 */
export function PlanViewPicker({
  editor,
  readOnly = false,
  view,
  onChange,
}: {
  editor: DiagramEditor | null
  readOnly?: boolean
  view: PlanView
  onChange: (view: PlanView) => void
}) {
  const { plan } = useEditorState(editor)
  const [open, setOpen] = useState(false)
  const name = useId()
  const planned = plan.added + plan.removed
  if (planned === 0 && view === 'diff' && !open) return null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={m.name}
          aria-pressed={view !== 'diff'}
          title={m.showing(PLAN_VIEW_LABELS[view])}
          disabled={!editor}
          className="shrink-0 aria-pressed:bg-accent"
        >
          <GitCompareArrows />
          <span className="text-xs">{PLAN_VIEW_LABELS[view]}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" aria-label={m.name} className="flex w-72 flex-col gap-3">
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-xs font-medium text-muted-foreground">{m.show}</legend>
          {PLAN_VIEWS.map((value) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input type="radio" name={name} checked={view === value} onChange={() => onChange(value)} />
              {PLAN_VIEW_LABELS[value]}
            </label>
          ))}
        </fieldset>
        <p className="flex items-center gap-3 text-sm">
          {(['added', 'removed'] as const).map((value) => (
            <span key={value} className="flex items-center gap-1.5">
              <Swatch plan={value} />
              {`${PLAN_LABELS[value]}: ${plan[value]}`}
            </span>
          ))}
        </p>
        {!readOnly && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!editor || planned === 0}
            title={m.applyTitle}
            onClick={() => editor?.applyTargetState()}
          >
            {m.apply}
          </Button>
        )}
        <p className="text-xs text-muted-foreground">{m.hint}</p>
      </PopoverContent>
    </Popover>
  )
}
