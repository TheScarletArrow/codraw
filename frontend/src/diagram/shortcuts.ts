import { shortcutMessages as m } from './shortcuts.messages.ts'

/**
 * A line of the help on shortcuts: keys in the notation of shortcuts (`Mod` is Ctrl, or Cmd on macOS), any of which
 * does the action. Besides keys of {@link KEY_BINDINGS}, keys may be `Arrows` (the four arrows), `?`, `/`, `Mod+F` of
 * the search on the board, `M` of the minimap, `Enter` in the text of a message of a sequence diagram, and the mouse:
 * `Click`, `DoubleClick`, `Drag`, `RightDrag` and `Wheel`.
 */
export interface ShortcutEntry {
  keys: string[]
  action: string
  /** The action changes the board: a participant who may only view does not have it. */
  editing?: boolean
}

export interface ShortcutGroup {
  title: string
  entries: ShortcutEntry[]
  /** Shortcuts of working on a board with others: a page without them, e.g. a draft of a proposal, does not have them. */
  collaboration?: boolean
}

type Action = keyof typeof m.actions

/** A line of the help, its action named in the language of the interface. */
const entry = (action: Action, keys: string[], editing?: true): ShortcutEntry => ({
  keys,
  get action() {
    return m.actions[action]
  },
  ...(editing && { editing }),
})

/** The shortcuts of the editor, as the help shows them; a test keeps them in step with the keys of the editor. */
export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    get title() {
      return m.groups.editing
    },
    entries: [
      entry('undo', ['Mod+Z'], true),
      entry('redo', ['Mod+Shift+Z', 'Mod+Y'], true),
      entry('copy', ['Mod+C']),
      entry('cut', ['Mod+X'], true),
      entry('paste', ['Mod+V'], true),
      entry('pasteAsSameElement', ['Mod+Shift+V'], true),
      entry('duplicate', ['Mod+D'], true),
      entry('copyStyle', ['Mod+Alt+C']),
      entry('pasteStyle', ['Mod+Alt+V'], true),
      entry('delete', ['Delete', 'Backspace'], true),
      entry('editLabel', ['F2'], true),
      entry('addSticky', ['N', 'Mod+DoubleClick'], true),
      entry('group', ['Mod+G'], true),
      entry('ungroup', ['Mod+Shift+G'], true),
      entry('pencil', ['P'], true),
      entry('nextMessage', ['Enter'], true),
    ],
  },
  {
    get title() {
      return m.groups.selection
    },
    entries: [
      entry('selectAll', ['Mod+A']),
      entry('toggleSelection', ['Mod+Click', 'Mod+Drag']),
      entry('nudge', ['Arrows'], true),
      entry('nudgeGrid', ['Shift+Arrows'], true),
      entry('dragFree', ['Alt+Drag'], true),
      entry('resizeProportional', ['Shift+Drag'], true),
      entry('autoLayout', ['Mod+Shift+L'], true),
    ],
  },
  {
    get title() {
      return m.groups.text
    },
    entries: [
      entry('bold', ['Mod+B'], true),
      entry('italic', ['Mod+I'], true),
      entry('underline', ['Mod+U'], true),
    ],
  },
  {
    get title() {
      return m.groups.view
    },
    entries: [
      entry('zoom', ['Mod+Wheel']),
      entry('fitAll', ['Mod+Shift+H']),
      entry('pan', ['RightDrag']),
      entry('find', ['Mod+F']),
      entry('followLink', ['Mod+Click']),
      entry('minimap', ['M']),
      entry('shortcuts', ['?']),
    ],
  },
  {
    get title() {
      return m.groups.collaboration
    },
    collaboration: true,
    entries: [
      entry('laser', ['K']),
      entry('comment', ['C']),
      entry('cursorMessage', ['/']),
    ],
  },
]

/**
 * The groups a participant has: without the editing shortcuts for one who may only view, and without those of working
 * with others on a page without them.
 */
export function shortcutGroups(readOnly: boolean, collaboration = true): ShortcutGroup[] {
  return SHORTCUT_GROUPS.filter((group) => collaboration || !group.collaboration)
    .map((group) => ({
      ...group,
      entries: group.entries.filter((entry) => !readOnly || !entry.editing),
    }))
    .filter((group) => group.entries.length > 0)
}

/** Keys written as they are: the arrows. */
const SYMBOLS: Record<string, string> = {
  Arrows: '←↑→↓',
  ArrowLeft: '←',
  ArrowUp: '↑',
  ArrowRight: '→',
  ArrowDown: '↓',
}

const isMouse = (key: string): key is keyof typeof m.mouse => Object.hasOwn(m.mouse, key)

/** A key or the mouse as written in the language of the interface. */
const wordOf = (key: string): string | undefined => (isMouse(key) ? m.mouse[key] : SYMBOLS[key])

/**
 * How keys are written on this system: `Ctrl+Shift+Z` on Windows and Linux; on macOS with the symbols of its modifiers
 * in the order of macOS, `⇧⌘Z`, and Delete as ⌫. Mouse actions are joined with `+`: `⌘+колесо`.
 */
export function formatKeys(keys: string, isMac: boolean): string {
  const parts = keys.split('+')
  const key = parts.at(-1)!
  const mod = parts.includes('Mod')
  const shift = parts.includes('Shift')
  const alt = parts.includes('Alt')
  const name = key === 'Delete' && isMac ? '⌫' : (wordOf(key) ?? key)
  if (!isMac) return [mod && 'Ctrl', alt && 'Alt', shift && 'Shift', name].filter(Boolean).join('+')
  const modifiers = `${alt ? '⌥' : ''}${shift ? '⇧' : ''}${mod ? '⌘' : ''}`
  if (!modifiers) return name
  // A word after the symbols reads better with a plus.
  return isMouse(key) ? `${modifiers}+${name}` : `${modifiers}${name}`
}
