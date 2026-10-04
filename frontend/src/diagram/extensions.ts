import {
  ActorShape,
  EdgeMarkerRegistry,
  RectangleShape,
  Shape,
  ShapeRegistry,
  type AbstractCanvas2D,
  type MarkerFactoryFunction,
} from '@maxgraph/core'

/**
 * A rectangle without fill and with `pointerEvents=0` lets clicks inside it reach the shapes under it, as in
 * draw.io: only its border selects it. maxGraph leaves `fill` empty for `fillColor=none`, so its own check for
 * `fill === 'none'` never matches and the whole area catches clicks.
 */
class ClickThroughRectangleShape extends RectangleShape {
  override paintBackground(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    if (this.style?.pointerEvents === false && (!this.fill || this.fill === 'none')) {
      c.pointerEvents = false
    }
    super.paintBackground(c, x, y, w, h)
  }
}

/** draw.io `document`: a sheet with a wavy bottom edge. */
class DocumentShape extends ActorShape {
  override redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number) {
    const wave = h * 0.15
    c.moveTo(0, 0)
    c.lineTo(w, 0)
    c.lineTo(w, h - wave / 2)
    c.quadTo((w * 3) / 4, h - wave * 1.4, w / 2, h - wave / 2)
    c.quadTo(w / 4, h + wave * 0.4, 0, h - wave / 2)
    c.close()
  }
}

/** draw.io `mxgraph.c4.person2`: a head over a rounded body that holds the caption. */
class C4PersonShape extends Shape {
  override paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const head = Math.min(w / 2, h * 0.45)
    const top = head * 0.8
    c.roundrect(x, y + top, w, h - top, head / 2, head / 2)
    c.fillAndStroke()
    c.ellipse(x + (w - head) / 2, y, head, head)
    c.fillAndStroke()
  }
}

/** Marker values for the ends of an edge, as draw.io names them. */
export const EDGE_MARKERS = [
  { value: 'classic', label: 'Стрелка' },
  { value: 'none', label: 'Без маркера' },
  { value: 'ERone', label: 'Один' },
  { value: 'ERmandOne', label: 'Обязательно один' },
  { value: 'ERmany', label: 'Много' },
  { value: 'ERoneToMany', label: 'Один или много' },
  { value: 'ERzeroToOne', label: 'Ноль или один' },
  { value: 'ERzeroToMany', label: 'Ноль или много' },
] as const

interface CrowsFoot {
  /** Distances of the bars («one») from the end of the edge, in marker units. */
  bars?: number[]
  /** Three prongs that meet one unit away from the end. */
  many?: boolean
  /** A circle one and a half units away from the end. */
  zero?: boolean
}

/**
 * A crow's foot marker. `pe` is the end of the edge and (unitX, unitY) points towards it; a marker unit is the
 * marker size plus the line width, as in draw.io.
 */
export const crowsFoot =
  ({ bars = [], many = false, zero = false }: CrowsFoot): MarkerFactoryFunction =>
  (c, _shape, _type, pe, unitX, unitY, size, _source, sw) => {
    const unit = size + sw + 1
    const end = { x: pe.x, y: pe.y }
    const at = (distance: number) => ({ x: end.x - unitX * unit * distance, y: end.y - unitY * unit * distance })
    // Half a unit across the edge.
    const ax = (-unitY * unit) / 2
    const ay = (unitX * unit) / 2
    const radius = unit / 2 - 1
    if (zero) {
      // The edge stops at the circle, so that it does not show through it.
      const stop = at(1.5 + radius / unit)
      pe.x = stop.x
      pe.y = stop.y
    }
    return () => {
      c.begin()
      for (const distance of bars) {
        const p = at(distance)
        c.moveTo(p.x + ax, p.y + ay)
        c.lineTo(p.x - ax, p.y - ay)
      }
      if (many) {
        const apex = at(1)
        c.moveTo(end.x + ax, end.y + ay)
        c.lineTo(apex.x, apex.y)
        c.lineTo(end.x - ax, end.y - ay)
      }
      if (zero) {
        // The part of the edge between the circle and the end.
        const near = at(1.5 - radius / unit)
        c.moveTo(end.x, end.y)
        c.lineTo(near.x, near.y)
      }
      c.stroke()
      if (zero) {
        const centre = at(1.5)
        c.ellipse(centre.x - radius, centre.y - radius, 2 * radius, 2 * radius)
        c.stroke()
      }
    }
  }

const CROWS_FEET: Record<string, CrowsFoot> = {
  ERone: { bars: [0.5] },
  ERmandOne: { bars: [0.5, 1] },
  ERmany: { many: true },
  ERoneToMany: { bars: [1], many: true },
  ERzeroToOne: { bars: [0.5], zero: true },
  ERzeroToMany: { many: true, zero: true },
}

/** Adds shapes and edge markers of draw.io that maxGraph does not have. Safe to call more than once. */
export function registerDiagramExtensions() {
  ShapeRegistry.add('rectangle', ClickThroughRectangleShape)
  ShapeRegistry.add('document', DocumentShape)
  ShapeRegistry.add('mxgraph.c4.person2', C4PersonShape)
  for (const [name, parts] of Object.entries(CROWS_FEET)) {
    EdgeMarkerRegistry.add(name, crowsFoot(parts))
  }
}
