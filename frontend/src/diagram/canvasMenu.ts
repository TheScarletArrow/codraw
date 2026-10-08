import { FRAME_KINDS, type FrameKind } from './sequence.ts'
import type { ElementStatus, SelectionStatus } from './status.ts'

/**
 * What a right click on the canvas is about: nothing selected, one element of a kind, or several elements. A sequence
 * diagram and each kind of its parts have menus of their own.
 */
export type MenuTarget =
  | 'canvas'
  | 'shape'
  | 'table'
  | 'field'
  | 'index'
  | 'edge'
  | 'group'
  | 'selection'
  | 'sequence'
  | 'participant'
  | 'message'
  | 'note'
  | 'frame'
  | 'branch'

export type MenuCommand =
  | 'paste'
  | 'pasteAsSameElement'
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
  | 'copyStyle'
  | 'pasteStyle'
  | 'bringToFront'
  | 'sendToBack'
  | 'reverseEdge'
  | 'group'
  | 'ungroup'
  | 'lock'
  | 'unlock'
  | StatusCommand
  | 'delete'
  | 'comment'
  | 'commentHere'
  | 'link'
  | 'edgeApi'
  | 'properties'
  | 'addParticipant'
  | 'addMessage'
  | 'addNote'
  | FrameCommand
  | 'addBranch'
  | 'copyMermaid'
  | 'whereUsed'
  | 'detachElement'
  | 'deleteElementEverywhere'
  | 'mergeElements'

/** Items that put the selected message of a sequence diagram into a frame of a kind. */
export type FrameCommand = 'frameAlt' | 'frameOpt' | 'frameLoop' | 'framePar'

/** The kind of the frame each item of frames adds. */
export const FRAME_COMMANDS: Record<FrameCommand, FrameKind> = {
  frameAlt: 'alt',
  frameOpt: 'opt',
  frameLoop: 'loop',
  framePar: 'par',
}

export const isFrameCommand = (command: MenuCommand): command is FrameCommand => command in FRAME_COMMANDS

/** Items that set the status of the selection. */
export type StatusCommand = 'statusDraft' | 'statusReview' | 'statusDone' | 'statusNone'

/** The status each item of the status sets; `null` takes it off. */
export const STATUS_COMMANDS: Record<StatusCommand, ElementStatus | null> = {
  statusDraft: 'draft',
  statusReview: 'review',
  statusDone: 'done',
  statusNone: null,
}

export const isStatusCommand = (command: MenuCommand): command is StatusCommand => command in STATUS_COMMANDS

/** A key combination; `Mod` is Ctrl, or Cmd on macOS. */
export type Shortcut =
  | 'Mod+X'
  | 'Mod+C'
  | 'Mod+V'
  | 'Mod+Shift+V'
  | 'Mod+D'
  | 'Mod+Alt+C'
  | 'Mod+Alt+V'
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
  /** The name of the group that the item starts, shown above it, e.g. «Статус». */
  heading?: string
  /** The item is one of a choice, chosen or not, e.g. a status; other items are not. */
  checked?: boolean
}

export interface MenuAvailability {
  canPaste: boolean
  canUndo: boolean
  canRedo: boolean
  /** The selection has at least two shapes of one parent to group. */
  canGroup?: boolean
  /** A single element with a look of its own is selected: «Копировать стиль» takes it. */
  canCopyStyle?: boolean
  /** A look is copied, and the selection has an element to paste it into. */
  canPasteStyle?: boolean
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
  /** The page sets links, and the single selected element may have one: «Ссылка…» is offered. */
  canLink?: boolean
  /** The page shows descriptions of calls, and a single edge is selected: «Описание API…» is offered. */
  canDescribeApi?: boolean
  /** The page shows properties, and the single selected shape or edge has them: «Свойства…» is offered. */
  canShowProperties?: boolean
  /** The clipboard of the tab holds copied cells: «Вставить как тот же элемент» is enabled. */
  canPasteAsSameElement?: boolean
  /** The page shows where elements are, and the single selected shape may be an element: «Где используется…». */
  canShowWhereUsed?: boolean
  /** The element of the single selected shape has other cells: «Отделить от элемента» is offered. */
  sharedElement?: boolean
  /** The element is shared, and the page confirms removing it from all pages: «Удалить со всех страниц…». */
  canDeleteElementEverywhere?: boolean
  /** The selected shapes show more than one element, and the page asks which to keep: «Объединить в один элемент…». */
  canMergeElements?: boolean
  /** The status of the selected elements that may have one: the items of the status are offered, with it chosen. */
  status?: SelectionStatus | null
  /** The selected frame of a sequence diagram, or the branch of one, has branches: «Добавить ветку» is offered. */
  canBranch?: boolean
}

/** Items of a participant who may only view the board. */
const VIEWING_COMMANDS = new Set<MenuCommand>([
  'copy',
  'copyStyle',
  'selectAll',
  'comment',
  'commentHere',
  'properties',
  'copyMermaid',
  'whereUsed',
])

/** Items that change the selected elements, which a lock keeps from changing. */
const CHANGING_COMMANDS = new Set<MenuCommand>([
  'editLabel',
  'addField',
  'addIndex',
  'cut',
  'pasteStyle',
  'bringToFront',
  'sendToBack',
  'reverseEdge',
  'group',
  'ungroup',
  'link',
  'edgeApi',
  'delete',
  'addParticipant',
  'addMessage',
  'addNote',
  ...(Object.keys(FRAME_COMMANDS) as FrameCommand[]),
  'addBranch',
  'detachElement',
  'deleteElementEverywhere',
  'mergeElements',
])

type Entry = [MenuCommand, string, Shortcut?]

const CLIPBOARD: Entry[] = [
  ['cut', 'Вырезать', 'Mod+X'],
  ['copy', 'Копировать', 'Mod+C'],
  ['duplicate', 'Дублировать', 'Mod+D'],
]
const COPY_STYLE: Entry = ['copyStyle', 'Копировать стиль', 'Mod+Alt+C']
const PASTE_STYLE: Entry = ['pasteStyle', 'Вставить стиль', 'Mod+Alt+V']
const STYLE: Entry[] = [COPY_STYLE, PASTE_STYLE]
const ORDER: Entry[] = [
  ['bringToFront', 'На передний план'],
  ['sendToBack', 'На задний план'],
]
const DELETE: Entry = ['delete', 'Удалить', 'Delete']
const EDIT_LABEL: Entry = ['editLabel', 'Изменить подпись', 'F2']
const COMMENT: Entry[] = [['comment', 'Комментировать']]
const LINK: Entry[] = [['link', 'Ссылка…']]
const EDGE_API: Entry = ['edgeApi', 'Описание API…']
const PROPERTIES: Entry = ['properties', 'Свойства…']
const SHARED: Entry[] = [
  ['whereUsed', 'Где используется…'],
  ['detachElement', 'Отделить от элемента'],
]
const DELETE_EVERYWHERE: Entry = ['deleteElementEverywhere', 'Удалить со всех страниц…']
const LOCK: Entry[] = [
  ['lock', 'Закрепить'],
  ['unlock', 'Открепить'],
]
const COPY_MERMAID: Entry[] = [['copyMermaid', 'Скопировать Mermaid']]
const FRAMES: Entry[] = (Object.entries(FRAME_COMMANDS) as [FrameCommand, FrameKind][]).map(([command, kind]) => [
  command,
  FRAME_KINDS.find((frame) => frame.value === kind)!.label,
])
const BRANCH: Entry = ['addBranch', 'Добавить ветку']
const STATUS: Entry[] = [
  ['statusDraft', 'Черновик'],
  ['statusReview', 'Нужно ревью'],
  ['statusDone', 'Готово'],
  ['statusNone', 'Без статуса'],
]

/** Groups of the menu of each target, in the order of the menu. */
const MENUS: Record<MenuTarget, Entry[][]> = {
  canvas: [
    [
      ['paste', 'Вставить', 'Mod+V'],
      ['pasteAsSameElement', 'Вставить как тот же элемент', 'Mod+Shift+V'],
      ['selectAll', 'Выделить всё', 'Mod+A'],
      ['addSticky', 'Добавить стикер', 'N'],
    ],
    [
      ['undo', 'Отменить', 'Mod+Z'],
      ['redo', 'Повторить', 'Mod+Shift+Z'],
    ],
    [['commentHere', 'Комментировать здесь']],
  ],
  shape: [[EDIT_LABEL], CLIPBOARD, STYLE, ORDER, LOCK, STATUS, [...LINK, PROPERTIES, ...SHARED], COMMENT, [DELETE, DELETE_EVERYWHERE]],
  table: [
    [EDIT_LABEL, ['addField', 'Добавить поле'], ['addIndex', 'Добавить индекс']],
    CLIPBOARD,
    STYLE,
    ORDER,
    LOCK,
    STATUS,
    LINK,
    COMMENT,
    [DELETE],
  ],
  field: [
    [
      ['editLabel', 'Изменить', 'F2'],
      ['addField', 'Добавить поле ниже'],
    ],
    STYLE,
    COMMENT,
    [['delete', 'Удалить поле', 'Delete']],
  ],
  index: [
    [
      ['editLabel', 'Изменить', 'F2'],
      ['addIndex', 'Добавить индекс ниже'],
    ],
    STYLE,
    COMMENT,
    [['delete', 'Удалить индекс', 'Delete']],
  ],
  edge: [[EDIT_LABEL, ['reverseEdge', 'Развернуть направление']], STYLE, LOCK, [...LINK, EDGE_API, PROPERTIES], COMMENT, [DELETE]],
  // A group and several elements have no look of their own to copy.
  group: [[['ungroup', 'Разгруппировать', 'Mod+Shift+G']], CLIPBOARD, [PASTE_STYLE], ORDER, LOCK, STATUS, LINK, COMMENT, [DELETE]],
  selection: [
    [
      ['group', 'Сгруппировать', 'Mod+G'],
      ['mergeElements', 'Объединить в один элемент…'],
    ],
    CLIPBOARD,
    [PASTE_STYLE],
    ORDER,
    LOCK,
    STATUS,
    [DELETE],
  ],
  sequence: [
    [EDIT_LABEL, ['addParticipant', 'Добавить участника'], ['addMessage', 'Добавить сообщение']],
    COPY_MERMAID,
    CLIPBOARD,
    STYLE,
    ORDER,
    LOCK,
    STATUS,
    LINK,
    COMMENT,
    [DELETE],
  ],
  participant: [
    [
      ['editLabel', 'Изменить', 'F2'],
      ['addParticipant', 'Добавить участника справа'],
      ['addMessage', 'Добавить сообщение'],
    ],
    COPY_MERMAID,
    COMMENT,
    [['delete', 'Удалить участника', 'Delete']],
  ],
  message: [
    [
      ['editLabel', 'Изменить', 'F2'],
      ['addMessage', 'Добавить сообщение ниже'],
      ['addNote', 'Добавить заметку ниже'],
    ],
    FRAMES,
    COPY_MERMAID,
    COMMENT,
    [['delete', 'Удалить сообщение', 'Delete']],
  ],
  note: [
    [
      ['editLabel', 'Изменить', 'F2'],
      ['addMessage', 'Добавить сообщение ниже'],
    ],
    COPY_MERMAID,
    COMMENT,
    [['delete', 'Удалить заметку', 'Delete']],
  ],
  frame: [[['editLabel', 'Изменить условие', 'F2'], BRANCH], COPY_MERMAID, COMMENT, [['delete', 'Удалить рамку', 'Delete']]],
  branch: [[['editLabel', 'Изменить условие', 'F2'], BRANCH], COPY_MERMAID, COMMENT, [['delete', 'Удалить ветку', 'Delete']]],
}

/**
 * Items of the context menu for a target; the ones that cannot be done now are disabled, and so are those that would
 * change locked elements. The status of the selection is offered when it has elements that may have one, with its
 * current status chosen, also for locked elements. «Добавить ветку» is offered for a frame of a sequence diagram that has
 * branches and for its branches. A participant who may only view gets only copying, copying a look, selecting,
 * commenting, the properties and copying Mermaid, so their menu may be empty: following a link needs no menu.
 */
export function menuItems(
  target: MenuTarget,
  {
    canPaste,
    canUndo,
    canRedo,
    canGroup = false,
    canCopyStyle = false,
    canPasteStyle = false,
    readOnly = false,
    canComment = false,
    canLock = false,
    canUnlock = false,
    locked = false,
    canLink = false,
    canDescribeApi = false,
    canShowProperties = false,
    canPasteAsSameElement = false,
    canShowWhereUsed = false,
    sharedElement = false,
    canDeleteElementEverywhere = false,
    canMergeElements = false,
    status = null,
    canBranch = false,
  }: MenuAvailability,
): MenuItem[] {
  const unavailable: Partial<Record<MenuCommand, boolean>> = {
    paste: !canPaste,
    pasteAsSameElement: !canPasteAsSameElement,
    undo: !canUndo,
    redo: !canRedo,
    group: !canGroup,
    copyStyle: !canCopyStyle,
    pasteStyle: !canPasteStyle,
  }
  const offered: Partial<Record<MenuCommand, boolean>> = {
    comment: canComment,
    commentHere: canComment,
    lock: canLock,
    unlock: canUnlock,
    link: canLink,
    edgeApi: canDescribeApi,
    properties: canShowProperties,
    addBranch: canBranch,
    whereUsed: canShowWhereUsed,
    detachElement: sharedElement,
    deleteElementEverywhere: canDeleteElementEverywhere,
    mergeElements: canMergeElements,
    ...Object.fromEntries(Object.keys(STATUS_COMMANDS).map((command) => [command, status !== null])),
  }
  const groups = MENUS[target]
    .map((group) =>
      group.filter(([command]) => (!readOnly || VIEWING_COMMANDS.has(command)) && (offered[command] ?? true)),
    )
    .filter((group) => group.length > 0)
  return groups.flatMap((group, groupIndex) =>
    group.map(([command, label, shortcut], index) => {
      const item: MenuItem = {
        command,
        label,
        shortcut,
        disabled: (unavailable[command] ?? false) || (locked && CHANGING_COMMANDS.has(command)),
        separatorBefore: groupIndex > 0 && index === 0,
      }
      // The frames a message goes into are a group of their own.
      if (isFrameCommand(command)) return index === 0 ? { ...item, heading: 'Рамка' } : item
      if (!isStatusCommand(command)) return item
      // Different statuses choose none of them.
      return {
        ...item,
        ...(index === 0 && { heading: 'Статус' }),
        checked: status !== null && !status.mixed && STATUS_COMMANDS[command] === status.value,
      }
    }),
  )
}

/** How a shortcut is written on this system: `Ctrl+Shift+Z`, or `⇧⌘Z` on macOS. */
export function shortcutLabel(shortcut: Shortcut, isMac: boolean): string {
  if (!isMac) return shortcut.replace('Mod', 'Ctrl')
  if (shortcut === 'Delete') return '⌫'
  const keys = shortcut.split('+')
  // macOS writes Option and Shift before Cmd, then the key.
  return `${keys.includes('Alt') ? '⌥' : ''}${keys.includes('Shift') ? '⇧' : ''}${keys.includes('Mod') ? '⌘' : ''}${keys.at(-1)}`
}
