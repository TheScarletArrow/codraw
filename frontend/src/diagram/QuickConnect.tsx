import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, type LucideIcon } from 'lucide-react'
import { useRef, useState, useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Box, DiagramEditor } from './editor.ts'
import type { Side } from './quickConnect.ts'
import { pickerMessages } from './pickers.messages.ts'
import { ShapeIcon } from './ShapeIcon.tsx'
import { findShape, type ShapeId } from './shapes.ts'
import { useEditorState } from './useEditorState.ts'

const ARROW_SIZE = 20
/** Distance of an arrow from the border: past the connection point of maxGraph at the right border. */
const ARROW_OFFSET = 24

const ARROWS: { side: Side; icon: LucideIcon }[] = [
  { side: 'left', icon: ArrowLeft },
  { side: 'right', icon: ArrowRight },
  { side: 'top', icon: ArrowUp },
  { side: 'bottom', icon: ArrowDown },
]

/**
 * Arrows around the selected shape. An arrow opens the list of the shapes of its group; the chosen one is added on
 * that side and connected to the selected shape.
 */
export function QuickConnect({ editor }: { editor: DiagramEditor | null }) {
  const { quickConnect } = useEditorState(editor)
  // Positions depend on scrolling, zoom and cell geometry: re-render whenever the view changes.
  useSyncExternalStore(editor?.onViewChange ?? noSubscription, () => editor?.getViewVersion() ?? 0)

  const bounds = editor && quickConnect ? editor.cellBounds(quickConnect.cellId) : null
  if (!editor || !quickConnect || !bounds) return null

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {ARROWS.map((arrow) => (
        <QuickConnectArrow
          key={arrow.side}
          {...arrow}
          bounds={bounds}
          shapes={quickConnect.shapes}
          onPick={(shape) => editor.addConnectedShape(arrow.side, shape)}
        />
      ))}
    </div>
  )
}

function QuickConnectArrow({
  side,
  icon: Icon,
  bounds,
  shapes,
  onPick,
}: {
  side: Side
  icon: LucideIcon
  bounds: Box
  shapes: ShapeId[]
  onPick: (shape: ShapeId) => void
}) {
  const [open, setOpen] = useState(false)
  // After a pick the canvas keeps the focus that the editor gave it, so that its shortcuts work on the new shape.
  const picked = useRef(false)
  const name = pickerMessages.quickConnect.add[side]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={name}
          title={name}
          className="pointer-events-auto absolute flex items-center justify-center rounded-full bg-blue-600 text-white opacity-60 shadow-sm transition-opacity hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
          style={{ ...arrowPosition(bounds, side), width: ARROW_SIZE, height: ARROW_SIZE }}
        >
          <Icon aria-hidden className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        aria-label={pickerMessages.quickConnect.shapes}
        className="flex max-h-80 w-56 flex-col gap-0.5 overflow-y-auto p-1"
        onCloseAutoFocus={(event) => {
          if (picked.current) event.preventDefault()
          picked.current = false
        }}
      >
        {shapes.map((id) => (
          <Button
            key={id}
            type="button"
            variant="ghost"
            className="h-auto justify-start py-1.5 text-left whitespace-normal"
            onClick={() => {
              picked.current = true
              onPick(id)
              setOpen(false)
            }}
          >
            <ShapeIcon shape={id} />
            {findShape(id)?.label}
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

/** Top-left corner of the arrow on `side`, centred on that side of the shape. */
function arrowPosition({ x, y, width, height }: Box, side: Side) {
  const centerX = x + width / 2 - ARROW_SIZE / 2
  const centerY = y + height / 2 - ARROW_SIZE / 2
  switch (side) {
    case 'left':
      return { left: x - ARROW_OFFSET - ARROW_SIZE, top: centerY }
    case 'right':
      return { left: x + width + ARROW_OFFSET, top: centerY }
    case 'top':
      return { left: centerX, top: y - ARROW_OFFSET - ARROW_SIZE }
    case 'bottom':
      return { left: centerX, top: y + height + ARROW_OFFSET }
  }
}

const noSubscription = () => () => {}
