import { ArrowRight } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import type { DiagramEditor, Point } from '../diagram/editor.ts'
import { Avatar } from './Participants.tsx'
import { useRemotePresence, type Awareness, type RemotePresence } from './presence.ts'

const SELECTION_PADDING = 3
/** Distance of an off-screen cursor label from the edge of the canvas. */
const EDGE_MARGIN = 6

/**
 * Draws the cursors and selections of the other participants on the same page over the canvas. It is a
 * separate layer, not maxGraph cells, so presence never ends up in the board document. A cursor outside the
 * visible area becomes a label at the nearest edge that brings the cursor into view.
 */
export function PresenceLayer({ editor, awareness }: { editor: DiagramEditor | null; awareness: Awareness | null }) {
  const presence = useRemotePresence(awareness)
  // Positions depend on scrolling, zoom and cell geometry: re-render whenever the view changes.
  useSyncExternalStore(editor?.onViewChange ?? noSubscription, () => editor?.getViewVersion() ?? 0)

  if (!editor) return null
  const here = presence.filter((participant) => participant.page === editor.pageId)
  const viewport = editor.viewportSize()

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {here.flatMap((participant) =>
        participant.selection.map((id) => {
          const bounds = editor.cellBounds(id)
          if (!bounds) return null
          return (
            <div
              key={`${participant.clientId}:${id}`}
              aria-hidden
              data-testid="remote-selection"
              data-participant={participant.name}
              className="absolute rounded-sm border-2"
              style={{
                left: bounds.x - SELECTION_PADDING,
                top: bounds.y - SELECTION_PADDING,
                width: bounds.width + 2 * SELECTION_PADDING,
                height: bounds.height + 2 * SELECTION_PADDING,
                borderColor: participant.color,
              }}
            />
          )
        }),
      )}
      {here.map((participant) => {
        if (!participant.cursor) return null
        const position = editor.toCanvasPoint(participant.cursor)
        const visible = position.x >= 0 && position.y >= 0 && position.x <= viewport.width && position.y <= viewport.height
        return visible ? (
          <RemoteCursor key={participant.clientId} participant={participant} position={position} />
        ) : (
          <OffscreenCursor
            key={participant.clientId}
            participant={participant}
            position={position}
            viewport={viewport}
            onClick={() => editor.centerOn(participant.cursor!)}
          />
        )
      })}
    </div>
  )
}

function RemoteCursor({ participant, position }: { participant: RemotePresence; position: Point }) {
  return (
    <div
      aria-hidden
      data-testid="remote-cursor"
      className="absolute top-0 left-0"
      style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
    >
      <svg width="16" height="20" viewBox="0 0 16 20" className="drop-shadow-sm">
        <path d="M1 1 L1 17 L5.5 13 L8.5 19 L11 18 L8 12 L14 12 Z" fill={participant.color} stroke="white" strokeWidth="1.2" />
      </svg>
      <span
        className="absolute top-4 left-3 flex items-center gap-1 rounded px-1.5 py-0.5 text-xs whitespace-nowrap text-white"
        style={{ backgroundColor: participant.color }}
      >
        <Avatar url={participant.avatarUrl} className="size-4" />
        {participant.name}
      </span>
    </div>
  )
}

/** A label at the edge of the canvas, pointing to a cursor outside the visible area. */
function OffscreenCursor({
  participant,
  position,
  viewport,
  onClick,
}: {
  participant: RemotePresence
  position: Point
  viewport: { width: number; height: number }
  onClick: () => void
}) {
  const clamp = (value: number, max: number) => Math.max(EDGE_MARGIN, Math.min(value, max - EDGE_MARGIN))
  const x = clamp(position.x, viewport.width)
  const y = clamp(position.y, viewport.height)
  // The label lies inside the canvas whichever edge it sticks to.
  const shiftX = position.x < 0 ? '0%' : position.x > viewport.width ? '-100%' : '-50%'
  const shiftY = position.y < 0 ? '0%' : position.y > viewport.height ? '-100%' : '-50%'
  const angle = (Math.atan2(position.y - y, position.x - x) * 180) / Math.PI

  return (
    <button
      type="button"
      data-testid="remote-cursor-offscreen"
      data-participant={participant.name}
      aria-label={`Показать курсор: ${participant.name}`}
      title={`Показать курсор: ${participant.name}`}
      className="pointer-events-auto absolute top-0 left-0 flex items-center gap-1 rounded-full px-2 py-0.5 text-xs whitespace-nowrap text-white shadow-sm"
      style={{ transform: `translate(${x}px, ${y}px) translate(${shiftX}, ${shiftY})`, backgroundColor: participant.color }}
      onClick={onClick}
    >
      <ArrowRight aria-hidden className="size-3" style={{ transform: `rotate(${angle}deg)` }} />
      {participant.name}
    </button>
  )
}

const noSubscription = () => () => {}
