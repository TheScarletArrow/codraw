import { useSyncExternalStore } from 'react'
import type { DiagramEditor } from '../diagram/editor.ts'
import { Avatar } from './Participants.tsx'
import { useRemotePresence, type Awareness } from './presence.ts'

const SELECTION_PADDING = 3

/**
 * Draws the cursors and selections of the other participants over the canvas. It is a separate layer,
 * not maxGraph cells, so presence never ends up in the board document.
 */
export function PresenceLayer({ editor, awareness }: { editor: DiagramEditor | null; awareness: Awareness | null }) {
  const presence = useRemotePresence(awareness)
  // Positions depend on scrolling, zoom and cell geometry: re-render whenever the view changes.
  useSyncExternalStore(editor?.onViewChange ?? noSubscription, () => editor?.getViewVersion() ?? 0)

  if (!editor) return null

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {presence.flatMap((participant) =>
        participant.selection.map((id) => {
          const bounds = editor.cellBounds(id)
          if (!bounds) return null
          return (
            <div
              key={`${participant.clientId}:${id}`}
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
      {presence.map((participant) => {
        if (!participant.cursor) return null
        const position = editor.toCanvasPoint(participant.cursor)
        return (
          <div
            key={participant.clientId}
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
      })}
    </div>
  )
}

const noSubscription = () => () => {}
