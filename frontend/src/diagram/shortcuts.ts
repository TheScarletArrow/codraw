/**
 * A line of the help on shortcuts: keys in the notation of shortcuts (`Mod` is Ctrl, or Cmd on macOS), any of which
 * does the action. Besides keys of {@link KEY_BINDINGS}, keys may be `Arrows` (the four arrows), `?`, `/`, `Mod+F` of
 * the search on the board, and the mouse: `Click`, `DoubleClick`, `Drag`, `RightDrag` and `Wheel`.
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

/** The shortcuts of the editor, as the help shows them; a test keeps them in step with the keys of the editor. */
export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Правка',
    entries: [
      { keys: ['Mod+Z'], action: 'Отменить', editing: true },
      { keys: ['Mod+Shift+Z', 'Mod+Y'], action: 'Повторить', editing: true },
      { keys: ['Mod+C'], action: 'Копировать' },
      { keys: ['Mod+X'], action: 'Вырезать', editing: true },
      { keys: ['Mod+V'], action: 'Вставить', editing: true },
      { keys: ['Mod+D'], action: 'Дублировать', editing: true },
      { keys: ['Mod+Alt+C'], action: 'Копировать стиль' },
      { keys: ['Mod+Alt+V'], action: 'Вставить стиль', editing: true },
      { keys: ['Delete', 'Backspace'], action: 'Удалить', editing: true },
      { keys: ['F2'], action: 'Изменить подпись', editing: true },
      { keys: ['N', 'Mod+DoubleClick'], action: 'Добавить стикер', editing: true },
      { keys: ['Mod+G'], action: 'Сгруппировать', editing: true },
      { keys: ['Mod+Shift+G'], action: 'Разгруппировать', editing: true },
    ],
  },
  {
    title: 'Выделение и перемещение',
    entries: [
      { keys: ['Mod+A'], action: 'Выделить всё' },
      { keys: ['Mod+Click', 'Mod+Drag'], action: 'Добавить к выделению или убрать из него' },
      { keys: ['Arrows'], action: 'Сдвинуть на 1 пиксель', editing: true },
      { keys: ['Shift+Arrows'], action: 'Сдвинуть на шаг сетки', editing: true },
      { keys: ['Alt+Drag'], action: 'Перетащить без сетки и направляющих, повернуть по 1°', editing: true },
      { keys: ['Mod+Shift+L'], action: 'Автораскладка слева направо', editing: true },
    ],
  },
  {
    title: 'Текст',
    entries: [
      { keys: ['Mod+B'], action: 'Жирный', editing: true },
      { keys: ['Mod+I'], action: 'Курсив', editing: true },
      { keys: ['Mod+U'], action: 'Подчёркнутый', editing: true },
    ],
  },
  {
    title: 'Вид',
    entries: [
      { keys: ['Mod+Wheel'], action: 'Изменить масштаб' },
      { keys: ['Mod+Shift+H'], action: 'Показать всё' },
      { keys: ['RightDrag'], action: 'Прокрутить холст' },
      { keys: ['Mod+F'], action: 'Найти на доске' },
      { keys: ['Mod+Click'], action: 'Перейти по ссылке элемента' },
      { keys: ['?'], action: 'Горячие клавиши' },
    ],
  },
  {
    title: 'Совместная работа',
    collaboration: true,
    entries: [
      { keys: ['K'], action: 'Указка' },
      { keys: ['C'], action: 'Комментарий' },
      { keys: ['/'], action: 'Сообщение у курсора' },
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

const WORDS: Record<string, string> = {
  Arrows: '←↑→↓',
  ArrowLeft: '←',
  ArrowUp: '↑',
  ArrowRight: '→',
  ArrowDown: '↓',
  Click: 'щелчок',
  DoubleClick: 'двойной щелчок',
  Drag: 'перетаскивание',
  RightDrag: 'протягивание правой кнопкой',
  Wheel: 'колесо',
}

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
  const name = key === 'Delete' && isMac ? '⌫' : (WORDS[key] ?? key)
  if (!isMac) return [mod && 'Ctrl', alt && 'Alt', shift && 'Shift', name].filter(Boolean).join('+')
  const modifiers = `${alt ? '⌥' : ''}${shift ? '⇧' : ''}${mod ? '⌘' : ''}`
  if (!modifiers) return name
  // A word after the symbols reads better with a plus.
  return key in WORDS && key !== 'Arrows' && !key.startsWith('Arrow') ? `${modifiers}+${name}` : `${modifiers}${name}`
}
