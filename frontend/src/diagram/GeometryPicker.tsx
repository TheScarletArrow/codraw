import { Ruler } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { MIN_SHAPE_SIZE, type Box, type SelectionGeometry } from './editor.ts'
import { NumberField } from './NumberField.tsx'
import { pickerMessages } from './pickers.messages.ts'

const m = pickerMessages.geometry

/** A toolbar button that opens the width, the height, the position and the rotation of the selected shapes. */
export function GeometryPicker({
  geometry,
  onChange,
  onRotate,
}: {
  geometry: SelectionGeometry
  onChange: (changes: Partial<Box>) => void
  /** Receives the typed angle as it is: the editor brings it within 0–359. */
  onRotate: (angle: number) => void
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" title={m.name}>
          <Ruler />
          {m.size}
        </Button>
      </PopoverTrigger>
      <PopoverContent aria-label={m.name} className="grid w-56 grid-cols-2 gap-x-3 gap-y-2">
        <Field label={m.width}>
          <NumberField
            label={m.width}
            value={geometry.width}
            min={MIN_SHAPE_SIZE}
            disabled={!geometry.canSetWidth}
            title={geometry.canSetWidth ? m.width : m.sequenceSize}
            onCommit={(width) => onChange({ width })}
          />
        </Field>
        <Field label={m.height}>
          <NumberField
            label={m.height}
            value={geometry.height}
            min={MIN_SHAPE_SIZE}
            disabled={!geometry.canSetHeight}
            title={geometry.canSetHeight ? m.height : m.fixedHeight}
            onCommit={(height) => onChange({ height })}
          />
        </Field>
        <Field label="X">
          <NumberField label="X" value={geometry.x} onCommit={(x) => onChange({ x })} />
        </Field>
        <Field label="Y">
          <NumberField label="Y" value={geometry.y} onCommit={(y) => onChange({ y })} />
        </Field>
        <Field label={m.rotationField}>
          <NumberField
            label={m.rotation}
            value={geometry.rotation}
            disabled={!geometry.canRotate}
            title={geometry.canRotate ? m.rotationTitle : m.noRotation}
            onCommit={onRotate}
          />
        </Field>
      </PopoverContent>
    </Popover>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
      <span aria-hidden>{label}</span>
      {children}
    </div>
  )
}
