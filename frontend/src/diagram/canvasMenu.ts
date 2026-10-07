/** What a right click on the canvas is about: nothing selected, one element of a kind, or several elements. */
export type MenuTarget = 'canvas' | 'shape' | 'table' | 'field' | 'index' | 'edge' | 'group' | 'selection'

export type MenuCommand =
  | 'paste'
  | 'selectAll'
  | 'addSticky'
  | 'undo'
  | 'redo'
  | 'editLabel'
  | 'addField'
  | 'addIndex'
  | 'cut'
  | 'copy'
  | 'duplicate'
  | 'bringToFront'
  | 'sendToBack'
  | 'reverseEdge'
  | 'group'
  | 'ungroup'
  | 'lock'
  | 'unlock'
  | 'delete'
  | 'comment'
  | 'commentHere'

/** A key combination; `Mod` is Ctrl, or Cmd on macOS. */
export type Shortcut =
  | 'Mod+X'
  | 'Mod+C'
  | 'Mod+V'
  | 'Mod+D'
  | 'Mod+A'
  | 'Mod+Z'
  | 'Mod+Shift+Z'
  | 'Mod+G'
  | 'Mod+Shift+G'
  | 'Delete'
  | 'F2'
  | 'N'

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
  /** The selection has at least two shapes of one parent to group. */
  canGroup?: boolean
  /** The participant may only view the board: the menu has only the items that change nothing. */
  readOnly?: boolean
  /** The page comments on single elements and on points of the canvas, which viewers do too. */
  canComment?: boolean
  /** A selected element is not locked yet: «Закрепить» is offered. */
  canLock?: boolean
  /** A selected element is locked: «Открепить» is offered. */
  canUnlock?: boolean
  /** Every selected element is locked: the items that would change them are disabled. */
  locked?: boolean
}

/** Items of a participant who may only view the board. */
const VIEWING_COMMANDS = new Set<MenuCommand>(['copy', 'selectAll', 'comment', 'commentHere'])

/** Items that change the selected elements, which a lock keeps from changing. */
const CHANGING_COMMANDS = new Set<MenuCommand>([
  'editLabel',
  'addField',
  'addIndex',
  'cut',
  'bringToFront',
  'sendToBack',
  'reverseEdge',
  'group',
  'ungroup',
  'delete',
])

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
const COMMENT: Entry[] = [['comment', 'Комментировать']]
const LOCK: Entry[] = [
  ['lock', 'Закрепить'],
  ['unlock', 'Открепить'],
]

/** Groups of the menu of each target, in the order of the menu. */
const MENUS: Record<MenuTarget, Entry[][]> = {
  canvas: [
    [
      ['paste', 'Вставить', 'Mod+V'],
      ['selectAll', 'Выделить всё', 'Mod+A'],
      ['addSticky', 'Добавить стикер', 'N'],
    ],
    [
      ['undo', 'Отменить', 'Mod+Z'],
      ['redo', 'Повторить', 'Mod+Shift+Z'],
    ],
    [['commentHere', 'Комментировать здесь']],
  ],
  shape: [[EDIT_LABEL], CLIPBOARD, ORDER, LOCK, COMMENT, [DELETE]],
  table: [
    [EDIT_LABEL, ['addField', 'Добавить поле'], ['addIndex', 'Добавить индекс']],
    CLIPBOARD,
    ORDER,
    LOCK,
    COMMENT,
    [DELETE],
  ],
  field: [
    [
      ['editLabel', 'Изменить', 'F2'],
      ['addField', 'Добавить поле ниже'],
    ],
    COMMENT,
    [['delete', 'Удалить поле', 'Delete']],
  ],
  index: [
    [
      ['editLabel', 'Изменить', 'F2'],
      ['addIndex', 'Добавить индекс ниже'],
    ],
    COMMENT,
    [['delete', 'Удалить индекс', 'Delete']],
  ],
  edge: [[EDIT_LABEL, ['reverseEdge', 'Развернуть направление']], LOCK, COMMENT, [DELETE]],
  group: [[['ungroup', 'Разгруппировать', 'Mod+Shift+G']], CLIPBOARD, ORDER, LOCK, COMMENT, [DELETE]],
  selection: [[['group', 'Сгруппировать', 'Mod+G']], CLIPBOARD, ORDER, LOCK, [DELETE]],
}

/**
 * Items of the context menu for a target; the ones that cannot be done now are disabled, and so are those that would
 * change locked elements. A participant who may only view gets only copying, selecting and commenting, so their menu may
 * be empty.
 */
export function menuItems(
  target: MenuTarget,
  {
    canPaste,
    canUndo,
    canRedo,
    canGroup = false,
    readOnly = false,
    canComment = false,
    canLock = false,
    canUnlock = false,
    locked = false,
  }: MenuAvailability,
): MenuItem[] {
  const unavailable: Partial<Record<MenuCommand, boolean>> = {
    paste: !canPaste,
    undo: !canUndo,
    redo: !canRedo,
    group: !canGroup,
  }
  const offered: Partial<Record<MenuCommand, boolean>> = {
    comment: canComment,
    commentHere: canComment,
    lock: canLock,
    unlock: canUnlock,
  }
  const groups = MENUS[target]
    .map((group) =>
      group.filter(([command]) => (!readOnly || VIEWING_COMMANDS.has(command)) && (offered[command] ?? true)),
    )
    .filter((group) => group.length > 0)
  return groups.flatMap((group, groupIndex) =>
    group.map(([command, label, shortcut], index) => ({
      command,
      label,
      shortcut,
      disabled: (unavailable[command] ?? false) || (locked && CHANGING_COMMANDS.has(command)),
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
