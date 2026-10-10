import {
  eventUtils,
  InternalEvent,
  InternalMouseEvent,
  type Cell,
  type ConnectionHandler,
  type EventObject,
  type Graph,
  type PanningHandler,
  type RubberBandHandler,
  type SelectionCellsHandler,
  type SelectionHandler,
} from '@maxgraph/core'
import type { Point } from './editor.ts'

/** How much a double tap brings the canvas closer. */
export const DOUBLE_TAP_ZOOM = 1.5

/** How far a finger on the empty canvas moves, in pixels of the screen, before it pans: less is a tap or a long press. */
export const PAN_THRESHOLD = 6

/** A native double click this soon after a double tap that maxGraph recognized itself is the same double tap. */
const DOUBLE_TAP_REPEAT_MS = 400

/** Events of fingers that maxGraph listens to: pointer events, or touch events where it takes no pointer events (iOS). */
const FINGER_EVENTS = ['pointermove', 'pointerup', 'pointercancel', 'touchstart', 'touchmove', 'touchend', 'touchcancel'] as const

export interface TouchOptions {
  /** A point of the screen in diagram coordinates. */
  toDiagramPoint(clientX: number, clientY: number): Point
  /** Moves what the canvas shows by `dx`, `dy` pixels of the screen, beyond what it may scroll to. */
  panBy(dx: number, dy: number): void
  /**
   * Zooms to `scale`, kept between the limits of the editor, so that the diagram point `point` comes under the point of
   * the screen `clientX`, `clientY`.
   */
  zoomAt(scale: number, point: Point, clientX: number, clientY: number): void
  /** A finger held on the canvas: `cell` is the element under it, `null` on the empty canvas. */
  onLongPress(cell: Cell | null, clientX: number, clientY: number): void
  /** Fingers may pan and zoom the canvas now; a tool that draws with a finger keeps them. */
  canGesture(): boolean
}

/** Where the fingers of a pinch started, and what they held between them. */
interface Pinch {
  distance: number
  scale: number
  /** The diagram point between the fingers when the pinch started, which stays between them. */
  point: Point
}

/**
 * Fingers on the canvas. maxGraph selects with a tap, moves a shape under a finger and recognizes a double tap and a
 * finger held still (`TAP_AND_HOLD`); on its own it draws a selection frame with a finger on the empty canvas, pans only
 * as far as the canvas scrolls, zooms only with the gestures of Safari and connects from a shape held still. Here a
 * finger on the empty canvas pans it freely, two fingers zoom it around the point between them, a finger held still
 * opens the menu, and a double tap where it would edit nothing zooms in. Only fingers take these ways: the mouse, a pen
 * and the keyboard work as before. Returns what undoes it.
 */
export function configureTouch(graph: Graph, container: HTMLElement, options: TouchOptions): () => void {
  // The fingers on the canvas by pointer id, where they are now. Pointer events come before touch events.
  const fingers = new Map<number, { x: number; y: number }>()
  /** The finger on the empty canvas that may pan it, from where it was pressed. */
  let panFinger: { id: number; x: number; y: number; panning: boolean } | null = null
  let pinch: Pinch | null = null
  /** The fingers took the gesture from maxGraph: nothing of theirs reaches it until the last one is lifted. */
  let taken = false
  let frame = 0
  /** A finger held still opened the menu: its release clicks nothing, which would take the focus and close the menu. */
  let held = false
  // The last pointer pressed on the canvas: a native double click after touches comes from a double tap.
  let lastPointer = ''
  let lastDoubleTap = 0
  // What moves the canvas, applied once a frame.
  let pendingPan = { dx: 0, dy: 0 }

  const panning = graph.getPlugin<PanningHandler>('PanningHandler')
  if (panning) {
    // Two fingers zoom here; on iOS maxGraph would zoom once more on the gestures of Safari.
    panning.setPinchEnabled(false)
    const isPanningTrigger = panning.isPanningTrigger.bind(panning)
    // The panning handler comes before the selection frame and takes the press: no frame is drawn. The canvas pans here,
    // not in maxGraph, which gets no move of the finger.
    panning.isPanningTrigger = (me) => {
      if (!isTouch(me.getEvent()) || me.getState()) return isPanningTrigger(me)
      const [finger] = [...fingers.entries()]
      if (fingers.size === 1 && finger && options.canGesture()) {
        panFinger = { id: finger[0], x: finger[1].x, y: finger[1].y, panning: false }
      }
      return true
    }
  }

  /**
   * Ends what maxGraph began with the first finger, a panning, a move or a frame, without changing the board, and closes
   * its press with a release that clicks nothing: the next touch is a press of its own.
   */
  const take = (event: Event) => {
    if (taken) return
    taken = true
    panning?.reset()
    graph.getPlugin<SelectionHandler>('SelectionHandler')?.reset()
    graph.getPlugin<SelectionCellsHandler>('SelectionCellsHandler')?.reset()
    graph.getPlugin<RubberBandHandler>('RubberBandHandler')?.reset()
    graph.getPlugin<ConnectionHandler>('ConnectionHandler')?.reset()
    graph.tapAndHoldValid = false
    const release = new InternalMouseEvent(event as MouseEvent)
    release.consume()
    graph.fireMouseEvent(InternalEvent.MOUSE_UP, release)
  }

  const spread = () => {
    const [a, b] = [...fingers.values()]
    return { distance: Math.hypot(b!.x - a!.x, b!.y - a!.y), x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 }
  }
  const applyFrame = () => {
    frame = 0
    if (pinch && fingers.size >= 2) {
      const { distance, x, y } = spread()
      options.zoomAt((pinch.scale * distance) / Math.max(pinch.distance, 1), pinch.point, x, y)
    } else if (pendingPan.dx !== 0 || pendingPan.dy !== 0) {
      options.panBy(pendingPan.dx, pendingPan.dy)
    }
    pendingPan = { dx: 0, dy: 0 }
  }
  const requestFrame = () => {
    if (!frame) frame = requestAnimationFrame(applyFrame)
  }

  const press = (event: PointerEvent) => {
    lastPointer = event.pointerType
    if (event.pointerType !== 'touch') return
    fingers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (!pinch && fingers.size === 2 && options.canGesture()) {
      take(event)
      panFinger = null
      const { distance, x, y } = spread()
      pinch = { distance, scale: graph.getView().scale, point: options.toDiagramPoint(x, y) }
    }
    // The second finger and any after it never reach maxGraph.
    if (taken) event.stopImmediatePropagation()
  }
  // On the window and captured: maxGraph follows a gesture on the document.
  const follow = (event: Event) => {
    if (event instanceof PointerEvent) {
      const finger = fingers.get(event.pointerId)
      if (!finger) return
      if (event.type === 'pointermove') {
        const { x, y } = finger
        finger.x = event.clientX
        finger.y = event.clientY
        if (panFinger?.id === event.pointerId) {
          if (!panFinger.panning && Math.hypot(event.clientX - panFinger.x, event.clientY - panFinger.y) > PAN_THRESHOLD) {
            take(event)
            panFinger.panning = true
            pendingPan = { dx: event.clientX - panFinger.x, dy: event.clientY - panFinger.y }
          } else if (panFinger.panning) {
            pendingPan = { dx: pendingPan.dx + event.clientX - x, dy: pendingPan.dy + event.clientY - y }
          }
          if (panFinger.panning) requestFrame()
          // Short of panning the finger may still be a tap or a long press, which maxGraph tells by the press alone.
          event.stopImmediatePropagation()
          return
        }
        if (pinch) requestFrame()
      } else {
        fingers.delete(event.pointerId)
        if (panFinger?.id === event.pointerId) panFinger = null
        // The pinch lasts until the last finger is lifted: the one that stays does not pan.
        if (fingers.size === 0) pinch = null
        if (taken) {
          event.stopImmediatePropagation()
          if (fingers.size === 0) taken = false
          return
        }
      }
    }
    if (event.type === 'touchend' && held) {
      event.preventDefault()
      if ((event as TouchEvent).touches.length === 0) held = false
    }
    // Where maxGraph takes touch events, the finger that may pan moves the canvas here alone too.
    if (taken || (panFinger && event.type.startsWith('touch') && event.type !== 'touchstart')) event.stopImmediatePropagation()
  }

  const handleTapAndHold = (_sender: unknown, event: EventObject) => {
    const hold = event.getProperty('event') as MouseEvent
    if (!isTouch(hold) || graph.isEditing() || taken) return
    // maxGraph would start a connection from the shape and ends the panning that the press started.
    event.consume()
    panFinger = null
    held = true
    options.onLongPress((event.getProperty('cell') as Cell | null) ?? null, eventUtils.getClientX(hold), eventUtils.getClientY(hold))
  }
  graph.addListener(InternalEvent.TAP_AND_HOLD, handleTapAndHold)

  const handleDoubleClick = (_sender: unknown, event: EventObject) => {
    const click = event.getProperty('event') as MouseEvent
    const touch = isTouch(click) || (click.type === 'dblclick' && lastPointer === 'touch')
    if (!touch || event.isConsumed()) return
    const cell = event.getProperty('cell') as Cell | null
    // A double tap on a label that may be edited edits it, as a double click does.
    if (cell && graph.isEnabled() && graph.isCellEditable(cell)) return
    event.consume()
    const now = performance.now()
    if (now - lastDoubleTap < DOUBLE_TAP_REPEAT_MS) return
    lastDoubleTap = now
    const [clientX, clientY] = [eventUtils.getClientX(click), eventUtils.getClientY(click)]
    options.zoomAt(graph.getView().scale * DOUBLE_TAP_ZOOM, options.toDiagramPoint(clientX, clientY), clientX, clientY)
  }
  graph.addListener(InternalEvent.DOUBLE_CLICK, handleDoubleClick)

  container.addEventListener('pointerdown', press, true)
  // Passive but for the release, which may cancel its click: the page keeps scrolling without waiting for the listener.
  for (const type of FINGER_EVENTS) window.addEventListener(type, follow, { capture: true, passive: type !== 'touchend' })

  return () => {
    if (frame) cancelAnimationFrame(frame)
    graph.removeListener(handleTapAndHold)
    graph.removeListener(handleDoubleClick)
    container.removeEventListener('pointerdown', press, true)
    for (const type of FINGER_EVENTS) window.removeEventListener(type, follow, true)
  }
}

/** The event comes from a finger: a touch pointer, or a touch event where maxGraph takes no pointer events. */
function isTouch(event: Event | null | undefined): boolean {
  if (!event) return false
  return 'pointerType' in event && typeof event.pointerType === 'string' && event.pointerType !== ''
    ? event.pointerType === 'touch'
    : event.type.startsWith('touch')
}
