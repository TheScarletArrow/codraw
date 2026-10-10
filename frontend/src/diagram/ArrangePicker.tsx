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
import { pickerMessages } from './pickers.messages.ts'

const m = pickerMessages.arrange

const ALIGNS: { align: ShapeAlign; label: string; icon: LucideIcon }[] = [
  { align: 'left', label: m.alignLeft, icon: AlignStartVertical },
  { align: 'center', label: m.alignCenter, icon: AlignCenterVertical },
  { align: 'right', label: m.alignRight, icon: AlignEndVertical },
  { align: 'top', label: m.alignTop, icon: AlignStartHorizontal },
  { align: 'middle', label: m.alignMiddle, icon: AlignCenterHorizontal },
  { align: 'bottom', label: m.alignBottom, icon: AlignEndHorizontal },
]

const DISTRIBUTIONS: { direction: Direction; label: string; icon: LucideIcon }[] = [
  { direction: 'horizontal', label: m.distributeHorizontally, icon: AlignHorizontalDistributeCenter },
  { direction: 'vertical', label: m.distributeVertically, icon: AlignVerticalDistributeCenter },
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
        <Button type="button" variant="ghost" size="sm" aria-label={m.name} title={m.title}>
          <AlignStartVertical />
          {m.align}
        </Button>
      </PopoverTrigger>
      <PopoverContent aria-label={m.name} className="flex w-auto flex-col gap-2">
        <div role="group" aria-label={m.align} className="grid grid-cols-3 gap-1">
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
        <div role="group" aria-label={m.distribute} className="flex gap-1 border-t pt-2">
          {DISTRIBUTIONS.map(({ direction, label, icon: Icon }) => (
            <Button
              key={direction}
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={label}
              title={count < 3 ? m.needThree(label) : label}
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
