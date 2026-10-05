/** What a right click on the canvas is about: nothing selected, one element of a kind, or several elements. */
export type MenuTarget = 'canvas' | 'shape' | 'table' | 'field' | 'edge' | 'selection'

export type MenuCommand =
  | 'paste'
  | 'selectAll'
  | 'undo'
  | 'redo'
  | 'editLabel'
  | 'addField'
  | 'cut'
  | 'copy'
  | 'duplicate'
  | 'bringToFront'
  | 'sendToBack'
  | 'reverseEdge'
  | 'delete'

/** A key combination; `Mod` is Ctrl, or Cmd on macOS. */
export type Shortcut = 'Mod+X' | 'Mod+C' | 'Mod+V' | 'Mod+D' | 'Mod+A' | 'Mod+Z' | 'Mod+Shift+Z' | 'Delete' | 'F2'

export interface MenuItem {
  command: MenuCommand
  label: string
  shortcut?: Shortcut
  disabled: boolean
  /** The item starts a new group of the menu. */
  separatorBefore: boolean
}

export interface MenuAvailability {
  canPaste: boolean
  canUndo: boolean
  canRedo: boolean
  /** The participant may only view the board: the menu has only the items that change nothing. */
  readOnly?: boolean
}

/** Items of a participant who may only view the board. */
const VIEWING_COMMANDS = new Set<MenuCommand>(['copy', 'selectAll'])

type Entry = [MenuCommand, string, Shortcut?]

const CLIPBOARD: Entry[] = [
  ['cut', 'Вырезать', 'Mod+X'],
  ['copy', 'Копировать', 'Mod+C'],
  ['duplicate', 'Дублировать', 'Mod+D'],
]
const ORDER: Entry[] = [
  ['bringToFront', 'На передний план'],
  ['sendToBack', 'На задний план'],
]
const DELETE: Entry = ['delete', 'Удалить', 'Delete']
const EDIT_LABEL: Entry = ['editLabel', 'Изменить подпись', 'F2']

/** Groups of the menu of each target, in the order of the menu. */
const MENUS: Record<MenuTarget, Entry[][]> = {
  canvas: [
    [
      ['paste', 'Вставить', 'Mod+V'],
      ['selectAll', 'Выделить всё', 'Mod+A'],
    ],
    [
      ['undo', 'Отменить', 'Mod+Z'],
      ['redo', 'Повторить', 'Mod+Shift+Z'],
    ],
  ],
  shape: [[EDIT_LABEL], CLIPBOARD, ORDER, [DELETE]],
  table: [[EDIT_LABEL, ['addField', 'Добавить поле']], CLIPBOARD, ORDER, [DELETE]],
  field: [
    [
      ['editLabel', 'Изменить', 'F2'],
      ['addField', 'Добавить поле ниже'],
    ],
    [['delete', 'Удалить поле', 'Delete']],
  ],
  edge: [[EDIT_LABEL, ['reverseEdge', 'Развернуть направление']], [DELETE]],
  selection: [CLIPBOARD, ORDER, [DELETE]],
}

/**
 * Items of the context menu for a target; the ones that cannot be done now are disabled. A participant who may only
 * view gets only copying and selecting, so their menu may be empty.
 */
export function menuItems(
  target: MenuTarget,
  { canPaste, canUndo, canRedo, readOnly = false }: MenuAvailability,
): MenuItem[] {
  const unavailable: Partial<Record<MenuCommand, boolean>> = { paste: !canPaste, undo: !canUndo, redo: !canRedo }
  const groups = MENUS[target]
    .map((group) => group.filter(([command]) => !readOnly || VIEWING_COMMANDS.has(command)))
    .filter((group) => group.length > 0)
  return groups.flatMap((group, groupIndex) =>
    group.map(([command, label, shortcut], index) => ({
      command,
      label,
      shortcut,
      disabled: unavailable[command] ?? false,
      separatorBefore: groupIndex > 0 && index === 0,
    })),
  )
}

/** How a shortcut is written on this system: `Ctrl+Shift+Z`, or `⇧⌘Z` on macOS. */
export function shortcutLabel(shortcut: Shortcut, isMac: boolean): string {
  if (!isMac) return shortcut.replace('Mod', 'Ctrl')
  if (shortcut === 'Delete') return '⌫'
  const keys = shortcut.split('+')
  // macOS writes Shift before Cmd, then the key.
  return `${keys.includes('Shift') ? '⇧' : ''}${keys.includes('Mod') ? '⌘' : ''}${keys.at(-1)}`
}
