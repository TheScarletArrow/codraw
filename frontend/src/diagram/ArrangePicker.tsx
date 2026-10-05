import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Direction, ShapeAlign } from './editor.ts'

const ALIGNS: { align: ShapeAlign; label: string; icon: LucideIcon }[] = [
  { align: 'left', label: 'Выровнять по левому краю', icon: AlignStartVertical },
  { align: 'center', label: 'Выровнять по центру', icon: AlignCenterVertical },
  { align: 'right', label: 'Выровнять по правому краю', icon: AlignEndVertical },
  { align: 'top', label: 'Выровнять по верхнему краю', icon: AlignStartHorizontal },
  { align: 'middle', label: 'Выровнять по середине', icon: AlignCenterHorizontal },
  { align: 'bottom', label: 'Выровнять по нижнему краю', icon: AlignEndHorizontal },
]

const DISTRIBUTIONS: { direction: Direction; label: string; icon: LucideIcon }[] = [
  { direction: 'horizontal', label: 'Распределить по горизонтали', icon: AlignHorizontalDistributeCenter },
  { direction: 'vertical', label: 'Распределить по вертикали', icon: AlignVerticalDistributeCenter },
]

interface ArrangePickerProps {
  /** Number of selected shapes; distributing needs three. */
  count: number
  onAlign: (align: ShapeAlign) => void
  onDistribute: (direction: Direction) => void
}

/** Lining up and spacing the selected shapes. */
export function ArrangePicker({ count, onAlign, onDistribute }: ArrangePickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" aria-label="Выравнивание" title="Выравнивание фигур">
          <AlignStartVertical />
          Выровнять
        </Button>
      </PopoverTrigger>
      <PopoverContent aria-label="Выравнивание" className="flex w-auto flex-col gap-2">
        <div role="group" aria-label="Выровнять" className="grid grid-cols-3 gap-1">
          {ALIGNS.map(({ align, label, icon: Icon }) => (
            <Button
              key={align}
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={label}
              title={label}
              onClick={() => onAlign(align)}
            >
              <Icon />
            </Button>
          ))}
        </div>
        <div role="group" aria-label="Распределить" className="flex gap-1 border-t pt-2">
          {DISTRIBUTIONS.map(({ direction, label, icon: Icon }) => (
            <Button
              key={direction}
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={label}
              title={count < 3 ? `${label}: выделите три фигуры или больше` : label}
              disabled={count < 3}
              onClick={() => onDistribute(direction)}
            >
              <Icon />
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
