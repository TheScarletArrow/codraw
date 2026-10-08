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

/** Continue the item at the caret; Enter on an empty item leaves the list. */
export function continueList(text: string, start: number, end = start): { text: string; caret: number } | null {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1
  const before = text.slice(lineStart, start)
  const marker = MARKER.exec(before)
  if (!marker) return null
  if (!before.slice(marker[0].length).trim()) {
    return { text: text.slice(0, lineStart) + text.slice(end), caret: lineStart }
  }
  const next = /^\d/.test(marker[2]!) ? `${Number.parseInt(marker[2]!, 10) + 1}${marker[2]!.slice(-1)}` : marker[2]!
  const inserted = `\n${marker[1]}${next} `
  return { text: text.slice(0, start) + inserted + text.slice(end), caret: start + inserted.length }
}

export function handleListEnter(event: KeyboardEvent, textarea: HTMLElement): boolean {
  if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return false
  const selection = window.getSelection()
  if (!selection?.rangeCount) return false
  const range = selection.getRangeAt(0)
  if (!textarea.contains(range.commonAncestorContainer)) return false
  const offset = (node: Node, position: number) => {
    const prefix = document.createRange()
    prefix.selectNodeContents(textarea)
    prefix.setEnd(node, position)
    return domUtils.extractTextWithWhitespace(Array.from(prefix.cloneContents().childNodes) as Element[]).length
  }
  const text = domUtils.extractTextWithWhitespace(Array.from(textarea.childNodes) as Element[])
  const start = offset(range.startContainer, range.startOffset)
  const next = continueList(text, start, offset(range.endContainer, range.endOffset))
  if (!next) return false
  event.preventDefault()
  // Use the native edit when possible so Ctrl+Z also works during label editing.
  if (next.caret > start && document.execCommand?.('insertText', false, next.text.slice(start, next.caret))) return true
  const nodes: Node[] = []
  next.text.split('\n').forEach((line, index) => {
    if (index) nodes.push(document.createElement('br'))
    nodes.push(document.createTextNode(line))
  })
  textarea.replaceChildren(...nodes)
  const caret = document.createRange()
  let remaining = next.caret
  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const length = node.textContent!.length
      if (remaining <= length) {
        caret.setStart(node, remaining)
        break
      }
      remaining -= length
    } else remaining--
  }
  caret.collapse(true)
  selection.removeAllRanges()
  selection.addRange(caret)
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
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
