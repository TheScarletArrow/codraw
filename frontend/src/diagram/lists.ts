import { domUtils, type CellStyle, type Graph } from '@maxgraph/core'
import type { ShapeStyle } from './shapes.ts'

export type ListKind = 'bullet' | 'numbered'
const MARKER = /^(\s*)([•*-]|\d+[.)])\s+/

export function listKind(text: string): ListKind | null {
  const lines = text.split('\n').filter((line) => line.trim())
  if (!lines.length || !lines.every((line) => MARKER.test(line))) return null
  return lines.every((line) => /^\s*\d+[.)]\s+/.test(line)) ? 'numbered' : 'bullet'
}

export function formatList(text: string, kind: ListKind | null): string {
  return text.split('\n').map((line, index) => {
    const content = line.replace(MARKER, '')
    return kind === null ? content : `${kind === 'bullet' ? '•' : `${index + 1}.`} ${content}`
  }).join('\n')
}

/**
 * Continue the item at the caret and renumber the numbered items after it; Enter on an empty item leaves the list.
 */
export function continueList(text: string, start: number, end = start): { text: string; caret: number } | null {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1
  const before = text.slice(lineStart, start)
  const marker = MARKER.exec(before)
  if (!marker) return null
  if (!before.slice(marker[0].length).trim()) {
    return { text: text.slice(0, lineStart) + text.slice(end), caret: lineStart }
  }
  const [, indent, symbol] = marker as unknown as [string, string, string]
  const numbered = /^\d/.test(symbol)
  const number = Number.parseInt(symbol, 10)
  const inserted = `\n${indent}${numbered ? `${number + 1}${symbol.slice(-1)}` : symbol} `
  let rest = text.slice(end)
  if (numbered) {
    // The items that follow at the same indent move one number down, past deeper items, up to the end of the list.
    const lines = rest.split('\n')
    const sameLevel = new RegExp(`^${indent}\\d+[.)]\\s`)
    const deeper = new RegExp(`^${indent}\\s+([•*-]|\\d+[.)])\\s`)
    for (let index = 1, next = number + 2; index < lines.length; index++) {
      if (sameLevel.test(lines[index]!)) lines[index] = lines[index]!.replace(/\d+/, String(next++))
      else if (!deeper.test(lines[index]!)) break
    }
    rest = lines.join('\n')
  }
  return { text: text.slice(0, start) + inserted + rest, caret: start + inserted.length }
}

/** The editor markup of a text, as the label editor of maxGraph writes it: `<br>` between lines. */
function editorHtml(text: string): string {
  const html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  // A last empty line needs a block of its own to be shown and to keep the caret.
  return (text.endsWith('\n') ? `${html.slice(0, -1)}<div><br></div>` : html).replace(/\n/g, '<br>')
}

/** The text of the label editor before a node and an offset in it, as maxGraph reads the label. */
function textBefore(textarea: HTMLElement, node: Node, position: number): number {
  const prefix = document.createRange()
  prefix.selectNodeContents(textarea)
  prefix.setEnd(node, position)
  return domUtils.extractTextWithWhitespace(Array.from(prefix.cloneContents().childNodes) as Element[]).length
}

const editorText = (textarea: HTMLElement) => domUtils.extractTextWithWhitespace(Array.from(textarea.childNodes) as Element[])

/** Puts the caret at the first place of the label editor whose text before it is `position` long. */
function placeCaret(textarea: HTMLElement, position: number) {
  const walker = document.createTreeWalker(textarea, NodeFilter.SHOW_ALL)
  const caret = document.createRange()
  caret.setStart(textarea, textarea.childNodes.length)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const at = textBefore(textarea, node, 0)
    if (at > position) break
    if (node.nodeType === Node.TEXT_NODE && position - at <= node.textContent!.length) {
      caret.setStart(node, position - at)
      break
    }
    if (node.nodeType !== Node.TEXT_NODE && at === position && !node.childNodes.length) {
      caret.setStartBefore(node)
      break
    }
  }
  caret.collapse(true)
  const selection = window.getSelection()!
  selection.removeAllRanges()
  selection.addRange(caret)
}

/** The last continuation of a list in a label editor: the texts and carets before and after it. */
const continued = new WeakMap<HTMLElement, { before: string; start: number; after: string; caret: number }>()

/**
 * After the browser undoes or redoes a continuation it selects the whole text, as the edit replaced it; the caret goes
 * back where Enter was pressed, or after the new marker, so that the next key does not replace the label.
 */
function restoreCaretAfterHistory(event: Event) {
  const textarea = event.currentTarget as HTMLElement
  const last = continued.get(textarea)
  const type = (event as InputEvent).inputType
  if (!last || (type !== 'historyUndo' && type !== 'historyRedo')) return
  const text = editorText(textarea)
  if (text === last.before) placeCaret(textarea, last.start)
  else if (text === last.after) placeCaret(textarea, last.caret)
}

export function handleListEnter(event: KeyboardEvent, textarea: HTMLElement): boolean {
  if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return false
  const selection = window.getSelection()
  if (!selection?.rangeCount) return false
  const range = selection.getRangeAt(0)
  if (!textarea.contains(range.commonAncestorContainer)) return false
  const text = editorText(textarea)
  const start = textBefore(textarea, range.startContainer, range.startOffset)
  const next = continueList(text, start, textBefore(textarea, range.endContainer, range.endOffset))
  if (!next) return false
  event.preventDefault()
  // The whole text is replaced as one native edit, so Ctrl+Z also works during label editing. Inserting a line break
  // as text would make Chromium wrap the new line in a block that the next Enter reads wrongly.
  const html = editorHtml(next.text)
  const all = document.createRange()
  all.selectNodeContents(textarea)
  selection.removeAllRanges()
  selection.addRange(all)
  if (!continued.has(textarea)) textarea.addEventListener('input', restoreCaretAfterHistory)
  continued.set(textarea, { before: text, start, after: next.text, caret: next.caret })
  if (!document.execCommand?.('insertHTML', false, html)) {
    const template = document.createElement('template')
    template.innerHTML = html
    textarea.replaceChildren(template.content)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  }
  placeCaret(textarea, next.caret)
  return true
}

export function configureLists(graph: Graph) {
  const changed = graph.cellLabelChanged.bind(graph)
  graph.cellLabelChanged = (cell, value, autoSize) => {
    const style = cell.getStyle() as ShapeStyle
    const kind = listKind(String(value ?? ''))
    const list = style.codrawShape === 'list' || style.codrawShape === 'numbered-list'
    graph.getDataModel().batchUpdate(() => {
      if (list || (kind && (style.codrawShape === 'text' || style.codrawShape === 'rectangle'))) {
        const next: ShapeStyle = {
          ...style,
          codrawShape: kind === 'numbered' ? 'numbered-list' : kind === 'bullet' ? 'list' : 'text',
        }
        graph.getDataModel().setStyle(cell, next as CellStyle)
      }
      changed(cell, value, autoSize)
    })
  }
}
