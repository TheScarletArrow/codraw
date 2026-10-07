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
  return latinLetter(event) === letter
}

/**
 * The Latin letter of a key, in lower case: the letter it types, or, when it types none, e.g. in the Russian layout or
 * with Option on macOS (`ç` for C), the letter of the key on the Latin layout, as the shortcuts of the browser read it;
 * `null` for a key that is not a letter.
 */
export function latinLetter(event: Pick<KeyboardEvent, 'key' | 'code'>): string | null {
  const key = event.key.toLowerCase()
  if (/^[a-z]$/.test(key)) return key
  const code = /^Key([A-Z])$/.exec(event.code)
  return code ? code[1]!.toLowerCase() : null
}

/**
 * The key code of a key as maxGraph looks keys up, with the letter of the key on the Latin layout for a letter of a
 * layout without Latin letters, e.g. `N` for the «т» of the Russian one, as the shortcuts of the browser read it. Other
 * keys, and letters of Latin layouts, keep their key code.
 */
export function latinKeyCode(event: KeyboardEvent): number {
  const letter = /^Key([A-Z])$/.exec(event.code)?.[1]
  const nonLatin = event.key.length === 1 && !/^[a-z]$/i.test(event.key)
  return letter && nonLatin ? letter.charCodeAt(0) : event.keyCode
}
