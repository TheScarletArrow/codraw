import type { StyleValue } from './model.ts'

/** A part of the look of an element that the toolbar sets. */
export type StylePart = 'fill' | 'line' | 'text'

/**
 * The style keys that «Вставить стиль» carries over, by the parts of the look: what the toolbar sets, but neither the
 * size and the form of an element nor what it means. The shadow goes with the fill: only shapes have it. Not carried:
 * the geometry, `rotation`, the auto width and the wrap of words, which lay the label out in the width of the shape;
 * the shape and its corners (`rounded`, `arcSize`), which the palette tells apart, e.g. «Скруглённый прямоугольник»;
 * the form of an edge (`edgeStyle`, `curved`) and its markers, which tell the direction and the cardinality; locks and
 * other keys of CoDraw, the keys of tables, and any key not listed here, e.g. of keys that later features bring.
 */
export const STYLE_PARTS: Readonly<Record<StylePart, readonly string[]>> = {
  fill: ['fillColor', 'fillOpacity', 'gradientColor', 'gradientDirection', 'shadow'],
  line: ['strokeColor', 'strokeWidth', 'dashed', 'dashPattern'],
  text: ['fontColor', 'fontSize', 'fontFamily', 'fontStyle', 'align'],
}

/**
 * The keys of the text of a table that its fields and indexes follow when the table gets a style: they keep their
 * alignment, font style and color, which make them rows rather than the name of the table.
 */
export const TABLE_ROW_KEYS: readonly string[] = ['fontFamily', 'fontSize']

/**
 * What an element is as to its look: a shape (a table and a frame too) has a fill, a line and a text; an edge has no
 * fill; a label — a shape without a fill and a line, a field or an index of a table, the label of an edge — has only a
 * text, as draw.io gives text cells only the keys of the text.
 */
export type StyleKind = 'shape' | 'edge' | 'label'

const KIND_PARTS: Readonly<Record<StyleKind, readonly StylePart[]>> = {
  shape: ['fill', 'line', 'text'],
  edge: ['line', 'text'],
  label: ['text'],
}

/** A copied look: the kind of the element it was copied from, and the values of the keys of its parts that it has. */
export interface CopiedStyle {
  kind: StyleKind
  /** A key of the parts of the kind without a value has the default, which pasting gives the targets too. */
  values: Readonly<Record<string, StyleValue>>
}

/** The keys a style copied from an element of `source` kind carries over to an element of `target` kind. */
export function carriedKeys(source: StyleKind, target: StyleKind): string[] {
  return KIND_PARTS[source].filter((part) => KIND_PARTS[target].includes(part)).flatMap((part) => STYLE_PARTS[part])
}

const isStyleValue = (value: unknown): value is StyleValue =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'

/**
 * The look of an element of `kind` with `style`: the keys of its parts that the style has. The caller passes the font
 * size as drawn, as the defaults of shapes and edges differ.
 */
export function copyLook(style: Readonly<Record<string, unknown>>, kind: StyleKind): CopiedStyle {
  const values: Record<string, StyleValue> = {}
  for (const key of carriedKeys(kind, kind)) {
    const value = style[key]
    if (isStyleValue(value)) values[key] = value
  }
  return { kind, values }
}

/**
 * The changes that give an element of `kind` with `style` the copied look: a value for each carried key that differs,
 * `undefined` for a key that the copied element does not have, which brings the default back. `only` narrows the keys,
 * e.g. to {@link TABLE_ROW_KEYS} for the fields of a table. Empty when the element looks so already.
 */
export function styleChanges(
  copied: CopiedStyle,
  style: Readonly<Record<string, unknown>>,
  kind: StyleKind,
  only?: readonly string[],
): Record<string, StyleValue | undefined> {
  const changes: Record<string, StyleValue | undefined> = {}
  for (const key of carriedKeys(copied.kind, kind)) {
    if (only && !only.includes(key)) continue
    const value = copied.values[key]
    if (style[key] !== value) changes[key] = value
  }
  return changes
}

/**
 * The look copied last in the browser tab, shared by the editors of all its pages and boards, as the clipboard of the
 * tab is; nothing keeps it beyond the tab.
 */
let copied: CopiedStyle | null = null

export const styleClipboard = {
  put(style: CopiedStyle) {
    copied = style
  },
  read(): CopiedStyle | null {
    return copied
  },
  /** Forgets the copied look, as a new tab has none. */
  clear() {
    copied = null
  },
}
