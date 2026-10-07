import { ALargeSmall, Lock } from 'lucide-react'
import { useSyncExternalStore, type MouseEvent } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { STICKY_COLORS } from './colors.ts'
import type { Box, DiagramEditor } from './editor.ts'
import { lockLabel } from './locks.ts'
import { useEditorState } from './useEditorState.ts'

/** Room between the stickies and the panel. */
const GAP = 12
/** Height of the panel, to tell whether it fits under the stickies. */
const PANEL_HEIGHT = 42
/** About the width of the panel, to keep it on the canvas. */
const PANEL_WIDTH = 220
/** Room between the panel and the edges of the canvas. */
const EDGE_MARGIN = 4

/**
 * The colors of stickies and the fitting of their text, in a panel under the selected stickies, or over them when the
 * visible part of the canvas has no room under them. A color recolors the selected stickies and becomes the color of
 * new ones. For locked stickies the panel is disabled, and a lock says who locked them.
 */
export function StickyPanel({ editor }: { editor: DiagramEditor | null }) {
  const { stickies, lock } = useEditorState(editor)
  // Positions depend on scrolling, zoom and cell geometry: re-render whenever the view changes.
  useSyncExternalStore(editor?.onViewChange ?? noSubscription, () => editor?.getViewVersion() ?? 0)

  const bounds = editor && stickies ? around(stickies.cellIds.flatMap((id) => editor.cellBounds(id) ?? [])) : null
  if (!editor || !stickies || !bounds) return null
  const locked = stickies.locked ? lockLabel(lock?.locks.map((holder) => holder.lockedBy) ?? []) : null
  const viewport = editor.viewportSize()
  const below = bounds.y + bounds.height + GAP + PANEL_HEIGHT <= viewport.height
  const center = bounds.x + bounds.width / 2
  const left = Math.max(EDGE_MARGIN, Math.min(center - PANEL_WIDTH / 2, viewport.width - PANEL_WIDTH - EDGE_MARGIN))
  // A click gives the keyboard back to the canvas, so that its shortcuts, e.g. Ctrl+Z, work at once; the keyboard
  // stays on the panel for whoever goes through it with the keyboard.
  const done = (event: MouseEvent) => {
    if (event.detail > 0) editor.focus()
  }

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        role="toolbar"
        aria-label="Стикеры"
        data-side={below ? 'bottom' : 'top'}
        className="pointer-events-auto absolute flex items-center gap-1 rounded-md border bg-background p-1 text-foreground shadow-md"
        style={{
          left,
          top: below ? bounds.y + bounds.height + GAP : bounds.y - GAP,
          transform: below ? undefined : 'translateY(-100%)',
        }}
      >
        {locked && (
          <span role="img" aria-label={locked} title={locked} className="px-1.5 text-muted-foreground">
            <Lock aria-hidden className="size-4" />
          </span>
        )}
        <fieldset disabled={locked !== null} className="flex items-center gap-1">
          {STICKY_COLORS.map((color) => (
            <button
              key={color.value}
              type="button"
              aria-label={color.name}
              aria-pressed={stickies.color === color.value}
              title={color.name}
              className={cn(
                'size-7 rounded-sm border outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50',
                stickies.color === color.value && 'ring-2 ring-ring ring-offset-1',
              )}
              style={{ backgroundColor: color.value }}
              onClick={(event) => {
                editor.setStickyColor(color.value)
                done(event)
              }}
            />
          ))}
          <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Подгонять текст"
            aria-pressed={stickies.textFit}
            title="Подгонять текст: размер текста уменьшается, чтобы текст поместился в стикер"
            className={cn(stickies.textFit && 'bg-accent text-accent-foreground')}
            onClick={(event) => {
              editor.setTextFit(!stickies.textFit)
              done(event)
            }}
          >
            <ALargeSmall />
          </Button>
        </fieldset>
      </div>
    </div>
  )
}

/** The box around boxes, or `null` without any. */
function around(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null
  const left = Math.min(...boxes.map((box) => box.x))
  const top = Math.min(...boxes.map((box) => box.y))
  const right = Math.max(...boxes.map((box) => box.x + box.width))
  const bottom = Math.max(...boxes.map((box) => box.y + box.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

const noSubscription = () => () => {}
