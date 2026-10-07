import { useSyncExternalStore } from 'react'
import { participantColor } from '../board/identity.ts'
import type { DiagramEditor } from './editor.ts'
import { STICKY_SIGNATURE_ROOM } from './shapes.ts'
import { useEditorState } from './useEditorState.ts'

/** Size of the text of a signature at 100%, which fits the room that a sticky keeps under its text. */
const SIGNATURE_SIZE = 11
/** A signature smaller than this on the screen, zoomed out, is not shown. */
const MIN_SIGNATURE_SIZE = 6
/** Room between a signature and the sides and the bottom of its sticky, at 100%. */
const SIGNATURE_PADDING = 8
const SIGNATURE_BOTTOM = 3

/**
 * Who wrote the text of each sticky of the page, small at its bottom right, in the color of its text, after a dot of
 * the color of that participant. Only the canvas shows it: like the badges of comments, it is a layer over the canvas,
 * not a part of the diagram, so images, files and the clipboard do not have it.
 */
export function StickySignatures({ editor }: { editor: DiagramEditor | null }) {
  const { scale } = useEditorState(editor)
  // Positions depend on scrolling, zoom and cell geometry, and a sticky whose text is edited shows no signature.
  useSyncExternalStore(editor?.onViewChange ?? noSubscription, () => editor?.getViewVersion() ?? 0)
  useSyncExternalStore(editor?.onEditingChange ?? noSubscription, () => editor?.getEditing() ?? null)
  const size = SIGNATURE_SIZE * scale
  if (!editor || size < MIN_SIGNATURE_SIZE) return null

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {editor.stickySignatures().map(({ cellId, by, name, color }) => {
        const bounds = editor.cellBounds(cellId)
        if (!bounds) return null
        const height = (STICKY_SIGNATURE_ROOM - SIGNATURE_BOTTOM) * scale
        return (
          <span
            key={cellId}
            data-testid="sticky-signature"
            data-cell={cellId}
            className="absolute flex items-center justify-end gap-[0.3em] opacity-60"
            style={{
              left: bounds.x + SIGNATURE_PADDING * scale,
              top: bounds.y + bounds.height - SIGNATURE_BOTTOM * scale - height,
              width: Math.max(0, bounds.width - 2 * SIGNATURE_PADDING * scale),
              height,
              fontSize: size,
              lineHeight: `${height}px`,
              color,
            }}
          >
            {by && (
              <span
                className="size-[0.55em] shrink-0 rounded-full"
                style={{ backgroundColor: participantColor(by) }}
              />
            )}
            <span className="truncate">{name}</span>
          </span>
        )
      })}
    </div>
  )
}

const noSubscription = () => () => {}
