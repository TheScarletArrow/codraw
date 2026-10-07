/** The target of a key takes text itself, e.g. a field or the editor of a label: a key is a character there. */
export function takesText(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.closest('[contenteditable]:not([contenteditable="false"])') !== null ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
  )
}

/**
 * The key is `Mod` with the letter `letter` (in lower case), without Shift and Alt: Ctrl, or Cmd on macOS, where Ctrl
 * with a letter moves the caret in fields. A layout without Latin letters, e.g. the Russian one, gives the letter of the
 * key on the Latin one, as the shortcuts of the browser read it.
 */
export function isModLetter(event: KeyboardEvent, letter: string, isMac: boolean): boolean {
  if (!(isMac ? event.metaKey : event.ctrlKey) || event.shiftKey || event.altKey) return false
  const key = event.key.toLowerCase()
  return key === letter || (!/^[a-z]$/.test(key) && event.code === `Key${letter.toUpperCase()}`)
}
