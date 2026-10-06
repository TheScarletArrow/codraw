import { ArrowRight, PenLine, TriangleAlert } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import type { Box, DiagramEditor, LabelEditing, Point } from '../diagram/editor.ts'
import { Avatar } from './Participants.tsx'
import { useRemotePresence, type Awareness, type RemotePresence } from './presence.ts'

const SELECTION_PADDING = 3
/** Distance of an off-screen cursor label from the edge of the canvas. */
const EDGE_MARGIN = 6
/** Distance between the outlines of participants who edit the label of one cell. */
const EDITING_RING = 3
/** Distance of the tags of a label being edited, and of the warning, from the cell. */
const TAG_GAP = 4
/** Height of a tag «… редактирует»: the tags go under the cell when the room above it is smaller. */
const TAG_HEIGHT = 20
/** Room above the edited cell that the warning needs; with less it goes under the cell. */
const WARNING_ROOM = 64
/**
 * The tags and the warning lie over the arrows and badges around cells, which come later on the page, but under the
 * label editor of maxGraph (z-index 5), so that they never hide the text being typed.
 */
const NOTICE_Z_INDEX = 4

/**
 * Draws the cursors, selections and labels being edited of the other participants on the same page over the canvas. It
 * is a separate layer, not maxGraph cells, so presence never ends up in the board document. A cursor outside the
 * visible area becomes a label at the nearest edge that brings the cursor into view. Over the label that the
 * participant edits, it warns that others edit it too or have changed it.
 */
export function PresenceLayer({ editor, awareness }: { editor: DiagramEditor | null; awareness: Awareness | null }) {
  const presence = useRemotePresence(awareness)
  // Positions depend on scrolling, zoom and cell geometry: re-render whenever the view changes.
  useSyncExternalStore(editor?.onViewChange ?? noSubscription, () => editor?.getViewVersion() ?? 0)
  const editing = useSyncExternalStore(editor?.onEditingChange ?? noSubscription, () => editor?.getEditing() ?? null)

  if (!editor) return null
  const here = presence.filter((participant) => participant.page === editor.pageId)
  const viewport = editor.viewportSize()
  // Cells whose labels other participants edit, with those participants in the order of their outlines.
  const edited = new Map<string, RemotePresence[]>()
  for (const participant of here) {
    if (participant.editing) edited.set(participant.editing, [...(edited.get(participant.editing) ?? []), participant])
  }
  const editingBounds = editing && editor.cellBounds(editing.cellId)

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {here.flatMap((participant) =>
        // The outline of the label being edited stands for the selection of that cell.
        participant.selection.map((id) => {
          if (id === participant.editing) return null
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
      {[...edited].map(([id, editors]) => {
        const bounds = editor.cellBounds(id)
        if (!bounds) return null
        // The warning over the label the participant edits names the others, in place of their tags.
        return <EditedLabel key={`editing:${id}`} bounds={bounds} editors={editors} tags={id !== editing?.cellId} />
      })}
      {editing && editingBounds && (
        <EditingWarning editing={editing} bounds={editingBounds} others={edited.get(editing.cellId) ?? []} />
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

/**
 * The outlines of a cell whose label other participants edit, one inside another in their colors, and the tags
 * «… редактирует» above the cell, one over another, or under it at the top edge of the canvas.
 */
function EditedLabel({ bounds, editors, tags }: { bounds: Box; editors: RemotePresence[]; tags: boolean }) {
  const padding = SELECTION_PADDING + (editors.length - 1) * EDITING_RING
  const above = bounds.y - padding - TAG_GAP >= TAG_HEIGHT * editors.length
  return (
    <>
      {editors.map((participant, index) => {
        const ring = SELECTION_PADDING + index * EDITING_RING
        return (
          <div
            key={participant.clientId}
            aria-hidden
            data-testid="remote-editing"
            data-participant={participant.name}
            className="absolute rounded-sm border-2"
            style={{
              left: bounds.x - ring,
              top: bounds.y - ring,
              width: bounds.width + 2 * ring,
              height: bounds.height + 2 * ring,
              borderColor: participant.color,
            }}
          />
        )
      })}
      {tags && (
        <div
          aria-hidden
          className="absolute flex flex-col items-start gap-0.5"
          style={{
            zIndex: NOTICE_Z_INDEX,
            ...(above
              ? { left: bounds.x - padding, top: bounds.y - padding - TAG_GAP, transform: 'translateY(-100%)' }
              : { left: bounds.x - padding, top: bounds.y + bounds.height + padding + TAG_GAP }),
          }}
        >
          {editors.map((participant) => (
            <span
              key={participant.clientId}
              data-testid="remote-editing-tag"
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs whitespace-nowrap text-white"
              style={{ backgroundColor: participant.color }}
            >
              <PenLine aria-hidden className="size-3" />
              {participant.name} редактирует
            </span>
          ))}
        </div>
      )}
    </>
  )
}

/**
 * Over the label the participant edits: others edit it too, and the editing applied last stays; or another participant
 * has changed it, and applying the editing writes the participant's text all the same. It never takes the pointer.
 */
function EditingWarning({ editing, bounds, others }: { editing: LabelEditing; bounds: Box; others: RemotePresence[] }) {
  if (others.length === 0 && !editing.changedRemotely) return null
  const above = bounds.y >= WARNING_ROOM
  return (
    <div
      role="status"
      data-testid="editing-warning"
      className="absolute flex max-w-72 gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-950 shadow-sm"
      style={{
        zIndex: NOTICE_Z_INDEX,
        left: Math.max(EDGE_MARGIN, bounds.x),
        ...(above
          ? { top: bounds.y - TAG_GAP, transform: 'translateY(-100%)' }
          : { top: bounds.y + bounds.height + TAG_GAP }),
      }}
    >
      <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0 text-amber-600" />
      <div className="flex flex-col gap-0.5">
        {others.length > 0 && (
          <p>
            {joinNames(others.map((participant) => participant.name))}{' '}
            {others.length === 1 ? 'тоже редактирует' : 'тоже редактируют'} эту подпись: сохранится правка, которую
            закончат последней
          </p>
        )}
        {editing.changedRemotely && (
          <p>
            Подпись изменили, пока вы её редактировали.{' '}
            <span className="text-amber-800">Сохранится ваша правка, Esc отменит её</span>
          </p>
        )}
      </div>
    </div>
  )
}

/** «Боб», «Боб и Вера», «Боб, Вера и Гена». */
function joinNames(names: string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} и ${names.at(-1)}` : (names[0] ?? '')
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
