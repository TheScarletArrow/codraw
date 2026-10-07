import {
  ActorShape,
  CylinderShape,
  EdgeMarkerRegistry,
  RectangleShape,
  Shape,
  ShapeRegistry,
  StyleDefaultsConfig,
  type AbstractCanvas2D,
  type MarkerFactoryFunction,
  type ShapeConstructor,
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

/** draw.io `process`: a box with a bar along each side, here an API gateway. */
class ProcessShape extends Shape {
  override paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const bar = Math.min(w * 0.1, 20)
    c.rect(x, y, w, h)
    c.fillAndStroke()
    c.begin()
    c.moveTo(x + bar, y)
    c.lineTo(x + bar, y + h)
    c.moveTo(x + w - bar, y)
    c.lineTo(x + w - bar, y + h)
    c.stroke()
  }
}

/** draw.io `cube`: a box seen from the front, top and right. */
class CubeShape extends Shape {
  override paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const depth = Math.min(20, w / 3, h / 3)
    c.begin()
    c.moveTo(x, y + depth)
    c.lineTo(x + depth, y)
    c.lineTo(x + w, y)
    c.lineTo(x + w, y + h - depth)
    c.lineTo(x + w - depth, y + h)
    c.lineTo(x, y + h)
    c.close()
    c.fillAndStroke()
    c.begin()
    c.moveTo(x, y + depth)
    c.lineTo(x + w - depth, y + depth)
    c.lineTo(x + w, y)
    c.moveTo(x + w - depth, y + depth)
    c.lineTo(x + w - depth, y + h)
    c.stroke()
  }
}

/** draw.io `card`: a card with a cut top-left corner. */
class CardShape extends ActorShape {
  override redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number) {
    const cut = Math.min(15, w / 4, h / 4)
    c.moveTo(cut, 0)
    c.lineTo(w, 0)
    c.lineTo(w, h)
    c.lineTo(0, h)
    c.lineTo(0, cut)
    c.close()
  }
}

/** draw.io `internalStorage`: a box with a line along its top and its left side. */
class InternalStorageShape extends Shape {
  override paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const inset = Math.min(10, w / 5, h / 5)
    c.rect(x, y, w, h)
    c.fillAndStroke()
    c.begin()
    c.moveTo(x + inset, y)
    c.lineTo(x + inset, y + h)
    c.moveTo(x, y + inset)
    c.lineTo(x + w, y + inset)
    c.stroke()
  }
}

/** draw.io `datastore`: a cylinder of stacked disks. */
class DatastoreShape extends Shape {
  override paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const rim = Math.min(h / 8, 10)
    c.begin()
    c.moveTo(x, y + rim)
    c.curveTo(x, y - rim / 3, x + w, y - rim / 3, x + w, y + rim)
    c.lineTo(x + w, y + h - rim)
    c.curveTo(x + w, y + h + rim / 3, x, y + h + rim / 3, x, y + h - rim)
    c.close()
    c.fillAndStroke()
    c.begin()
    for (let disk = 0; disk < 3; disk++) {
      const top = y + rim + disk * rim
      c.moveTo(x, top)
      c.curveTo(x, top + (rim * 4) / 3, x + w, top + (rim * 4) / 3, x + w, top)
    }
    c.stroke()
  }
}

/** draw.io `parallelogram`. */
class ParallelogramShape extends ActorShape {
  override redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number) {
    const slant = Math.min(20, w / 4)
    c.moveTo(slant, 0)
    c.lineTo(w, 0)
    c.lineTo(w - slant, h)
    c.lineTo(0, h)
    c.close()
  }
}

/** draw.io `component`: a UML component, a box with two small boxes on its left side. */
class ComponentShape extends Shape {
  override paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const jettyWidth = Math.min(20, w / 4)
    const jettyHeight = Math.min(10, h / 5)
    c.rect(x + jettyWidth / 2, y, w - jettyWidth / 2, h)
    c.fillAndStroke()
    for (const at of [0.3, 0.7]) {
      c.rect(x, y + h * at - jettyHeight / 2, jettyWidth, jettyHeight)
      c.fillAndStroke()
    }
  }
}

/** draw.io `folder`: a UML package, a folder with a tab. */
class FolderShape extends Shape {
  override paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const tabWidth = Math.min(50, w / 2)
    const tabHeight = Math.min(20, h / 4)
    c.begin()
    c.moveTo(x, y)
    c.lineTo(x + tabWidth, y)
    c.lineTo(x + tabWidth, y + tabHeight)
    c.lineTo(x + w, y + tabHeight)
    c.lineTo(x + w, y + h)
    c.lineTo(x, y + h)
    c.close()
    c.fillAndStroke()
    c.begin()
    c.moveTo(x, y + tabHeight)
    c.lineTo(x + tabWidth, y + tabHeight)
    c.stroke()
  }
}

/** draw.io `note`: a sheet with a folded top-right corner. */
class NoteShape extends Shape {
  override paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const fold = Math.min(20, w / 4, h / 4)
    c.begin()
    c.moveTo(x, y)
    c.lineTo(x + w - fold, y)
    c.lineTo(x + w, y + fold)
    c.lineTo(x + w, y + h)
    c.lineTo(x, y + h)
    c.close()
    c.fillAndStroke()
    c.begin()
    c.moveTo(x + w - fold, y)
    c.lineTo(x + w - fold, y + fold)
    c.lineTo(x + w, y + fold)
    c.stroke()
  }
}

/** A dot in the line color, e.g. a status light. */
function dot(c: AbstractCanvas2D, shape: Shape, cx: number, cy: number, r: number) {
  c.save()
  c.setFillColor(shape.stroke ?? null)
  c.ellipse(cx - r, cy - r, 2 * r, 2 * r)
  c.fill()
  c.restore()
}

/** `codraw.server`: a rack of three units with status lights. */
class ServerShape extends Shape {
  override paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const unit = h / 3
    for (let i = 0; i < 3; i++) {
      const top = y + i * unit
      c.roundrect(x, top + 1, w, unit - 2, 3, 3)
      c.fillAndStroke()
      c.begin()
      c.moveTo(x + w * 0.15, top + unit / 2)
      c.lineTo(x + w * 0.55, top + unit / 2)
      c.stroke()
      dot(c, this, x + w * 0.8, top + unit / 2, Math.min(2.5, unit / 6))
    }
  }
}

/** `codraw.firewall`: a brick wall. */
class FirewallShape extends Shape {
  override paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const rows = 4
    const row = h / rows
    c.rect(x, y, w, h)
    c.fillAndStroke()
    c.begin()
    for (let i = 0; i < rows; i++) {
      const top = y + i * row
      if (i > 0) {
        c.moveTo(x, top)
        c.lineTo(x + w, top)
      }
      for (const at of i % 2 === 0 ? [0.5] : [0.25, 0.75]) {
        c.moveTo(x + w * at, top)
        c.lineTo(x + w * at, top + row)
      }
    }
    c.stroke()
  }
}

/** `codraw.bucket`: a bucket, as object storage is usually drawn. */
class BucketShape extends Shape {
  override paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const rim = h * 0.12
    c.begin()
    c.moveTo(x, y + rim)
    c.curveTo(x, y - rim / 3, x + w, y - rim / 3, x + w, y + rim)
    c.lineTo(x + w * 0.85, y + h - rim * 0.6)
    c.curveTo(x + w * 0.85, y + h + rim * 0.2, x + w * 0.15, y + h + rim * 0.2, x + w * 0.15, y + h - rim * 0.6)
    c.close()
    c.fillAndStroke()
    c.begin()
    c.moveTo(x, y + rim)
    c.curveTo(x, y + (rim * 7) / 3, x + w, y + (rim * 7) / 3, x + w, y + rim)
    c.stroke()
  }
}

/** `codraw.topic`: a log of segments that events are appended to. */
class TopicShape extends Shape {
  override paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const segments = Math.max(3, Math.floor(w / 24))
    c.rect(x, y, w, h)
    c.fillAndStroke()
    c.begin()
    for (let i = 1; i < segments; i++) {
      c.moveTo(x + (w * i) / segments, y)
      c.lineTo(x + (w * i) / segments, y + h)
    }
    c.stroke()
  }
}

/** `codraw.clock`: a clock face, here a job scheduler. */
class ClockShape extends Shape {
  override paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const cx = x + w / 2
    const cy = y + h / 2
    const r = Math.min(w, h) / 2
    c.ellipse(x, y, w, h)
    c.fillAndStroke()
    c.begin()
    c.moveTo(cx, cy)
    c.lineTo(cx, cy - r * 0.6)
    c.moveTo(cx, cy)
    c.lineTo(cx + r * 0.45, cy)
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
      c.moveTo(cx + dx * r * 0.8, cy + dy * r * 0.8)
      c.lineTo(cx + dx * r, cy + dy * r)
    }
    c.stroke()
  }
}

/** Height of the title bar of `codraw.browser`; its caption sits below the bar. */
export const BROWSER_BAR_HEIGHT = 16

/** `codraw.browser`: a browser window with dots and an address field in its title bar. */
class BrowserShape extends Shape {
  override paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const bar = Math.min(BROWSER_BAR_HEIGHT, h / 3)
    c.roundrect(x, y, w, h, 4, 4)
    c.fillAndStroke()
    c.begin()
    c.moveTo(x, y + bar)
    c.lineTo(x + w, y + bar)
    c.stroke()
    for (let i = 0; i < 3; i++) dot(c, this, x + 7 + i * 6, y + bar / 2, Math.min(2, bar / 6))
    c.roundrect(x + 30, y + bar * 0.2, Math.max(0, w - 36), bar * 0.6, 2, 2)
    c.stroke()
  }
}

/** `codraw.mobile`: a phone with a screen and a home button. */
class MobileShape extends Shape {
  override paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const corner = w * 0.15
    c.roundrect(x, y, w, h, corner, corner)
    c.fillAndStroke()
    c.rect(x + w * 0.1, y + h * 0.1, w * 0.8, h * 0.72)
    c.stroke()
    const r = Math.min(w, h) * 0.06
    c.ellipse(x + w / 2 - r, y + h * 0.91 - r, 2 * r, 2 * r)
    c.stroke()
  }
}

/** `codraw.desktop`: a monitor on a stand. */
class DesktopShape extends Shape {
  override paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const screen = h * 0.75
    c.roundrect(x, y, w, screen, 3, 3)
    c.fillAndStroke()
    c.rect(x + 4, y + 4, w - 8, screen - 8)
    c.stroke()
    c.rect(x + w * 0.45, y + screen, w * 0.1, h * 0.15)
    c.fillAndStroke()
    c.rect(x + w * 0.3, y + h * 0.9, w * 0.4, h * 0.1)
    c.fillAndStroke()
  }
}

/** `codraw.chip`: a microchip with pins, here an IoT device. */
class ChipShape extends Shape {
  override paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const pin = Math.min(w, h) * 0.15
    const bw = w - 2 * pin
    const bh = h - 2 * pin
    c.begin()
    for (const at of [0.25, 0.5, 0.75]) {
      c.moveTo(x + pin + bw * at, y)
      c.lineTo(x + pin + bw * at, y + h)
      c.moveTo(x, y + pin + bh * at)
      c.lineTo(x + w, y + pin + bh * at)
    }
    c.stroke()
    c.rect(x + pin, y + pin, bw, bh)
    c.fillAndStroke()
    c.rect(x + pin + bw * 0.3, y + pin + bh * 0.3, bw * 0.4, bh * 0.4)
    c.stroke()
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

/** Shapes for system design: draw.io names where draw.io has such a shape, `codraw.*` for the others. */
export const SYSTEM_DESIGN_SHAPES = {
  process: ProcessShape,
  cube: CubeShape,
  card: CardShape,
  internalStorage: InternalStorageShape,
  datastore: DatastoreShape,
  parallelogram: ParallelogramShape,
  component: ComponentShape,
  folder: FolderShape,
  note: NoteShape,
  'codraw.server': ServerShape,
  'codraw.firewall': FirewallShape,
  'codraw.bucket': BucketShape,
  'codraw.topic': TopicShape,
  'codraw.clock': ClockShape,
  'codraw.browser': BrowserShape,
  'codraw.mobile': MobileShape,
  'codraw.desktop': DesktopShape,
  'codraw.chip': ChipShape,
} satisfies Record<string, ShapeConstructor>

/** Shadows of shapes with `shadow=1` as draw.io draws them: black, a quarter opaque, instead of opaque grey. */
const SHADOW_COLOR = '#000000'
const SHADOW_OPACITY = 0.25

/**
 * Adds shapes and edge markers of draw.io that maxGraph does not have, and draws shadows as draw.io does. Safe to call
 * more than once.
 */
export function registerDiagramExtensions() {
  StyleDefaultsConfig.shadowColor = SHADOW_COLOR
  StyleDefaultsConfig.shadowOpacity = SHADOW_OPACITY
  ShapeRegistry.add('rectangle', ClickThroughRectangleShape)
  ShapeRegistry.add('document', DocumentShape)
  ShapeRegistry.add('mxgraph.c4.person2', C4PersonShape)
  // The cylinder of the draw.io palette.
  ShapeRegistry.add('cylinder3', CylinderShape)
  for (const [name, shape] of Object.entries(SYSTEM_DESIGN_SHAPES)) ShapeRegistry.add(name, shape)
  for (const [name, parts] of Object.entries(CROWS_FEET)) {
    EdgeMarkerRegistry.add(name, crowsFoot(parts))
  }
}
