const SVG_NS = 'http://www.w3.org/2000/svg'
const XLINK_NS = 'http://www.w3.org/1999/xlink'
const XML_NS = 'http://www.w3.org/XML/1998/namespace'
const XMLNS_NS = 'http://www.w3.org/2000/xmlns/'

/** Elements that run code, show other documents or change the picture over time. */
const FORBIDDEN = new Set(['script', 'foreignObject', 'set', 'animate', 'animateMotion', 'animateTransform', 'discard'])

const EMBEDDED_IMAGE = /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=\s]*$/i

/** A reference in a style to anything but an element of the picture, or a way to run code; `url('#a')` is fine. */
const UNSAFE_STYLE = /url\(\s*(?!['"]?\s*#)|expression\s*\(|@import|javascript:|behavior\s*:/i

/** Attributes whose value may be a reference to an element: `url(#id)` is all they may hold. */
const UNSAFE_REFERENCE = /url\(\s*(?!['"]?\s*#)/i

/** An SVG picture made safe to keep in a library, with its size when it tells one. */
export interface SvgIcon {
  /** The cleaned document, without DTD and processing instructions. */
  svg: string
  /** From `width` and `height`, or from `viewBox`; `null` when it tells neither. */
  width: number | null
  height: number | null
}

/**
 * Makes an SVG file safe to keep in a library and to show on boards, by the rules the backend checks (`SvgIcons`): only
 * elements of SVG, none that runs code, shows another document or animates, no handlers of events, no attributes of
 * other namespaces (e.g. of Inkscape), links only within the picture or to raster pictures inside it, and no styles that
 * reach outside. An SVG without its own size gets that of its `viewBox`. `null` for text that is no SVG.
 */
export function cleanSvg(text: string): SvgIcon | null {
  const document = new DOMParser().parseFromString(text, 'image/svg+xml')
  const root = document.documentElement
  if (!root || document.getElementsByTagName('parsererror').length > 0) return null
  if (root.namespaceURI !== SVG_NS || root.localName !== 'svg') return null
  clean(root)
  const box = viewBox(root.getAttribute('viewBox'))
  let width = length(root.getAttribute('width'))
  let height = length(root.getAttribute('height'))
  if (box) {
    // One side and the box give the other side.
    if (width === null && height !== null) width = (height * box.width) / box.height
    if (height === null && width !== null) height = (width * box.height) / box.width
    width ??= box.width
    height ??= box.height
    // The size it is drawn at where nothing else sets one, e.g. in a preview.
    if (!root.hasAttribute('width') || length(root.getAttribute('width')) === null) root.setAttribute('width', String(width))
    if (!root.hasAttribute('height') || length(root.getAttribute('height')) === null) root.setAttribute('height', String(height))
  }
  // The root alone: the doctype, processing instructions and comments around it stay behind.
  return { svg: new XMLSerializer().serializeToString(root), width, height }
}

function clean(element: Element) {
  for (const attribute of Array.from(element.attributes)) {
    if (!keeps(element, attribute)) element.removeAttributeNode(attribute)
  }
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const inner = child as Element
      const unsafeStyle = inner.localName === 'style' && UNSAFE_STYLE.test(inner.textContent ?? '')
      if (inner.namespaceURI !== SVG_NS || FORBIDDEN.has(inner.localName) || unsafeStyle) child.remove()
      else clean(inner)
    } else if (child.nodeType !== Node.TEXT_NODE && child.nodeType !== Node.CDATA_SECTION_NODE) {
      // Comments and processing instructions draw nothing.
      child.remove()
    }
  }
}

function keeps(element: Element, attribute: Attr): boolean {
  const name = attribute.localName
  const value = attribute.value
  if (attribute.namespaceURI === XMLNS_NS) return true
  if (name.toLowerCase().startsWith('on')) return false
  if (attribute.namespaceURI === XLINK_NS) return name === 'href' && safeLink(element, value)
  if (attribute.namespaceURI === XML_NS) return true
  if (attribute.namespaceURI !== null) return false
  if (name === 'href') return safeLink(element, value)
  if (name === 'style') return !UNSAFE_STYLE.test(value)
  return !UNSAFE_REFERENCE.test(value) && !/^\s*javascript:/i.test(value)
}

/** A link within the picture, or a raster picture embedded into it. */
function safeLink(element: Element, value: string): boolean {
  const link = value.trim()
  return link.startsWith('#') || (element.localName === 'image' && EMBEDDED_IMAGE.test(link))
}

/** A length in pixels: a number, with `px` or without a unit; `null` for anything else, e.g. `100%` or `2em`. */
function length(value: string | null): number | null {
  const match = value === null ? null : /^\s*(\d+(?:\.\d+)?|\.\d+)\s*(px)?\s*$/i.exec(value)
  const number = match ? Number(match[1]) : NaN
  return Number.isFinite(number) && number > 0 ? number : null
}

function viewBox(value: string | null): { width: number; height: number } | null {
  const parts = (value ?? '').trim().split(/[\s,]+/).map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return null
  const [, , width, height] = parts as [number, number, number, number]
  return width > 0 && height > 0 ? { width, height } : null
}

/** The SVG as a `data:` address with base64 of its UTF-8, as the logos of the palette are. */
export function svgDataUri(svg: string): string {
  const bytes = new TextEncoder().encode(svg)
  let binary = ''
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000))
  }
  return `data:image/svg+xml;base64,${btoa(binary)}`
}

/** The side of an icon without a size of its own, and the side that a smaller icon grows to. */
export const ICON_SIDE = 64

/** The size of the shape of an icon: its own, at least {@link ICON_SIDE} on its larger side, at most `max` on each. */
export function iconSize(width: number | null, height: number | null, max: number): { width: number; height: number } {
  if (width === null || height === null) return { width: ICON_SIDE, height: ICON_SIDE }
  const grow = Math.max(1, ICON_SIDE / Math.max(width, height))
  const scale = Math.min(grow, max / width, max / height)
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}
