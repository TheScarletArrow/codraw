/** The target of a key takes text itself, e.g. a field or the editor of a label: a key is a character there. */
export function takesText(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.closest('[contenteditable]:not([contenteditable="false"])') !== null ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
  )
}
