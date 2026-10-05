import { Spline } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { MAX_LINE_WIDTH, MIN_LINE_WIDTH, type EdgeShape, type LineDash, type SelectionLine } from './editor.ts'
import { NumberField } from './NumberField.tsx'

const DASHES: { value: LineDash; label: string; pattern?: string }[] = [
  { value: 'solid', label: 'Сплошная' },
  { value: 'dashed', label: 'Пунктир', pattern: '6 4' },
  { value: 'dotted', label: 'Точки', pattern: '2 3' },
]

const EDGE_SHAPES: { value: EdgeShape; label: string; path: string }[] = [
  { value: 'straight', label: 'Прямая', path: 'M3 17 L21 5' },
  { value: 'orthogonal', label: 'Ортогональная', path: 'M3 17 H12 V5 H21' },
  { value: 'curved', label: 'Кривая', path: 'M3 17 C12 17 12 5 21 5' },
]

interface LineStylePickerProps {
  line: SelectionLine
  onChange: (changes: { width?: number; dash?: LineDash; edgeShape?: EdgeShape }) => void
}

/** Width and dash of the lines of the selected objects, and the shape of the selected edges. */
export function LineStylePicker({ line, onChange }: LineStylePickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" aria-label="Стиль линии" title="Стиль линии">
          <Spline />
          Стиль
        </Button>
      </PopoverTrigger>
      <PopoverContent aria-label="Стиль линии" className="flex w-72 flex-col gap-3">
        <label className="flex items-center justify-between gap-2 text-sm">
          Толщина
          <NumberField
            label="Толщина линии"
            value={line.width}
            min={MIN_LINE_WIDTH}
            max={MAX_LINE_WIDTH}
            className="w-16 text-center"
            onCommit={(width) => onChange({ width })}
          />
        </label>
        <Options label="Вид линии">
          {DASHES.map((dash) => (
            <Option
              key={dash.value}
              label={dash.label}
              pressed={line.dash === dash.value}
              onClick={() => onChange({ dash: dash.value })}
            >
              <svg aria-hidden viewBox="0 0 24 24" className="size-5">
                <path d="M2 12 H22" stroke="currentColor" strokeWidth={2} strokeDasharray={dash.pattern} />
              </svg>
            </Option>
          ))}
        </Options>
        {line.hasEdges && (
          <Options label="Форма связи">
            {EDGE_SHAPES.map((shape) => (
              <Option
                key={shape.value}
                label={shape.label}
                pressed={line.edgeShape === shape.value}
                onClick={() => onChange({ edgeShape: shape.value })}
              >
                <svg aria-hidden viewBox="0 0 24 24" className="size-5">
                  <path d={shape.path} fill="none" stroke="currentColor" strokeWidth={2} />
                </svg>
              </Option>
            ))}
          </Options>
        )}
      </PopoverContent>
    </Popover>
  )
}

function Options({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1">
      <span className="text-sm">{label}</span>
      <div className="grid grid-cols-3 gap-1">{children}</div>
    </div>
  )
}

function Option({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string
  pressed: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-pressed={pressed}
      className={cn('flex-col gap-0.5 h-auto py-1 text-xs font-normal', pressed && 'bg-accent text-accent-foreground')}
      onClick={onClick}
    >
      {children}
      {label}
    </Button>
  )
}
