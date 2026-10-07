import { Map as MapIcon, Minimize2 } from 'lucide-react'
import { memo, useCallback, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from 'react'
import { Button } from '@/components/ui/button'
import type { Box, DiagramEditor, Point } from '../diagram/editor.ts'
import {
  clampToBox,
  fitMap,
  fromMap,
  MAP_HEIGHT,
  MAP_WIDTH,
  paintColor,
  toMap,
  type MapTransform,
  type PageSketch,
  type SketchShape,
} from '../diagram/minimap.ts'
import { takesText } from '../lib/keyboard.ts'
import { useRemotePresence, type Awareness } from './presence.ts'

/** Finds the minimap over the canvas: pressing on it is not moving the canvas, going somewhere with it is. */
export const MINIMAP_SELECTOR = '[data-minimap]'

/** Whether the minimap is collapsed in this browser: `collapsed` or `expanded`. */
const STORAGE_KEY = 'codraw.minimap'

/** The shortest time between two sketches of a page that others change: a drag gives dozens of changes a second. */
const SKETCH_INTERVAL_MS = 150

/** On a narrower screen the minimap starts collapsed: it would cover much of the canvas. */
const NARROW_SCREEN = '(max-width: 639px)'

/** The radius of the dot of a participant, in units of the minimap. */
const DOT_RADIUS = 4

/** A shape without a fill and a border, e.g. a text, is a gray block. */
const TEXT_FILL = '#d0d7de'
/** The color of a participant whose color is not one. */
const DEFAULT_COLOR = '#57606a'

/** Whether the minimap is expanded: as the participant left it in this browser, else unless the screen is narrow. */
function readOpen(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'collapsed') return false
    if (stored === 'expanded') return true
  } catch {
    // The browser keeps no data for the site: the minimap starts as in a new browser.
  }
  return !(typeof window.matchMedia === 'function' && window.matchMedia(NARROW_SCREEN).matches)
}

function storeOpen(open: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, open ? 'expanded' : 'collapsed')
  } catch {
    // The browser keeps no data for the site: the choice lasts until the page is reloaded.
  }
}

interface MinimapProps {
  /** The editor of the canvas; `null` while the canvas of a page is being made. */
  editor: DiagramEditor | null
  /** Presence of the board: other participants on the page are dots where they look. A draft has none. */
  awareness?: Awareness | null
  /** The minimap is about to move the canvas, on one's own: e.g. following another participant ends. */
  onNavigate?: () => void
}

/**
 * The minimap in the bottom right corner of the canvas: the page small, with the frame of the visible area and the
 * other participants of the page as dots where they look. A click puts its point in the middle of the canvas, dragging
 * the frame scrolls the canvas along. A button and `M` collapse and expand it, and the browser remembers which. A page
 * without cells has none.
 */
export function Minimap({ editor, awareness = null, onNavigate }: MinimapProps) {
  const [open, setOpen] = useState(readOpen)
  const hasCells = useSyncExternalStore(editor?.subscribe ?? noSubscription, () => editor?.getState().hasCells ?? false)
  const shown = editor !== null && hasCells
  const toggle = useCallback(() => {
    const next = !open
    setOpen(next)
    storeOpen(next)
  }, [open])

  useEffect(() => {
    if (!shown) return
    const handleKey = (event: KeyboardEvent) => {
      // The key, not the letter: the Russian layout gives «ь» there.
      if (event.code !== 'KeyM' || event.repeat || event.defaultPrevented || takesText(event.target)) return
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
      event.preventDefault()
      toggle()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [shown, toggle])

  if (!shown) return null
  const label = open ? 'Свернуть мини-карту' : 'Развернуть мини-карту'
  return (
    <div data-minimap="" className="absolute right-6 bottom-6 z-10">
      {open && (
        <div role="region" aria-label="Мини-карта" className="overflow-hidden rounded-md border shadow-md">
          <MinimapView editor={editor} awareness={awareness} onNavigate={onNavigate} />
        </div>
      )}
      {/* The same button in both states, over the corner of the minimap: the keyboard stays on it. */}
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label={label}
        aria-expanded={open}
        title={`${label} (M)`}
        className={open ? 'absolute top-1 right-1 size-6 bg-background/90' : 'shadow-md'}
        onClick={toggle}
      >
        {open ? <Minimize2 className="size-3.5" /> : <MapIcon />}
      </Button>
    </div>
  )
}

/** A drag on the minimap: what it showed when the drag started, where the frame was taken, and the move to make. */
interface Drag {
  transform: MapTransform
  /** From the middle of the visible area to the point of the page that was pressed. */
  grab: Point
  /** The middle of the canvas to go to on the next frame. */
  pending: Point | null
  frame: number | null
}

/** The picture of the minimap and what pressing on it does. */
function MinimapView({
  editor,
  awareness,
  onNavigate,
}: {
  editor: DiagramEditor
  awareness: Awareness | null
  onNavigate?: () => void
}) {
  // The frame follows every scroll and zoom, the sketch the changes of the page.
  useSyncExternalStore(editor.onViewChange, editor.getViewVersion)
  const sketch = useSketch(editor)
  const presence = useRemotePresence(awareness)
  // While the frame is dragged, the minimap does not rescale under the pointer.
  const [frozen, setFrozen] = useState<MapTransform | null>(null)
  const drag = useRef<Drag | null>(null)
  useEffect(
    () => () => {
      if (drag.current?.frame != null) cancelAnimationFrame(drag.current.frame)
    },
    [],
  )

  const visible = editor.visibleArea()
  const transform = frozen ?? fitMap(sketch.bounds, visible)
  const { offset, extent } = transform
  const corner = toMap(transform, visible)
  const frame = { ...corner, width: visible.width * transform.scale, height: visible.height * transform.scale }
  const dots: Box = {
    x: DOT_RADIUS,
    y: DOT_RADIUS,
    width: MAP_WIDTH - 2 * DOT_RADIUS,
    height: MAP_HEIGHT - 2 * DOT_RADIUS,
  }

  /** The point of the page under the pointer, as `transform` shows the page. */
  const pagePoint = (event: PointerEvent<SVGSVGElement>, shown: MapTransform): Point => {
    const rect = event.currentTarget.getBoundingClientRect()
    return fromMap(shown, {
      x: ((event.clientX - rect.left) * MAP_WIDTH) / (rect.width || MAP_WIDTH),
      y: ((event.clientY - rect.top) * MAP_HEIGHT) / (rect.height || MAP_HEIGHT),
    })
  }
  const flush = (current: Drag) => {
    if (current.pending) editor.centerOn(current.pending)
    current.pending = null
  }
  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const at = pagePoint(event, transform)
    const inFrame =
      at.x >= visible.x && at.x <= visible.x + visible.width && at.y >= visible.y && at.y <= visible.y + visible.height
    // The frame keeps the place where it was taken under the pointer; elsewhere, the point goes to the middle at once.
    const grab = inFrame
      ? { x: at.x - visible.x - visible.width / 2, y: at.y - visible.y - visible.height / 2 }
      : { x: 0, y: 0 }
    drag.current = { transform, grab, pending: null, frame: null }
    setFrozen(transform)
    onNavigate?.()
    if (!inFrame) editor.centerOn(clampToBox(at, transform.extent))
  }
  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const current = drag.current
    if (!current) return
    const at = pagePoint(event, current.transform)
    current.pending = clampToBox({ x: at.x - current.grab.x, y: at.y - current.grab.y }, current.transform.extent)
    // One scroll a frame: a scroll that pans the view redraws the whole page.
    current.frame ??= requestAnimationFrame(() => {
      current.frame = null
      flush(current)
    })
  }
  const handlePointerUp = () => {
    const current = drag.current
    if (!current) return
    if (current.frame !== null) cancelAnimationFrame(current.frame)
    flush(current)
    drag.current = null
    setFrozen(null)
  }

  return (
    <svg
      data-testid="minimap"
      aria-hidden
      viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
      className="block h-32 w-48 cursor-pointer touch-none bg-background select-none max-sm:h-24 max-sm:w-36"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      // The keyboard stays with the canvas.
      onMouseDown={(event) => event.preventDefault()}
    >
      <g transform={`translate(${offset.x} ${offset.y}) scale(${transform.scale}) translate(${-extent.x} ${-extent.y})`}>
        <SketchPicture sketch={sketch} />
      </g>
      <rect
        data-testid="minimap-frame"
        x={frame.x}
        y={frame.y}
        width={frame.width}
        height={frame.height}
        className="cursor-move fill-blue-600/10 stroke-blue-600"
        strokeWidth={1.5}
      />
      {presence.map((participant) => {
        if (participant.page !== editor.pageId || !participant.viewport) return null
        const at = clampToBox(toMap(transform, participant.viewport), dots)
        return (
          <circle
            key={participant.clientId}
            data-testid="minimap-participant"
            data-participant={participant.name}
            cx={at.x}
            cy={at.y}
            r={DOT_RADIUS}
            fill={paintColor(participant.color) ?? DEFAULT_COLOR}
            stroke="#ffffff"
            strokeWidth={1.5}
          >
            <title>{participant.name}</title>
          </circle>
        )
      })}
    </svg>
  )
}

/**
 * The sketch of the page of the editor, taken again after changes of the view at most every
 * {@link SKETCH_INTERVAL_MS}; the editor gives the same sketch until the page changes, so scrolling redraws nothing.
 */
function useSketch(editor: DiagramEditor): PageSketch {
  // Changes of the view seen so far; a sketch taken before the last of them may be out of date.
  const version = useRef(0)
  const last = useRef<{ editor: DiagramEditor; version: number; sketch: PageSketch } | null>(null)
  const subscribe = useCallback(
    (onChange: () => void) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const changed = () => {
        timer = undefined
        version.current++
        onChange()
      }
      const off = editor.onViewChange(() => {
        timer ??= setTimeout(changed, SKETCH_INTERVAL_MS)
      })
      return () => {
        off()
        clearTimeout(timer)
      }
    },
    [editor],
  )
  return useSyncExternalStore(subscribe, () => {
    const cached = last.current
    if (cached?.editor === editor && cached.version === version.current) return cached.sketch
    const sketch = editor.pageSketch()
    last.current = { editor, version: version.current, sketch }
    return sketch
  })
}

/**
 * The shapes and the edges of a sketch in coordinates of the page; lines keep their width at any scale. Edges take the
 * muted color of the theme, which is seen on the background of the minimap in either theme.
 */
const SketchPicture = memo(function SketchPicture({ sketch }: { sketch: PageSketch }) {
  return (
    <>
      {sketch.shapes.map((shape) => (
        <SketchShapeView key={shape.id} shape={shape} />
      ))}
      <g className="text-muted-foreground">
        {sketch.edges.map((edge) => (
          <polyline
            key={edge.id}
            points={edge.points.map((point) => `${point.x},${point.y}`).join(' ')}
            fill="none"
            stroke="currentColor"
            strokeWidth={0.75}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>
    </>
  )
})

function SketchShapeView({ shape }: { shape: SketchShape }) {
  const { x, y, width, height } = shape
  const fill = shape.fill ?? (shape.stroke || shape.header ? 'none' : TEXT_FILL)
  const line = { stroke: shape.stroke ?? 'none', strokeWidth: 1, vectorEffect: 'non-scaling-stroke' } as const
  return (
    <g transform={shape.rotation ? `rotate(${shape.rotation} ${x + width / 2} ${y + height / 2})` : undefined}>
      {shape.ellipse ? (
        <ellipse cx={x + width / 2} cy={y + height / 2} rx={width / 2} ry={height / 2} fill={fill} {...line} />
      ) : (
        <rect x={x} y={y} width={width} height={height} fill={fill} {...line} />
      )}
      {shape.header && (
        <rect x={x} y={y} width={width} height={shape.header.height} fill={shape.header.fill ?? 'none'} {...line} />
      )}
    </g>
  )
}

const noSubscription = () => () => {}
