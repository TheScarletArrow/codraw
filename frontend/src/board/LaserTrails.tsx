import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { DiagramEditor } from '../diagram/editor.ts'
import { addLaserPoint, laserOpacity, placeLaser, type LaserTrail } from './laser.ts'
import { readRemotePresence, type Awareness } from './presence.ts'

/** Width of a trail on the screen, whatever the scale. */
const TRAIL_WIDTH = 4

/** A trail to draw: whose it is and its points on the local clock. */
interface ShownTrail {
  key: string
  name: string
  color: string
  trail: LaserTrail
}

/** A trail of another participant as it arrived. */
interface RemoteTrail extends ShownTrail {
  page: string
  /** When the author published it, on their clock: the same trail sent again with another field keeps its points. */
  at: number
}

/**
 * Draws the trails of the laser pointer on the page: the participant's own as they draw it, and those of the other
 * participants on the same page as they publish them, in their colors. Each piece of a trail fades out over a second
 * after it was drawn; the layer draws a frame after frame while something fades and stays idle otherwise.
 */
export function LaserTrails({
  editor,
  awareness,
  name,
  color,
}: {
  editor: DiagramEditor
  awareness: Awareness | null
  /** Name and color of the participant, for their own trail. */
  name: string
  color: string
}) {
  const remote = useRemoteTrails(awareness)
  const own = useOwnTrail(editor)
  const [now, setNow] = useState(() => performance.now())
  const trails: ShownTrail[] = [
    ...remote.filter((trail) => trail.page === editor.pageId),
    { key: 'own', name, color, trail: own },
  ]
  const fading = trails.some(({ trail }) =>
    trail.some((stroke) => stroke.some((point) => laserOpacity(point, now) > 0)),
  )
  useEffect(() => {
    if (!fading) return
    const frame = requestAnimationFrame(() => setNow(performance.now()))
    return () => cancelAnimationFrame(frame)
  }, [fading, now])

  if (!fading) return null
  return (
    <svg aria-hidden data-testid="laser-trails" className="absolute inset-0 size-full">
      {trails.map((shown) => {
        const segments = shown.trail.flatMap((stroke, strokeIndex) =>
          stroke.flatMap((point, index) => {
            // A piece fades with its older end; a click without a move is a dot.
            const from = stroke[index - 1] ?? point
            const opacity = laserOpacity(from, now)
            if (opacity === 0) return []
            const start = editor.toCanvasPoint(from)
            const end = editor.toCanvasPoint(point)
            return (
              <line
                key={`${strokeIndex}:${index}`}
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                strokeOpacity={opacity}
              />
            )
          }),
        )
        return segments.length > 0 ? (
          <g
            key={shown.key}
            data-testid="laser-trail"
            data-participant={shown.name}
            stroke={shown.color}
            strokeWidth={TRAIL_WIDTH}
            strokeLinecap="round"
          >
            {segments}
          </g>
        ) : null
      })}
    </svg>
  )
}

/** The trail the participant draws with the laser pointer of the editor, on the local clock. */
function useOwnTrail(editor: DiagramEditor): LaserTrail {
  const [trail, setTrail] = useState<LaserTrail>([])
  useEffect(() => {
    let drawing = false
    const off = editor.onLaser((point) => {
      if (point === null) {
        drawing = false
        return
      }
      const newStroke = !drawing
      drawing = true
      const time = performance.now()
      setTrail((current) => addLaserPoint(current, point, time, newStroke))
    })
    return () => {
      off()
      setTrail([])
    }
  }, [editor])
  return trail
}

/**
 * The trails other participants publish, with their points on the local clock: the time a trail arrived minus the ages
 * of its points. Re-renders when a trail changes, not when other fields of a participant do.
 */
function useRemoteTrails(awareness: Awareness | null): RemoteTrail[] {
  const snapshot = useRef<RemoteTrail[]>([])
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!awareness) return () => {}
      let received = new Map<number, { at: number; time: number }>()
      const update = () => {
        const now = performance.now()
        const next = new Map<number, { at: number; time: number }>()
        const trails = readRemotePresence(awareness).flatMap(({ clientId, name, color, page, laser }) => {
          if (!laser) return []
          const seen = received.get(clientId)
          const time = seen?.at === laser.at ? seen.time : now
          next.set(clientId, { at: laser.at, time })
          return [{ key: String(clientId), name, color, page, at: laser.at, trail: placeLaser(laser, time) }]
        })
        received = next
        const changed =
          trails.length !== snapshot.current.length ||
          trails.some((trail, index) => {
            const previous = snapshot.current[index]!
            return trail.key !== previous.key || trail.at !== previous.at || trail.page !== previous.page
          })
        if (!changed) return
        snapshot.current = trails
        onChange()
      }
      update()
      awareness.on('change', update)
      return () => awareness.off('change', update)
    },
    [awareness],
  )
  return useSyncExternalStore(subscribe, () => (awareness ? snapshot.current : NO_TRAILS))
}

const NO_TRAILS: RemoteTrail[] = []
