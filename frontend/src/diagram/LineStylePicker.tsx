import { Spline } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import {
  MAX_ARC_SIZE,
  MAX_LINE_WIDTH,
  MIN_ARC_SIZE,
  MIN_LINE_WIDTH,
  type EdgeShape,
  type LineDash,
  type SelectionLine,
  type SelectionShapeEffects,
  type ShapeEffectsChanges,
} from './editor.ts'
import { NumberField } from './NumberField.tsx'
import { pickerMessages } from './pickers.messages.ts'

const m = pickerMessages.lineStyle

const DASHES: { value: LineDash; label: string; pattern?: string }[] = [
  { value: 'solid', label: m.solid },
  { value: 'dashed', label: m.dashed, pattern: '6 4' },
  { value: 'dotted', label: m.dotted, pattern: '2 3' },
]

const EDGE_SHAPES: { value: EdgeShape; label: string; path: string }[] = [
  { value: 'straight', label: m.straight, path: 'M3 17 L21 5' },
  { value: 'orthogonal', label: m.orthogonal, path: 'M3 17 H12 V5 H21' },
  { value: 'curved', label: m.curved, path: 'M3 17 C12 17 12 5 21 5' },
]

interface LineStylePickerProps {
  line: SelectionLine
  onChange: (changes: { width?: number; dash?: LineDash; edgeShape?: EdgeShape }) => void
  /** Sets the shadow and the corners of the selected shapes; without it there are none, e.g. for the pencil. */
  onShapeEffects?: (changes: ShapeEffectsChanges) => void
}

/**
 * Width and dash of the lines of the selected objects, the shape of the selected edges, and the shadow and the rounded
 * corners of the selected shapes.
 */
export function LineStylePicker({ line, onChange, onShapeEffects }: LineStylePickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" aria-label={m.name} title={m.name}>
          <Spline />
          {m.style}
        </Button>
      </PopoverTrigger>
      <PopoverContent aria-label={m.name} className="flex w-72 flex-col gap-3">
        <label className="flex items-center justify-between gap-2 text-sm">
          {m.width}
          <NumberField
            label={m.lineWidth}
            value={line.width}
            min={MIN_LINE_WIDTH}
            max={MAX_LINE_WIDTH}
            className="w-16 text-center"
            onCommit={(width) => onChange({ width })}
          />
        </label>
        <Options label={m.dash}>
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
          <Options label={m.edgeShape}>
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
        {line.shapes && onShapeEffects && <ShapeEffects shapes={line.shapes} onChange={onShapeEffects} />}
      </PopoverContent>
    </Popover>
  )
}

/** The shadow of the selected shapes, and their rounded corners with the radius when some of them can round them. */
function ShapeEffects({ shapes, onChange }: { shapes: SelectionShapeEffects; onChange: (changes: ShapeEffectsChanges) => void }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={shapes.shadow}
          className="accent-primary"
          onChange={(event) => onChange({ shadow: event.target.checked })}
        />
        Тень
      </label>
      {shapes.canRound && (
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={shapes.rounded}
              className="accent-primary"
              onChange={(event) => onChange({ rounded: event.target.checked })}
            />
            Скругление
          </label>
          <span className="flex items-center gap-1">
            <NumberField
              label="Радиус скругления, %"
              title="Радиус скругления в процентах от короткой стороны"
              value={shapes.rounded ? shapes.arcSize : null}
              min={MIN_ARC_SIZE}
              max={MAX_ARC_SIZE}
              disabled={!shapes.rounded}
              className="w-14 text-center"
              onCommit={(arcSize) => onChange({ arcSize })}
            />
            <span aria-hidden>%</span>
          </span>
        </div>
      )}
    </div>
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
