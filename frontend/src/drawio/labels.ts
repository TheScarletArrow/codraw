/** Elements of HTML that start a new line in a label. */
const BLOCKS = new Set(['ADDRESS', 'BLOCKQUOTE', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'OL', 'P', 'PRE', 'TABLE', 'TR', 'UL'])

/**
 * Turns an HTML label of draw.io into plain text: line breaks and blocks become new lines, entities are decoded,
 * formatting is dropped. CoDraw shows labels as text, so HTML from a file never runs.
 */
export function htmlToText(html: string): string {
  const body = new DOMParser().parseFromString(html, 'text/html').body
  let text = ''
  const newLine = () => {
    if (text !== '' && !text.endsWith('\n')) text += '\n'
  }
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += (node.textContent ?? '').replace(/[\s ]+/g, ' ')
      return
    }
    if (!(node instanceof Element)) return
    if (node.tagName === 'SCRIPT' || node.tagName === 'STYLE') return
    if (node.tagName === 'BR') {
      text += '\n'
      return
    }
    const block = BLOCKS.has(node.tagName)
    if (block) newLine()
    node.childNodes.forEach(walk)
    if (block) newLine()
  }
  body.childNodes.forEach(walk)
  return text
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/^\n+|\n+$/g, '')
}
