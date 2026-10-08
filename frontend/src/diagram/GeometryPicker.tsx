import { Ruler } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { MIN_SHAPE_SIZE, type Box, type SelectionGeometry } from './editor.ts'
import { NumberField } from './NumberField.tsx'

const NAME = 'Размер и положение'

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
        <Button type="button" variant="ghost" size="sm" title={NAME}>
          <Ruler />
          Размер
        </Button>
      </PopoverTrigger>
      <PopoverContent aria-label={NAME} className="grid w-56 grid-cols-2 gap-x-3 gap-y-2">
        <Field label="Ширина">
          <NumberField
            label="Ширина"
            value={geometry.width}
            min={MIN_SHAPE_SIZE}
            disabled={!geometry.canSetWidth}
            title={geometry.canSetWidth ? 'Ширина' : 'Размер диаграммы последовательности задают её части'}
            onCommit={(width) => onChange({ width })}
          />
        </Field>
        <Field label="Высота">
          <NumberField
            label="Высота"
            value={geometry.height}
            min={MIN_SHAPE_SIZE}
            disabled={!geometry.canSetHeight}
            title={geometry.canSetHeight ? 'Высота' : 'Высоту таблицы задают её поля, диаграммы последовательности — её части'}
            onCommit={(height) => onChange({ height })}
          />
        </Field>
        <Field label="X">
          <NumberField label="X" value={geometry.x} onCommit={(x) => onChange({ x })} />
        </Field>
        <Field label="Y">
          <NumberField label="Y" value={geometry.y} onCommit={(y) => onChange({ y })} />
        </Field>
        <Field label="Поворот, °">
          <NumberField
            label="Поворот"
            value={geometry.rotation}
            disabled={!geometry.canRotate}
            title={geometry.canRotate ? 'Поворот по часовой стрелке, градусы' : 'Таблицы и группы не поворачиваются'}
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
