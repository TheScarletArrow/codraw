import { ArrowLeftRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { EdgeEnd, EdgeMarkers } from './editor.ts'
import { EDGE_MARKERS } from './edgeMarkers.ts'
import type { edgeMarkerMessages } from './edgeMarkers.messages.ts'
import { pickerMessages } from './pickers.messages.ts'

const m = pickerMessages.edgeMarkers

/** The directions of an edge in one click: the markers of its start and of its end. */
const DIRECTIONS: { label: string; start: string; end: string }[] = [
  { label: m.forward, start: 'none', end: 'classic' },
  { label: m.backward, start: 'classic', end: 'none' },
  { label: m.bothWays, start: 'classic', end: 'classic' },
  { label: m.noArrows, start: 'none', end: 'none' },
]

/** How a marker looks with its tip at (0, 0) and the edge coming from the left. */
interface MarkerLook {
  /** How far before the tip the line stops. */
  back: number
  draw: ReactNode
}

const NO_MARKER: MarkerLook = { back: 0, draw: null }

/** The looks of the markers of {@link EDGE_MARKERS}, close to how maxGraph draws them with a unit of 8. */
const LOOKS: Record<keyof typeof edgeMarkerMessages, MarkerLook> = {
  none: NO_MARKER,
  classic: { back: 6, draw: <path d="M0 0 L-8 -4 L-6 0 L-8 4 Z" fill="currentColor" /> },
  classicThin: { back: 6, draw: <path d="M0 0 L-8 -2.7 L-6 0 L-8 2.7 Z" fill="currentColor" /> },
  open: { back: 0, draw: <path d="M-8 -4 L0 0 L-8 4" /> },
  block: { back: 8, draw: <path d="M0 0 L-8 -4 L-8 4 Z" fill="currentColor" /> },
  blockHollow: { back: 8, draw: <path d="M0 0 L-8 -4 L-8 4 Z" /> },
  diamond: { back: 10, draw: <path d="M0 0 L-5 -4 L-10 0 L-5 4 Z" fill="currentColor" /> },
  diamondHollow: { back: 10, draw: <path d="M0 0 L-5 -4 L-10 0 L-5 4 Z" /> },
  oval: { back: 7, draw: <circle cx={-3.5} cy={0} r={3.5} fill="currentColor" /> },
  ovalHollow: { back: 7, draw: <circle cx={-3.5} cy={0} r={3.5} /> },
  dash: { back: 0, draw: <path d="M-4 4 L-12 -4" /> },
  cross: { back: 0, draw: <path d="M-4 4 L-12 -4 M-4 -4 L-12 4" /> },
  ERone: { back: 0, draw: <path d="M-4 -4 V4" /> },
  ERmandOne: { back: 0, draw: <path d="M-4 -4 V4 M-8 -4 V4" /> },
  ERmany: { back: 0, draw: <path d="M0 -4 L-8 0 L0 4" /> },
  ERoneToMany: { back: 0, draw: <path d="M0 -4 L-8 0 L0 4 M-8 -4 V4" /> },
  // The line stops at the circle and goes on between the circle and the tip.
  ERzeroToOne: { back: 15, draw: <path d="M-4 -4 V4 M-9 0 H0 M-9 0 A3 3 0 1 0 -15 0 A3 3 0 1 0 -9 0" /> },
  ERzeroToMany: { back: 15, draw: <path d="M0 -4 L-8 0 L0 4 M-9 0 H0 M-9 0 A3 3 0 1 0 -15 0 A3 3 0 1 0 -9 0" /> },
}

const lookOf = (marker: string | null): MarkerLook =>
  marker !== null && Object.hasOwn(LOOKS, marker) ? LOOKS[marker as keyof typeof LOOKS] : NO_MARKER

/** An edge from left to right with the markers `start` and `end`; an unknown or a mixed marker is not drawn. */
function EdgeSample({ start, end, wide = false }: { start: string | null; end: string | null; wide?: boolean }) {
  const width = wide ? 40 : 28
  const from = lookOf(start)
  const to = lookOf(end)
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${width} 16`}
      // A class with `size-` keeps the size of the icons of a button off the sample.
      className={cn('size-auto h-4', wide ? 'w-10' : 'w-7')}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinejoin="round"
    >
      <path d={`M${2 + from.back} 8 H${width - 2 - to.back}`} />
      <g transform="translate(2 8) scale(-1 1)">{from.draw}</g>
      <g transform={`translate(${width - 2} 8)`}>{to.draw}</g>
    </svg>
  )
}

interface EdgeMarkerPickerProps {
  markers: EdgeMarkers
  onMarker: (end: EdgeEnd, marker: string) => void
  onMarkers: (markers: Record<EdgeEnd, string>) => void
  onSwap: () => void
}

/**
 * «Стрелки» of the selected edges: the direction in one click, the markers of the start and of the end, and the swap of
 * the markers of the ends. The button shows the markers the selected edges have.
 */
export function EdgeMarkerPicker({ markers, onMarker, onMarkers, onSwap }: EdgeMarkerPickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" aria-label={m.name} title={m.title}>
          <EdgeSample start={markers.start} end={markers.end} wide />
          {m.name}
        </Button>
      </PopoverTrigger>
      <PopoverContent aria-label={m.name} className="flex w-auto flex-col gap-3">
        <Choices label={m.direction} columns="grid-cols-4">
          {DIRECTIONS.map((direction) => (
            <Choice
              key={direction.label}
              label={direction.label}
              pressed={markers.start === direction.start && markers.end === direction.end}
              className="w-14"
              onClick={() => onMarkers({ start: direction.start, end: direction.end })}
            >
              <EdgeSample start={direction.start} end={direction.end} wide />
            </Choice>
          ))}
        </Choices>
        <MarkerChoices end="start" label={m.start} value={markers.start} onMarker={onMarker} />
        <MarkerChoices end="end" label={m.end} value={markers.end} onMarker={onMarker} />
        <Button type="button" variant="outline" size="sm" title={m.swapTitle} onClick={onSwap}>
          <ArrowLeftRight />
          {m.swap}
        </Button>
      </PopoverContent>
    </Popover>
  )
}

/** The markers of one end; none is pressed when the selected edges have different ones. */
function MarkerChoices({
  end,
  label,
  value,
  onMarker,
}: {
  end: EdgeEnd
  label: string
  value: string | null
  onMarker: (end: EdgeEnd, marker: string) => void
}) {
  return (
    <Choices label={label} name={m.ofEdge(label)} columns="grid-cols-6">
      {EDGE_MARKERS.map((marker) => (
        <Choice
          key={marker.value}
          label={marker.label}
          pressed={value === marker.value}
          className="w-9"
          onClick={() => onMarker(end, marker.value)}
        >
          <EdgeSample start={end === 'start' ? marker.value : 'none'} end={end === 'end' ? marker.value : 'none'} />
        </Choice>
      ))}
    </Choices>
  )
}

function Choices({
  label,
  name = label,
  columns,
  children,
}: {
  label: string
  name?: string
  columns: string
  children: ReactNode
}) {
  return (
    <div role="group" aria-label={name} className="flex flex-col gap-1">
      <span className="text-sm">{label}</span>
      <div className={cn('grid gap-1', columns)}>{children}</div>
    </div>
  )
}

/** A choice shown by its sample, named by its tooltip. */
function Choice({
  label,
  pressed,
  className,
  onClick,
  children,
}: {
  label: string
  pressed: boolean
  className: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cn(className, pressed && 'bg-accent text-accent-foreground')}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}
