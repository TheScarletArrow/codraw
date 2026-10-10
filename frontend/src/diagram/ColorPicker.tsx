import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { colorPickerMessages as m } from './ColorPicker.messages.ts'
import { PALETTE } from './colors.ts'
import type { GradientDirection } from './editor.ts'
import { NumberField } from './NumberField.tsx'

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
  /**
   * Opacity of the color, 0–100, shown as its transparency; `null` when the objects have different ones. Without
   * `onOpacityChange` there is no transparency.
   */
  opacity?: number | null
  /** Accessible name of the transparency, e.g. «Прозрачность заливки». */
  opacityName?: string
  onOpacityChange?: (opacity: number) => void
  /**
   * The second color of the gradient, `none` without one, `null` when the objects have different ones. Without
   * `onGradientChange` there is no gradient.
   */
  gradient?: string | null
  gradientDirection?: GradientDirection | null
  onGradientChange?: (changes: { gradient?: string; gradientDirection?: GradientDirection }) => void
}

/** A toolbar button that shows the current color and opens the palette. */
export function ColorPicker({
  label,
  name,
  value,
  noneLabel,
  onChange,
  opacity = null,
  opacityName = m.transparency,
  onOpacityChange,
  gradient = null,
  gradientDirection = null,
  onGradientChange,
}: ColorPickerProps) {
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
                // The border sets dark colors off a dark popover.
                'size-6 rounded-sm border outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring dark:border-foreground/30',
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
        {onOpacityChange && (
          <Transparency
            name={opacityName}
            transparency={opacity === null ? null : 100 - opacity}
            onCommit={(transparency) => onOpacityChange(100 - transparency)}
          />
        )}
        {onGradientChange && (
          <Gradient color={value} gradient={gradient} direction={gradientDirection} onChange={onGradientChange} />
        )}
      </PopoverContent>
    </Popover>
  )
}

/**
 * Any color through the color picker of the browser. The color is applied on `change`, when the picker is
 * closed, not on every `input` while the user moves through it: each change is a step of undo.
 */
function CustomColor({
  label = m.customColor,
  value,
  disabled,
  onPick,
}: {
  label?: string
  value: string | null
  disabled?: boolean
  onPick: (color: string) => void
}) {
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const element = input.current!
    const handleChange = () => onPick(element.value)
    element.addEventListener('change', handleChange)
    return () => element.removeEventListener('change', handleChange)
  }, [onPick])

  return (
    <label className="flex items-center justify-between gap-2 text-sm">
      {label}
      <input
        ref={input}
        type="color"
        aria-label={label}
        disabled={disabled}
        defaultValue={value && /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'}
        className="h-8 w-12 cursor-pointer rounded border bg-background disabled:cursor-default disabled:opacity-50"
      />
    </label>
  )
}

/**
 * Transparency of the color in percent: a slider, applied when it is released, and a field for an exact value; each
 * applied value is a step of undo. Empty when the objects have different transparency.
 */
function Transparency({
  name,
  transparency,
  onCommit,
}: {
  name: string
  transparency: number | null
  onCommit: (transparency: number) => void
}) {
  const slider = useRef<HTMLInputElement>(null)
  // Where the participant is dragging the slider; `null` while it shows the current transparency.
  const [dragged, setDragged] = useState<number | null>(null)

  useEffect(() => {
    const element = slider.current!
    const handleChange = () => {
      setDragged(null)
      const next = Number(element.value)
      if (next !== transparency) onCommit(next)
    }
    element.addEventListener('change', handleChange)
    return () => element.removeEventListener('change', handleChange)
  }, [transparency, onCommit])

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        {m.transparency}
        <span className="flex items-center gap-1">
          <NumberField
            label={`${name}, %`}
            value={dragged ?? transparency}
            min={0}
            max={100}
            className="w-14"
            onCommit={onCommit}
          />
          <span aria-hidden>%</span>
        </span>
      </div>
      <input
        ref={slider}
        type="range"
        min={0}
        max={100}
        step={5}
        aria-label={name}
        value={dragged ?? transparency ?? 0}
        onChange={(event) => setDragged(Number(event.target.value))}
        className="w-full accent-primary"
      />
    </div>
  )
}

const GRADIENT_DIRECTIONS: { value: GradientDirection; icon: LucideIcon }[] = [
  { value: 'south', icon: ArrowDown },
  { value: 'north', icon: ArrowUp },
  { value: 'east', icon: ArrowRight },
  { value: 'west', icon: ArrowLeft },
]

/** The second color a gradient turned on starts with: white, or light blue over a white fill, where white shows nothing. */
function startingGradient(fill: string | null): string {
  return fill?.toLowerCase() === '#ffffff' ? '#dae8fc' : '#ffffff'
}

/**
 * The gradient of the fill: turned on or off, its second color through the color picker of the browser and where the
 * fill turns into it. Each change is a step of undo; the window stays open.
 */
function Gradient({
  color,
  gradient,
  direction,
  onChange,
}: {
  color: string | null
  gradient: string | null
  direction: GradientDirection | null
  onChange: (changes: { gradient?: string; gradientDirection?: GradientDirection }) => void
}) {
  const on = gradient !== null && gradient !== NONE
  return (
    <div role="group" aria-label={m.gradient} className="flex flex-col gap-1.5 text-sm">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={on}
          className="accent-primary"
          onChange={(event) => onChange({ gradient: event.target.checked ? startingGradient(color) : NONE })}
        />
        {m.gradient}
      </label>
      {/* The picker starts anew with the color of the gradient, which another participant may change. */}
      <CustomColor
        key={on ? gradient : NONE}
        label={m.gradientColor}
        value={on ? gradient : null}
        disabled={!on}
        onPick={(next) => onChange({ gradient: next })}
      />
      <div role="group" aria-label={m.gradientDirection} className="grid grid-cols-4 gap-1">
        {GRADIENT_DIRECTIONS.map(({ value, icon: Icon }) => (
          <Button
            key={value}
            type="button"
            variant="outline"
            size="sm"
            aria-label={m.directions[value]}
            title={m.directions[value]}
            aria-pressed={on && direction === value}
            disabled={!on}
            className={cn(on && direction === value && 'bg-accent text-accent-foreground')}
            onClick={() => onChange({ gradientDirection: value })}
          >
            <Icon />
          </Button>
        ))}
      </div>
    </div>
  )
}

function Swatch({ color }: { color: string | null }) {
  return (
    <span
      aria-hidden
      className={cn(
        'size-4 shrink-0 rounded-sm border dark:border-foreground/30',
        color === null && 'border-dashed',
        // No color: a diagonal stroke over an empty square.
        color === NONE && 'bg-[linear-gradient(to_top_right,transparent_45%,var(--destructive)_45%,var(--destructive)_55%,transparent_55%)]',
      )}
      style={color && color !== NONE ? { backgroundColor: color } : undefined}
    />
  )
}
