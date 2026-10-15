import { LINE_HEIGHT } from './textMeasure.ts'

/**
 * The comment of a table, as `COMMENT ON TABLE` of SQL: one line of text under its name, in its header. A style key of
 * the table, which draw.io keeps among the keys it does not know; a file carries it as an attribute of the `<object>`
 * around the cell, since its `;` and `=` would break the style (see `drawio/style.ts`).
 */
export const TABLE_COMMENT_KEY = 'codrawTableComment'

/** The longest comment kept, in characters: the limit of MySQL for the comment of a table. */
export const MAX_TABLE_COMMENT = 2048

/** The widest a table gets for its comment by its auto width; a longer comment is cut with «…». */
export const MAX_COMMENT_WIDTH = 320

/** Room on each side of the line of the comment. */
export const COMMENT_PADDING = 8

/** Room under the text of the line of the comment, above the first field. */
const COMMENT_GAP = 4

/** A comment as a table keeps it: one line without spaces at its ends, every run of spaces as one, not too long. */
export function normalizeTableComment(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_TABLE_COMMENT).trimEnd()
}

/** The comment of a table, or `''` when it has none, or a value that is not one. */
export function tableCommentOf(style: Record<string, unknown>): string {
  const comment = style[TABLE_COMMENT_KEY]
  return typeof comment === 'string' && comment.length <= MAX_TABLE_COMMENT ? comment : ''
}

/** Size of the text of the comment for a table whose name has the text size `fontSize`. */
export function tableCommentFontSize(fontSize: number): number {
  return Math.max(9, Math.round(fontSize * 0.8))
}

/** Room the line of the comment takes under the name in the header of a table with the text size `fontSize`. */
export function tableCommentRoom(fontSize: number): number {
  return Math.ceil(LINE_HEIGHT * tableCommentFontSize(fontSize)) + COMMENT_GAP
}

/** The room of the comment of a table of this style in its header; 0 without a comment. */
export function commentRoomOf(style: Record<string, unknown>, fontSize: number): number {
  return tableCommentOf(style) ? tableCommentRoom(fontSize) : 0
}

/**
 * The text that fits `width` when measured by `measure`: all of it, or the longest start of it with «…» after it; empty
 * when not even «…» fits.
 */
export function fitText(text: string, width: number, measure: (text: string) => number): string {
  if (measure(text) <= width) return text
  const cut = (length: number) => `${text.slice(0, length).trimEnd()}…`
  if (measure('…') > width) return ''
  // The longest start that fits, by halving: measuring every length of a long comment would be slow.
  let fits = 0
  let fails = text.length
  while (fails - fits > 1) {
    const middle = Math.floor((fits + fails) / 2)
    if (measure(cut(middle)) <= width) fits = middle
    else fails = middle
  }
  return cut(fits)
}
