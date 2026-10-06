import { LOCKED_BY_KEY } from '../diagram/locks.ts'
import type { StyleValue } from '../diagram/model.ts'

export type Style = Record<string, StyleValue>
export type CellKind = 'vertex' | 'edge'

/** Boolean keys of maxGraph styles, and `autosize` and `connectable` of draw.io; draw.io writes them as 0 and 1. */
const BOOLEAN_KEYS = new Set([
  'absoluteArcSize',
  'anchorPointDirection',
  'autoSize',
  'autosize',
  'backgroundOutline',
  'bendable',
  'cloneable',
  'codrawBase',
  'codrawBaseDefault',
  'codrawIndex',
  'connectable',
  'curved',
  'dashed',
  'deletable',
  'editable',
  'endFill',
  'entryPerimeter',
  'exitPerimeter',
  'fixDash',
  'flipH',
  'flipV',
  'foldable',
  'glass',
  'horizontal',
  'ignoreDefaultStyle',
  'imageAspect',
  'locked',
  'movable',
  'noEdgeStyle',
  'noLabel',
  'orthogonal',
  'orthogonalLoop',
  'pointerEvents',
  'portConstraintRotation',
  'resizable',
  'resizeHeight',
  'resizeWidth',
  'rotatable',
  'rounded',
  'shadow',
  'startFill',
  'swimlaneLine',
])

/** Numeric keys of maxGraph styles. Other values stay strings, as draw.io keeps them. */
const NUMBER_KEYS = new Set([
  'arcSize',
  'endSize',
  'entryDx',
  'entryDy',
  'entryX',
  'entryY',
  'exitDx',
  'exitDy',
  'exitX',
  'exitY',
  'fillOpacity',
  'fontSize',
  'fontStyle',
  'imageHeight',
  'imageWidth',
  'indicatorHeight',
  'indicatorWidth',
  'jettySize',
  'labelPadding',
  'labelWidth',
  'margin',
  'opacity',
  'perimeterSpacing',
  'rotation',
  'routingCenterX',
  'routingCenterY',
  'segment',
  'sourceJettySize',
  'sourcePerimeterSpacing',
  'spacing',
  'spacingBottom',
  'spacingLeft',
  'spacingRight',
  'spacingTop',
  'startSize',
  'strokeOpacity',
  'strokeWidth',
  'targetJettySize',
  'targetPerimeterSpacing',
  'textOpacity',
])

const TEXT: Style = { fillColor: 'none', gradientColor: 'none', strokeColor: 'none', align: 'left', verticalAlign: 'top' }
const LABEL: Style = {
  fontStyle: 1,
  align: 'left',
  verticalAlign: 'middle',
  spacing: 2,
  spacingLeft: 52,
  imageWidth: 42,
  imageHeight: 42,
  rounded: true,
}
const IMAGE: Style = { shape: 'image', labelBackgroundColor: '#ffffff', verticalAlign: 'top', verticalLabelPosition: 'bottom' }

/** Named styles of the default stylesheet of draw.io, which `text;html=1;…` and the like refer to. */
const NAMED_STYLES: Record<string, Style> = {
  text: TEXT,
  edgeLabel: { ...TEXT, labelBackgroundColor: '#ffffff', fontSize: 11 },
  label: LABEL,
  icon: {
    ...LABEL,
    align: 'center',
    imageAlign: 'center',
    verticalLabelPosition: 'bottom',
    verticalAlign: 'top',
    labelBackgroundColor: '#ffffff',
    spacing: 0,
    spacingLeft: 0,
    spacingTop: 6,
    fontStyle: 0,
    imageWidth: 48,
    imageHeight: 48,
  },
  swimlane: { shape: 'swimlane', fontSize: 12, fontStyle: 1, startSize: 23 },
  group: { verticalAlign: 'top', fillColor: 'none', strokeColor: 'none', gradientColor: 'none', pointerEvents: false },
  ellipse: { shape: 'ellipse', perimeter: 'ellipsePerimeter' },
  rhombus: { shape: 'rhombus', perimeter: 'rhombusPerimeter' },
  triangle: { shape: 'triangle', perimeter: 'trianglePerimeter' },
  line: { shape: 'line', strokeWidth: 4, labelBackgroundColor: '#ffffff', verticalAlign: 'top', spacingTop: 8 },
  image: IMAGE,
  roundImage: { ...IMAGE, perimeter: 'ellipsePerimeter' },
  rhombusImage: { ...IMAGE, perimeter: 'rhombusPerimeter' },
  arrow: { shape: 'arrow', edgeStyle: 'none', fillColor: '#ffffff' },
}

/** What `default` means for colors in draw.io with its default (light) theme. */
const DEFAULT_COLORS: Record<string, string> = {
  fillColor: '#ffffff',
  strokeColor: '#000000',
  fontColor: '#000000',
  labelBackgroundColor: '#ffffff',
  labelBorderColor: '#000000',
  swimlaneFillColor: '#ffffff',
  gradientColor: 'none',
}

/** Keys that draw.io uses and CoDraw does not keep: labels are plain text in CoDraw. */
const DROPPED_KEYS = new Set(['html'])

/**
 * Keys of CoDraw that stay on the board: who locked a cell is the name of a participant, which neither a file nor the
 * clipboard carries, and which a file cannot claim either.
 */
const BOARD_KEYS = new Set([LOCKED_BY_KEY])

/** draw.io writes `data:image/png,<base64>`: a `;` would end the style value. */
const DATA_IMAGE = /^data:image\/([a-z0-9.+-]+),([A-Za-z0-9+/=]+)$/i
const BASE64_DATA_IMAGE = /^data:image\/([a-z0-9.+-]+);base64,/i
const LIGHT_DARK = /^light-dark\(\s*([^,]+?)\s*,/

function readValue(key: string, raw: string): StyleValue {
  if (BOOLEAN_KEYS.has(key)) return raw !== '0' && raw !== 'false'
  if (NUMBER_KEYS.has(key) && raw.trim() !== '') {
    const number = Number(raw)
    if (Number.isFinite(number)) return number
  }
  const lightDark = LIGHT_DARK.exec(raw)
  if (lightDark) return readValue(key, lightDark[1]!)
  if (raw === 'default' && key in DEFAULT_COLORS) return DEFAULT_COLORS[key]!
  if (key === 'image') {
    const data = DATA_IMAGE.exec(raw)
    if (data) return `data:image/${data[1]};base64,${data[2]}`
  }
  return raw
}

/**
 * Reads a draw.io style string into a CoDraw style: named styles of draw.io are expanded, unknown names are kept
 * in `baseStyleNames`, values get the types maxGraph expects, and the defaults that differ between draw.io and
 * CoDraw are made explicit.
 */
export function parseStyle(text: string, kind: CellKind): Style {
  const names: string[] = []
  const style: Style = {}
  const own: Style = {}
  for (const part of text.split(';')) {
    const entry = part.trim()
    if (!entry) continue
    const separator = entry.indexOf('=')
    if (separator < 0) {
      const named = NAMED_STYLES[entry]
      if (named) Object.assign(style, named)
      else names.push(entry)
      continue
    }
    const key = entry.slice(0, separator)
    if (DROPPED_KEYS.has(key) || BOARD_KEYS.has(key)) continue
    own[key] = readValue(key, entry.slice(separator + 1))
  }
  Object.assign(style, own)
  if (names.length > 0) style.baseStyleNames = names
  // In draw.io an edge without an edge style is straight and its label hides the line under it, while CoDraw
  // routes edges orthogonally and draws labels without a background by default.
  if (kind === 'edge') {
    style.edgeStyle ??= 'none'
    style.labelBackgroundColor ??= '#ffffff'
  } else {
    style.fontSize ??= 12
  }
  return style
}

function writeValue(key: string, value: StyleValue): string {
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.join(',')
  if (key === 'image' && BASE64_DATA_IMAGE.test(value)) return value.replace(';base64,', ',')
  return value
}

/** Writes a CoDraw style as a draw.io style string, with the CoDraw defaults that draw.io does not share. */
export function formatStyle(style: Style, kind: CellKind): string {
  const full: Style = { ...style }
  if (kind === 'edge') {
    full.edgeStyle ??= 'orthogonalEdgeStyle'
    full.labelBackgroundColor ??= 'none'
  } else {
    full.fontSize ??= 13
  }
  const names = Array.isArray(full.baseStyleNames) ? full.baseStyleNames : []
  delete full.baseStyleNames
  BOARD_KEYS.forEach((key) => delete full[key])
  const parts = [...names, ...Object.entries(full).map(([key, value]) => `${key}=${writeValue(key, value)}`)]
  return parts.length > 0 ? `${parts.join(';')};` : ''
}
