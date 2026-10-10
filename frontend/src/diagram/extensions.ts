import {
  ActorShape,
  CylinderShape,
  EdgeMarkerRegistry,
  ImageShape,
  PerimeterRegistry,
  Point,
  Rectangle,
  RectangleShape,
  Shape,
  ShapeRegistry,
  StyleDefaultsConfig,
  SvgCanvas2D,
  type AbstractCanvas2D,
  type MarkerFactoryFunction,
  type PerimeterFunction,
  type ShapeConstructor,
} from '@maxgraph/core'
import { IMAGE_PLACEHOLDER } from './images.ts'
import { BROWSER_BAR_HEIGHT } from './shapes.ts'

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

const XLINK_NS = 'http://www.w3.org/1999/xlink'

/** Attribute of a picture shown as a placeholder: the address that did not load, which the browser tries again online. */
export const PLACEHOLDER_SOURCE = 'data-codraw-src'

/** Shows the placeholder in place of a picture that did not load, keeping its address to try again. */
function showPlaceholder(image: Element) {
  if (image.hasAttribute(PLACEHOLDER_SOURCE)) return
  image.setAttribute(PLACEHOLDER_SOURCE, image.getAttributeNS(XLINK_NS, 'href') ?? image.getAttribute('href') ?? '')
  image.setAttribute(PLACEHOLDER_ASPECT, image.getAttribute('preserveAspectRatio') ?? '')
  image.setAttributeNS(XLINK_NS, 'xlink:href', IMAGE_PLACEHOLDER)
  // Not stretched like the picture: the frame keeps its shape in the middle of the image shape.
  image.setAttribute('preserveAspectRatio', 'xMidYMid meet')
}

/** Attribute of a picture shown as a placeholder: how the picture fitted the shape. */
const PLACEHOLDER_ASPECT = 'data-codraw-aspect'

/** Shows the placeholder once the picture fails to load. */
function watchPicture(image: Element) {
  image.addEventListener('error', () => showPlaceholder(image), { once: true })
}

/** Gives the pictures shown as placeholders their addresses back, so that the browser loads them again. */
export function retryPictures(page: Document) {
  for (const image of Array.from(page.querySelectorAll(`image[${PLACEHOLDER_SOURCE}]`))) {
    const source = image.getAttribute(PLACEHOLDER_SOURCE) ?? ''
    const aspect = image.getAttribute(PLACEHOLDER_ASPECT)
    image.removeAttribute(PLACEHOLDER_SOURCE)
    image.removeAttribute(PLACEHOLDER_ASPECT)
    if (aspect) image.setAttribute('preserveAspectRatio', aspect)
    else image.removeAttribute('preserveAspectRatio')
    watchPicture(image)
    image.setAttributeNS(XLINK_NS, 'xlink:href', source)
  }
}

let retryingOnline = false

/**
 * The image shape of draw.io, whose picture the browser may fail to load: without a connection, when the browser has
 * not kept it; at another site, which the Content Security Policy does not let in; on a board without access. It then
 * shows {@link IMAGE_PLACEHOLDER}, and tries again once the browser is online.
 */
class PictureShape extends ImageShape {
  override paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    super.paintVertexShape(c, x, y, w, h)
    // Only the picture on the canvas: an image of the page that is being saved has no loading to wait for.
    if (!(c instanceof SvgCanvas2D) || c.root !== this.node || !this.node) return
    const pictures = this.node.getElementsByTagName('image')
    const picture = pictures[pictures.length - 1]
    if (!picture) return
    watchPicture(picture)
    if (!retryingOnline) {
      retryingOnline = true
      const page = this.node.ownerDocument
      page.defaultView?.addEventListener('online', () => retryPictures(page))
    }
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

/** `codraw.triangle`: an upright triangle. */
class TriangleShape extends ActorShape {
  override redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number) {
    c.moveTo(w / 2, 0)
    c.lineTo(w, h)
    c.lineTo(0, h)
    c.close()
  }
}

/** `codraw.pentagon`: a regular-looking pentagon. */
class PentagonShape extends ActorShape {
  override redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number) {
    c.moveTo(w / 2, 0)
    c.lineTo(w, h * 0.38)
    c.lineTo(w * 0.82, h)
    c.lineTo(w * 0.18, h)
    c.lineTo(0, h * 0.38)
    c.close()
  }
}

/** `codraw.star`: a five-point star. */
class StarShape extends Shape {
  override paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const cx = x + w / 2
    const cy = y + h / 2
    const outer = Math.min(w, h) / 2
    const inner = outer * 0.42
    c.begin()
    for (let point = 0; point < 10; point++) {
      const radius = point % 2 === 0 ? outer : inner
      const angle = -Math.PI / 2 + (point * Math.PI) / 5
      const px = cx + Math.cos(angle) * radius
      const py = cy + Math.sin(angle) * radius
      if (point === 0) c.moveTo(px, py)
      else c.lineTo(px, py)
    }
    c.close()
    c.fillAndStroke()
  }
}

function wholeNumber(value: unknown, fallback: number): number {
  const number = Number(value)
  return Number.isFinite(number) && number >= 1 ? Math.round(number) : fallback
}

function styleValue(style: unknown, key: string): unknown {
  return style && typeof style === 'object' ? (style as Record<string, unknown>)[key] : undefined
}

/** `codraw.gridTable`: a simple rows-and-columns table. */
class GridTableShape extends Shape {
  override paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const rows = wholeNumber(styleValue(this.style, 'gridRows'), 4)
    const columns = wholeNumber(styleValue(this.style, 'gridColumns'), 3)
    c.rect(x, y, w, h)
    c.fillAndStroke()
    c.begin()
    for (let row = 1; row < rows; row++) {
      const py = y + (h * row) / rows
      c.moveTo(x, py)
      c.lineTo(x + w, py)
    }
    for (let column = 1; column < columns; column++) {
      const px = x + (w * column) / columns
      c.moveTo(px, y)
      c.lineTo(px, y + h)
    }
    c.stroke()
  }
}

/** `codraw.predefinedProcess`: a flowchart subprocess with side bars. */
class PredefinedProcessShape extends Shape {
  override paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const bar = Math.min(18, w / 6)
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

/** `codraw.bpmnEvent`: a BPMN event with a double border. */
class BpmnEventShape extends Shape {
  override paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const inset = Math.min(w, h) * 0.12
    c.ellipse(x, y, w, h)
    c.fillAndStroke()
    c.ellipse(x + inset, y + inset, Math.max(0, w - 2 * inset), Math.max(0, h - 2 * inset))
    c.stroke()
  }
}

/** `codraw.bpmnGateway`: a BPMN exclusive gateway. */
class BpmnGatewayShape extends Shape {
  override paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    c.begin()
    c.moveTo(x + w / 2, y)
    c.lineTo(x + w, y + h / 2)
    c.lineTo(x + w / 2, y + h)
    c.lineTo(x, y + h / 2)
    c.close()
    c.fillAndStroke()
    const insetX = w * 0.32
    const insetY = h * 0.32
    c.begin()
    c.moveTo(x + insetX, y + insetY)
    c.lineTo(x + w - insetX, y + h - insetY)
    c.moveTo(x + w - insetX, y + insetY)
    c.lineTo(x + insetX, y + h - insetY)
    c.stroke()
  }
}

/** `codraw.bpmnPool`: a BPMN pool with horizontal lanes. */
class BpmnPoolShape extends Shape {
  override paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    if (this.style?.pointerEvents === false && (!this.fill || this.fill === 'none')) {
      c.pointerEvents = false
    }
    const title = Math.min(44, Math.max(24, w * 0.14))
    const lanes = wholeNumber(styleValue(this.style, 'lanes'), 3)
    c.rect(x, y, w, h)
    c.fillAndStroke()
    c.begin()
    c.moveTo(x + title, y)
    c.lineTo(x + title, y + h)
    for (let lane = 1; lane < lanes; lane++) {
      const py = y + (h * lane) / lanes
      c.moveTo(x + title, py)
      c.lineTo(x + w, py)
    }
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

/** The height of the header of a lifeline of draw.io without `size`, and the tab of a frame without `width` and `height`. */
const LIFELINE_SIZE = 40
const FRAME_TAB = { width: 60, height: 30, corner: 10 }

/** A number of a style, or `fallback` for none or something that is not a positive number. */
function positive(style: unknown, key: string, fallback: number): number {
  const value = Number(styleValue(style, key))
  return Number.isFinite(value) && value > 0 ? value : fallback
}

/**
 * draw.io `umlLifeline`: a header `size` high — the shape named by `participant`, e.g. `umlActor`, or a box — and a
 * dashed line down its middle, as draw.io draws the lifelines of its sequence diagrams. The label is in the header.
 */
class LifelineShape extends Shape {
  override paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const size = Math.min(h, positive(this.style, 'size', LIFELINE_SIZE))
    const participant = styleValue(this.style, 'participant')
    const Header = typeof participant === 'string' ? ShapeRegistry.get(participant) : undefined
    if (Header && Header !== LifelineShape && this.state) {
      const header = new Header()
      header.apply(this.state)
      c.save()
      header.paintVertexShape(c, x, y, w, size)
      c.restore()
    } else {
      if (this.isRounded) c.roundrect(x, y, w, size, 8, 8)
      else c.rect(x, y, w, size)
      c.fillAndStroke()
    }
    if (size >= h) return
    c.setShadow(false)
    c.setDashed(String(styleValue(this.style, 'lifelineDashed') ?? '1') !== '0', true)
    c.begin()
    c.moveTo(x + w / 2, y + size)
    c.lineTo(x + w / 2, y + h)
    c.stroke()
  }

  override getLabelBounds(rect: Rectangle) {
    return new Rectangle(rect.x, rect.y, rect.width, Math.min(rect.height, positive(this.style, 'size', LIFELINE_SIZE) * this.scale))
  }
}

/** draw.io `umlFrame`: a frame with its label in a tab at the top-left corner, `width` by `height`. */
class UmlFrameShape extends Shape {
  override paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const { corner } = FRAME_TAB
    const tabWidth = Math.min(w, Math.max(corner, positive(this.style, 'width', FRAME_TAB.width)))
    const tabHeight = Math.min(h, Math.max(corner * 1.5, positive(this.style, 'height', FRAME_TAB.height)))
    // Clicks inside a frame with `pointerEvents=0` reach what it frames; its border and its tab still select it.
    const through = styleValue(this.style, 'pointerEvents') === false
    c.begin()
    c.moveTo(x, y)
    c.lineTo(x + tabWidth, y)
    c.lineTo(x + tabWidth, y + Math.max(0, tabHeight - corner * 1.5))
    c.lineTo(x + Math.max(0, tabWidth - corner), y + tabHeight)
    c.lineTo(x, y + tabHeight)
    c.close()
    c.fillAndStroke()
    if (through) c.pointerEvents = false
    c.begin()
    c.moveTo(x + tabWidth, y)
    c.lineTo(x + w, y)
    c.lineTo(x + w, y + h)
    c.lineTo(x, y + h)
    c.lineTo(x, y + tabHeight)
    c.stroke()
  }

  override getLabelBounds(rect: Rectangle) {
    const width = Math.max(FRAME_TAB.corner, positive(this.style, 'width', FRAME_TAB.width)) * this.scale
    const height = Math.max(FRAME_TAB.corner * 1.5, positive(this.style, 'height', FRAME_TAB.height)) * this.scale
    return new Rectangle(rect.x, rect.y, Math.min(rect.width, width), Math.min(rect.height, height))
  }
}

/** draw.io `umlActor`: a stick figure. */
class UmlActorShape extends Shape {
  override paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    c.ellipse(x + w / 4, y, w / 2, h / 4)
    c.fillAndStroke()
    c.begin()
    c.moveTo(x + w / 2, y + h / 4)
    c.lineTo(x + w / 2, y + (2 * h) / 3)
    c.moveTo(x + w / 2, y + h / 3)
    c.lineTo(x, y + h / 3)
    c.moveTo(x + w / 2, y + h / 3)
    c.lineTo(x + w, y + h / 3)
    c.moveTo(x + w / 2, y + (2 * h) / 3)
    c.lineTo(x, y + h)
    c.moveTo(x + w / 2, y + (2 * h) / 3)
    c.lineTo(x + w, y + h)
    c.stroke()
  }
}

/**
 * draw.io `lifelinePerimeter`: an edge ends on the dashed line of a lifeline, at the height it comes from, below the
 * header.
 */
const lifelinePerimeter: PerimeterFunction = (bounds, vertex, next) => {
  const size = positive(vertex.style, 'size', LIFELINE_SIZE) * vertex.view.scale
  return new Point(bounds.getCenterX(), Math.min(bounds.y + bounds.height, Math.max(bounds.y + size, next.y)))
}

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

/** Shapes for the palette: draw.io names where draw.io has such a shape, `codraw.*` for the others. */
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
  'codraw.triangle': TriangleShape,
  'codraw.pentagon': PentagonShape,
  'codraw.star': StarShape,
  'codraw.gridTable': GridTableShape,
  'codraw.predefinedProcess': PredefinedProcessShape,
  'codraw.bpmnEvent': BpmnEventShape,
  'codraw.bpmnGateway': BpmnGatewayShape,
  'codraw.bpmnPool': BpmnPoolShape,
  'codraw.server': ServerShape,
  'codraw.firewall': FirewallShape,
  'codraw.bucket': BucketShape,
  'codraw.topic': TopicShape,
  'codraw.clock': ClockShape,
  'codraw.browser': BrowserShape,
  'codraw.mobile': MobileShape,
  'codraw.desktop': DesktopShape,
  'codraw.chip': ChipShape,
  umlLifeline: LifelineShape,
  umlFrame: UmlFrameShape,
  umlActor: UmlActorShape,
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
  ShapeRegistry.add('image', PictureShape)
  ShapeRegistry.add('document', DocumentShape)
  ShapeRegistry.add('mxgraph.c4.person2', C4PersonShape)
  // The cylinder of the draw.io palette.
  ShapeRegistry.add('cylinder3', CylinderShape)
  for (const [name, shape] of Object.entries(SYSTEM_DESIGN_SHAPES)) ShapeRegistry.add(name, shape)
  PerimeterRegistry.add('lifelinePerimeter', lifelinePerimeter)
  for (const [name, parts] of Object.entries(CROWS_FEET)) {
    EdgeMarkerRegistry.add(name, crowsFoot(parts))
  }
}
