import type { Plan, SelectionPlan } from './plan.ts'
import { FRAME_KINDS, type FrameKind } from './sequence.ts'
import type { ElementStatus, SelectionStatus } from './status.ts'
import { canvasMenuMessages as m } from './canvasMenu.messages.ts'

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
  | PlanCommand
  | 'delete'
  | 'comment'
  | 'commentHere'
  | 'link'
  | 'edgeApi'
  | 'properties'
  | 'issues'
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
  | 'detail'
  | 'dependencies'
  | 'pathBetween'
  | 'saveToLibrary'

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

/** Items that mark the selection as what will appear, what will go, or what is (see `plan.ts`). */
export type PlanCommand = 'planNone' | 'planAdded' | 'planRemoved'

/** The mark each item of the plan sets; `null` takes it off. */
export const PLAN_COMMANDS: Record<PlanCommand, Plan | null> = {
  planNone: null,
  planAdded: 'added',
  planRemoved: 'removed',
}

export const isPlanCommand = (command: MenuCommand): command is PlanCommand => command in PLAN_COMMANDS

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
  /** The single selected shape has a page of detail, or the participant may make one, and the page opens it: «Детализировать». */
  canDetail?: boolean
  /** The status of the selected elements that may have one: the items of the status are offered, with it chosen. */
  status?: SelectionStatus | null
  /** The marks of plan of the selected elements that may have one: the items of «Изменение» are offered, with it chosen. */
  plan?: SelectionPlan | null
  /** The selected frame of a sequence diagram, or the branch of one, has branches: «Добавить ветку» is offered. */
  canBranch?: boolean
  /** The selected table may have indexes, not being a view that is not materialized: «Добавить индекс» is offered. */
  canAddIndex?: boolean
  /** The single selected shape or table depends on others by its kind: «Зависимости» is offered. */
  canShowDependencies?: boolean
  /** Two elements are selected: «Путь между» is offered. */
  canShowPath?: boolean
  /** The page saves the selection into a library of the user: «Сохранить в библиотеку…» is offered, to viewers too. */
  canSaveToLibrary?: boolean
  /** The page shows the issues of the tracker linked to an element: «Задачи…» is offered, to viewers too. */
  canShowIssues?: boolean
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
  'detail',
  'dependencies',
  'pathBetween',
  'saveToLibrary',
  'issues',
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
  ...(Object.keys(PLAN_COMMANDS) as PlanCommand[]),
])

/** The name of an item: a text of the dictionary, or a text of its own, e.g. of a kind of frame. */
type Label = keyof typeof m.items | (() => string)

type Entry = [MenuCommand, Label, Shortcut?]

const labelOf = (label: Label): string => (typeof label === 'function' ? label() : m.items[label])

const CLIPBOARD: Entry[] = [
  ['cut', 'cut', 'Mod+X'],
  ['copy', 'copy', 'Mod+C'],
  ['duplicate', 'duplicate', 'Mod+D'],
]
/** Copying, then saving into a library, which takes what copying takes. */
const COPYING: Entry[] = [...CLIPBOARD, ['saveToLibrary', 'saveToLibrary']]
const COPY_STYLE: Entry = ['copyStyle', 'copyStyle', 'Mod+Alt+C']
const PASTE_STYLE: Entry = ['pasteStyle', 'pasteStyle', 'Mod+Alt+V']
const STYLE: Entry[] = [COPY_STYLE, PASTE_STYLE]
const ORDER: Entry[] = [
  ['bringToFront', 'bringToFront'],
  ['sendToBack', 'sendToBack'],
]
const DELETE: Entry = ['delete', 'delete', 'Delete']
const EDIT_LABEL: Entry = ['editLabel', 'editLabel', 'F2']
const COMMENT: Entry[] = [['comment', 'comment']]
/** Commenting on an element, and its issues of the tracker. */
const DISCUSSION: Entry[] = [...COMMENT, ['issues', 'issues']]
const LINK: Entry[] = [['link', 'link']]
const EDGE_API: Entry = ['edgeApi', 'edgeApi']
const PROPERTIES: Entry = ['properties', 'properties']
const DETAIL: Entry = ['detail', 'detail']
const SHARED: Entry[] = [
  ['whereUsed', 'whereUsed'],
  ['detachElement', 'detachElement'],
]
const DELETE_EVERYWHERE: Entry = ['deleteElementEverywhere', 'deleteEverywhere']
const DEPENDENCIES: Entry = ['dependencies', 'dependencies']
const LOCK: Entry[] = [
  ['lock', 'lock'],
  ['unlock', 'unlock'],
]
const COPY_MERMAID: Entry[] = [['copyMermaid', 'copyMermaid']]
const FRAMES: Entry[] = (Object.entries(FRAME_COMMANDS) as [FrameCommand, FrameKind][]).map(([command, kind]) => [
  command,
  () => FRAME_KINDS.find((frame) => frame.value === kind)!.label,
])
const BRANCH: Entry = ['addBranch', 'addBranch']
const STATUS: Entry[] = [
  ['statusDraft', 'statusDraft'],
  ['statusReview', 'statusReview'],
  ['statusDone', 'statusDone'],
  ['statusNone', 'statusNone'],
]
const PLAN: Entry[] = [
  ['planNone', 'planNone'],
  ['planAdded', 'planAdded'],
  ['planRemoved', 'planRemoved'],
]

/** Groups of the menu of each target, in the order of the menu. */
const MENUS: Record<MenuTarget, Entry[][]> = {
  canvas: [
    [
      ['paste', 'paste', 'Mod+V'],
      ['pasteAsSameElement', 'pasteAsSameElement', 'Mod+Shift+V'],
      ['selectAll', 'selectAll', 'Mod+A'],
      ['addSticky', 'addSticky', 'N'],
    ],
    [
      ['undo', 'undo', 'Mod+Z'],
      ['redo', 'redo', 'Mod+Shift+Z'],
    ],
    [['commentHere', 'commentHere']],
  ],
  shape: [
    [EDIT_LABEL],
    COPYING,
    STYLE,
    ORDER,
    LOCK,
    STATUS,
    PLAN,
    [...LINK, DETAIL, PROPERTIES, DEPENDENCIES, ...SHARED],
    DISCUSSION,
    [DELETE, DELETE_EVERYWHERE],
  ],
  table: [
    [EDIT_LABEL, ['addField', 'addField'], ['addIndex', 'addIndex']],
    COPYING,
    STYLE,
    ORDER,
    LOCK,
    STATUS,
    PLAN,
    [...LINK, DEPENDENCIES],
    DISCUSSION,
    [DELETE],
  ],
  field: [
    [
      ['editLabel', 'edit', 'F2'],
      ['addField', 'addFieldBelow'],
    ],
    STYLE,
    COMMENT,
    [['delete', 'deleteField', 'Delete']],
  ],
  index: [
    [
      ['editLabel', 'edit', 'F2'],
      ['addIndex', 'addIndexBelow'],
    ],
    STYLE,
    COMMENT,
    [['delete', 'deleteIndex', 'Delete']],
  ],
  edge: [[EDIT_LABEL, ['reverseEdge', 'reverseEdge']], STYLE, LOCK, PLAN, [...LINK, EDGE_API, PROPERTIES], DISCUSSION, [DELETE]],
  // A group and several elements have no look of their own to copy.
  group: [[['ungroup', 'ungroup', 'Mod+Shift+G']], COPYING, [PASTE_STYLE], ORDER, LOCK, STATUS, PLAN, LINK, DISCUSSION, [DELETE]],
  selection: [
    [
      ['group', 'group', 'Mod+G'],
      ['mergeElements', 'mergeElements'],
      ['pathBetween', 'pathBetween'],
    ],
    COPYING,
    [PASTE_STYLE],
    ORDER,
    LOCK,
    STATUS,
    PLAN,
    [DELETE],
  ],
  sequence: [
    [EDIT_LABEL, ['addParticipant', 'addParticipant'], ['addMessage', 'addMessage']],
    COPY_MERMAID,
    COPYING,
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
      ['editLabel', 'edit', 'F2'],
      ['addParticipant', 'addParticipantRight'],
      ['addMessage', 'addMessage'],
    ],
    COPY_MERMAID,
    COMMENT,
    [['delete', 'deleteParticipant', 'Delete']],
  ],
  message: [
    [
      ['editLabel', 'edit', 'F2'],
      ['addMessage', 'addMessageBelow'],
      ['addNote', 'addNoteBelow'],
    ],
    FRAMES,
    COPY_MERMAID,
    COMMENT,
    [['delete', 'deleteMessage', 'Delete']],
  ],
  note: [
    [
      ['editLabel', 'edit', 'F2'],
      ['addMessage', 'addMessageBelow'],
    ],
    COPY_MERMAID,
    COMMENT,
    [['delete', 'deleteNote', 'Delete']],
  ],
  frame: [[['editLabel', 'editCondition', 'F2'], BRANCH], COPY_MERMAID, COMMENT, [['delete', 'deleteFrame', 'Delete']]],
  branch: [[['editLabel', 'editCondition', 'F2'], BRANCH], COPY_MERMAID, COMMENT, [['delete', 'deleteBranch', 'Delete']]],
}

/**
 * Items of the context menu for a target; the ones that cannot be done now are disabled, and so are those that would
 * change locked elements. The status of the selection is offered when it has elements that may have one, with its
 * current status chosen, also for locked elements. «Добавить ветку» is offered for a frame of a sequence diagram that has
 * branches and for its branches. A participant who may only view gets only copying, copying a look, selecting,
 * commenting, the properties, the issues and copying Mermaid, so their menu may be empty: following a link needs no menu.
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
    canDetail = false,
    status = null,
    plan = null,
    canBranch = false,
    canAddIndex = true,
    canShowDependencies = false,
    canShowPath = false,
    canSaveToLibrary = false,
    canShowIssues = false,
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
    addIndex: canAddIndex,
    whereUsed: canShowWhereUsed,
    detachElement: sharedElement,
    deleteElementEverywhere: canDeleteElementEverywhere,
    mergeElements: canMergeElements,
    detail: canDetail,
    dependencies: canShowDependencies,
    pathBetween: canShowPath,
    saveToLibrary: canSaveToLibrary,
    issues: canShowIssues,
    ...Object.fromEntries(Object.keys(STATUS_COMMANDS).map((command) => [command, status !== null])),
    ...Object.fromEntries(Object.keys(PLAN_COMMANDS).map((command) => [command, plan !== null])),
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
        label: labelOf(label),
        shortcut,
        disabled: (unavailable[command] ?? false) || (locked && CHANGING_COMMANDS.has(command)),
        separatorBefore: groupIndex > 0 && index === 0,
      }
      // The frames a message goes into are a group of their own.
      if (isFrameCommand(command)) return index === 0 ? { ...item, heading: m.frame } : item
      // What will appear and what will go are a choice too; nothing chosen is what is.
      if (isPlanCommand(command)) {
        return {
          ...item,
          ...(index === 0 && { heading: m.plan }),
          checked: plan !== null && !plan.mixed && PLAN_COMMANDS[command] === plan.value,
        }
      }
      if (!isStatusCommand(command)) return item
      // Different statuses choose none of them.
      return {
        ...item,
        ...(index === 0 && { heading: m.status }),
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
