import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { PALETTE } from './colors.ts'


const NONE = 'none'

interface ColorPickerProps {
  /** Short caption on the button, e.g. «Текст». */
  label: string
  /** Accessible name of the button and the palette, e.g. «Цвет текста», distinct from shapes named «Текст». */
  name: string
  /** Current color of the selected objects; `null` when they have different colors. */
  value: string | null
  /** Caption of the option without color, e.g. «Без заливки»; without it there is no such option. */
  noneLabel?: string
  onChange: (color: string) => void
}

/** A toolbar button that shows the current color and opens the palette. */
export function ColorPicker({ label, name, value, noneLabel, onChange }: ColorPickerProps) {
  const [open, setOpen] = useState(false)
  const pick = (color: string) => {
    onChange(color)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" aria-label={name} title={name}>
          <Swatch color={value} />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent aria-label={name} className="flex w-64 flex-col gap-3">
        <div className="grid grid-cols-8 gap-1.5">
          {PALETTE.map((color) => (
            <button
              key={color.value}
              type="button"
              aria-label={color.name}
              aria-pressed={value === color.value}
              title={color.name}
              className={cn(
                'size-6 rounded-sm border outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring',
                value === color.value && 'ring-2 ring-ring ring-offset-1',
              )}
              style={{ backgroundColor: color.value }}
              onClick={() => pick(color.value)}
            />
          ))}
        </div>
        {noneLabel && (
          <Button type="button" variant="outline" size="sm" aria-pressed={value === NONE} onClick={() => pick(NONE)}>
            <Swatch color={NONE} />
            {noneLabel}
          </Button>
        )}
        <CustomColor value={value} onPick={pick} />
      </PopoverContent>
    </Popover>
  )
}

/**
 * Any color through the color picker of the browser. The color is applied on `change`, when the picker is
 * closed, not on every `input` while the user moves through it: each change is a step of undo.
 */
function CustomColor({ value, onPick }: { value: string | null; onPick: (color: string) => void }) {
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const element = input.current!
    const handleChange = () => onPick(element.value)
    element.addEventListener('change', handleChange)
    return () => element.removeEventListener('change', handleChange)
  }, [onPick])

  return (
    <label className="flex items-center justify-between gap-2 text-sm">
      Свой цвет
      <input
        ref={input}
        type="color"
        aria-label="Свой цвет"
        defaultValue={value && /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'}
        className="h-8 w-12 cursor-pointer rounded border bg-background"
      />
    </label>
  )
}

function Swatch({ color }: { color: string | null }) {
  return (
    <span
      aria-hidden
      className={cn(
        'size-4 shrink-0 rounded-sm border',
        color === null && 'border-dashed',
        // No color: a diagonal stroke over an empty square.
        color === NONE && 'bg-[linear-gradient(to_top_right,transparent_45%,var(--destructive)_45%,var(--destructive)_55%,transparent_55%)]',
      )}
      style={color && color !== NONE ? { backgroundColor: color } : undefined}
    />
  )
}
