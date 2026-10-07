import { describe, expect, it } from 'vitest'
import { menuItems, shortcutLabel, type MenuAvailability, type MenuTarget } from './canvasMenu.ts'

const all = { canPaste: true, canUndo: true, canRedo: true }
const labels = (target: MenuTarget, availability: MenuAvailability = all) => menuItems(target, availability).map((item) => item.label)

describe('menuItems', () => {
  it('offers paste, select all, undo and redo on the empty canvas', () => {
    expect(labels('canvas')).toEqual(['Вставить', 'Выделить всё', 'Отменить', 'Повторить'])
  })

  it('offers the label, the clipboard, the look, the order and deletion for a shape', () => {
    expect(labels('shape')).toEqual([
      'Изменить подпись',
      'Вырезать',
      'Копировать',
      'Дублировать',
      'Копировать стиль',
      'Вставить стиль',
      'На передний план',
      'На задний план',
      'Удалить',
    ])
  })

  it('adds a field or an index to a table right after its label', () => {
    expect(labels('table')).toEqual([
      'Изменить подпись',
      'Добавить поле',
      'Добавить индекс',
      'Вырезать',
      'Копировать',
      'Дублировать',
      'Копировать стиль',
      'Вставить стиль',
      'На передний план',
      'На задний план',
      'Удалить',
    ])
  })

  it('offers only editing, a new field, the look and deletion for a field', () => {
    expect(labels('field')).toEqual(['Изменить', 'Добавить поле ниже', 'Копировать стиль', 'Вставить стиль', 'Удалить поле'])
  })

  it('offers only editing, a new index, the look and deletion for an index', () => {
    expect(labels('index')).toEqual([
      'Изменить',
      'Добавить индекс ниже',
      'Копировать стиль',
      'Вставить стиль',
      'Удалить индекс',
    ])
  })

  it('offers the label, reversing, the look and deletion for an edge', () => {
    expect(labels('edge')).toEqual([
      'Изменить подпись',
      'Развернуть направление',
      'Копировать стиль',
      'Вставить стиль',
      'Удалить',
    ])
  })

  it('offers grouping, the clipboard, pasting a look, the order and deletion for several elements', () => {
    expect(labels('selection')).toEqual([
      'Сгруппировать',
      'Вырезать',
      'Копировать',
      'Дублировать',
      'Вставить стиль',
      'На передний план',
      'На задний план',
      'Удалить',
    ])
  })

  it('offers ungrouping first for a group', () => {
    expect(labels('group')).toEqual([
      'Разгруппировать',
      'Вырезать',
      'Копировать',
      'Дублировать',
      'Вставить стиль',
      'На передний план',
      'На задний план',
      'Удалить',
    ])
    expect(menuItems('group', all)[0]).toMatchObject({ command: 'ungroup', shortcut: 'Mod+Shift+G', disabled: false })
  })

  it('disables grouping until two shapes of one level are selected', () => {
    expect(menuItems('selection', all)[0]).toMatchObject({ command: 'group', shortcut: 'Mod+G', disabled: true })
    expect(menuItems('selection', { ...all, canGroup: true })[0]).toMatchObject({ disabled: false })
  })

  it('separates the groups of items', () => {
    const separated = menuItems('shape', all)
      .filter((item) => item.separatorBefore)
      .map((item) => item.label)

    expect(separated).toEqual(['Вырезать', 'Копировать стиль', 'На передний план', 'Удалить'])
  })

  it('disables paste with an empty clipboard and undo or redo with nothing to undo or redo', () => {
    const items = menuItems('canvas', { canPaste: false, canUndo: false, canRedo: true })

    expect(items.filter((item) => item.disabled).map((item) => item.label)).toEqual(['Вставить', 'Отменить'])
  })

  it('offers locking after the order, and after reversing for an edge, but not for a field or an index', () => {
    const lockable = { ...all, canLock: true }

    expect(labels('shape', lockable)).toEqual([
      'Изменить подпись',
      'Вырезать',
      'Копировать',
      'Дублировать',
      'Копировать стиль',
      'Вставить стиль',
      'На передний план',
      'На задний план',
      'Закрепить',
      'Удалить',
    ])
    expect(menuItems('shape', lockable).find((item) => item.command === 'lock')).toMatchObject({ separatorBefore: true })
    expect(labels('edge', lockable)).toEqual([
      'Изменить подпись',
      'Развернуть направление',
      'Копировать стиль',
      'Вставить стиль',
      'Закрепить',
      'Удалить',
    ])
    for (const target of ['table', 'group', 'selection'] as const) expect(labels(target, lockable)).toContain('Закрепить')
    expect(labels('field', lockable)).not.toContain('Закрепить')
    expect(labels('index', lockable)).not.toContain('Закрепить')
  })

  it('offers unlocking with locked elements, and locking too while some are not locked', () => {
    expect(labels('selection', { ...all, canLock: true, canUnlock: true })).toEqual(
      expect.arrayContaining(['Закрепить', 'Открепить']),
    )
    expect(labels('shape', { ...all, canUnlock: true, locked: true })).toContain('Открепить')
    expect(labels('shape', { ...all, canUnlock: true, locked: true })).not.toContain('Закрепить')
  })

  it('disables what would change locked elements, and keeps copying, commenting and unlocking', () => {
    const locked = { ...all, canUnlock: true, locked: true, canComment: true, canGroup: true }
    const enabled = (target: MenuTarget) =>
      menuItems(target, locked)
        .filter((item) => !item.disabled)
        .map((item) => item.label)

    expect(enabled('shape')).toEqual(['Копировать', 'Дублировать', 'Открепить', 'Комментировать'])
    expect(enabled('table')).toEqual(['Копировать', 'Дублировать', 'Открепить', 'Комментировать'])
    expect(enabled('field')).toEqual(['Комментировать'])
    expect(enabled('index')).toEqual(['Комментировать'])
    expect(enabled('edge')).toEqual(['Открепить', 'Комментировать'])
    expect(enabled('group')).toEqual(['Копировать', 'Дублировать', 'Открепить', 'Комментировать'])
    expect(enabled('selection')).toEqual(['Копировать', 'Дублировать', 'Открепить'])
  })

  it('offers a participant who may only view neither locking nor unlocking', () => {
    expect(labels('shape', { ...all, readOnly: true, canLock: true, canUnlock: true })).toEqual(['Копировать', 'Копировать стиль'])
  })

  it('offers copying a look for a single element and pasting it for any selection, disabled until it can be done', () => {
    const items = (target: MenuTarget, availability: MenuAvailability) =>
      menuItems(target, availability)
        .filter((item) => item.command === 'copyStyle' || item.command === 'pasteStyle')
        .map(({ command, shortcut, disabled }) => [command, shortcut, disabled])

    expect(items('shape', all)).toEqual([
      ['copyStyle', 'Mod+Alt+C', true],
      ['pasteStyle', 'Mod+Alt+V', true],
    ])
    expect(items('edge', { ...all, canCopyStyle: true, canPasteStyle: true })).toEqual([
      ['copyStyle', 'Mod+Alt+C', false],
      ['pasteStyle', 'Mod+Alt+V', false],
    ])
    expect(items('group', { ...all, canPasteStyle: true })).toEqual([['pasteStyle', 'Mod+Alt+V', false]])
    expect(items('selection', { ...all, canPasteStyle: true })).toEqual([['pasteStyle', 'Mod+Alt+V', false]])
    expect(items('canvas', { ...all, canCopyStyle: true, canPasteStyle: true })).toEqual([])
    expect(menuItems('shape', all).find((item) => item.command === 'copyStyle')).toMatchObject({ separatorBefore: true })
  })

  it('disables pasting a look into locked elements, and keeps copying it', () => {
    const locked = { ...all, locked: true, canUnlock: true, canCopyStyle: true, canPasteStyle: true }

    for (const target of ['shape', 'table', 'field', 'index', 'edge'] as const) {
      const style = menuItems(target, locked).filter((item) => item.command.endsWith('Style'))
      expect(style.map(({ label, disabled }) => [label, disabled])).toEqual([
        ['Копировать стиль', false],
        ['Вставить стиль', true],
      ])
    }
  })

  it('offers the statuses after locking for shapes, tables, groups and several elements with them', () => {
    const marked = { ...all, canLock: true, status: { value: null, mixed: false } }

    expect(labels('shape', marked)).toEqual([
      'Изменить подпись',
      'Вырезать',
      'Копировать',
      'Дублировать',
      'Копировать стиль',
      'Вставить стиль',
      'На передний план',
      'На задний план',
      'Закрепить',
      'Черновик',
      'Нужно ревью',
      'Готово',
      'Без статуса',
      'Удалить',
    ])
    const statuses = menuItems('shape', marked).filter((item) => item.checked !== undefined)
    expect(statuses.map(({ command, heading, separatorBefore }) => [command, heading, separatorBefore])).toEqual([
      ['statusDraft', 'Статус', true],
      ['statusReview', undefined, false],
      ['statusDone', undefined, false],
      ['statusNone', undefined, false],
    ])
    for (const target of ['table', 'group', 'selection'] as const) expect(labels(target, marked)).toContain('Нужно ревью')
    for (const target of ['canvas', 'field', 'index', 'edge'] as const) expect(labels(target, marked)).not.toContain('Нужно ревью')
    // Without elements that may have a status, e.g. edges only.
    expect(labels('selection', { ...all, status: null })).not.toContain('Нужно ревью')
  })

  it('chooses the common status of the selection, none for different ones', () => {
    const chosen = (status: MenuAvailability['status']) =>
      menuItems('selection', { ...all, status })
        .filter((item) => item.checked)
        .map((item) => item.label)

    expect(chosen({ value: 'review', mixed: false })).toEqual(['Нужно ревью'])
    expect(chosen({ value: null, mixed: false })).toEqual(['Без статуса'])
    expect(chosen({ value: null, mixed: true })).toEqual([])
  })

  it('keeps the statuses of locked elements, and offers them no participant who may only view', () => {
    const status = { value: 'done' as const, mixed: false }

    expect(
      menuItems('shape', { ...all, canUnlock: true, locked: true, status })
        .filter((item) => item.checked !== undefined)
        .every((item) => !item.disabled),
    ).toBe(true)
    expect(labels('shape', { ...all, readOnly: true, status })).toEqual(['Копировать', 'Копировать стиль'])
  })

  it('maps items to the commands of the editor with their shortcuts', () => {
    expect(menuItems('table', all).map(({ command, shortcut }) => [command, shortcut])).toEqual([
      ['editLabel', 'F2'],
      ['addField', undefined],
      ['addIndex', undefined],
      ['cut', 'Mod+X'],
      ['copy', 'Mod+C'],
      ['duplicate', 'Mod+D'],
      ['copyStyle', 'Mod+Alt+C'],
      ['pasteStyle', 'Mod+Alt+V'],
      ['bringToFront', undefined],
      ['sendToBack', undefined],
      ['delete', 'Delete'],
    ])
  })
})

describe('shortcutLabel', () => {
  it('writes Ctrl outside macOS', () => {
    expect(shortcutLabel('Mod+C', false)).toBe('Ctrl+C')
    expect(shortcutLabel('Mod+Shift+Z', false)).toBe('Ctrl+Shift+Z')
    expect(shortcutLabel('Mod+Shift+G', false)).toBe('Ctrl+Shift+G')
    expect(shortcutLabel('Mod+Alt+C', false)).toBe('Ctrl+Alt+C')
    expect(shortcutLabel('Delete', false)).toBe('Delete')
    expect(shortcutLabel('F2', false)).toBe('F2')
  })

  it('writes the symbols of the keys on macOS', () => {
    expect(shortcutLabel('Mod+C', true)).toBe('⌘C')
    expect(shortcutLabel('Mod+Shift+Z', true)).toBe('⇧⌘Z')
    expect(shortcutLabel('Mod+Alt+V', true)).toBe('⌥⌘V')
    expect(shortcutLabel('Delete', true)).toBe('⌫')
    expect(shortcutLabel('F2', true)).toBe('F2')
  })

  it('offers a participant who may only view copying, copying a look and selecting all', () => {
    const viewing = { ...all, readOnly: true }

    expect(labels('canvas', viewing)).toEqual(['Выделить всё'])
    expect(labels('canvas', { ...viewing, canComment: true })).toEqual(['Выделить всё', 'Комментировать здесь'])
    expect(labels('shape', viewing)).toEqual(['Копировать', 'Копировать стиль'])
    expect(labels('table', viewing)).toEqual(['Копировать', 'Копировать стиль'])
    expect(labels('selection', viewing)).toEqual(['Копировать'])
    expect(labels('group', viewing)).toEqual(['Копировать'])
    expect(labels('field', viewing)).toEqual(['Копировать стиль'])
    expect(labels('edge', viewing)).toEqual(['Копировать стиль'])
    expect(labels('canvas', { ...viewing, canComment: false })).not.toContain('Копировать стиль')
  })

  it('offers commenting on a single element, before deleting it, when the page takes comments', () => {
    const commenting = { ...all, canComment: true }

    for (const target of ['shape', 'table', 'field', 'edge', 'group'] as const) {
      const items = menuItems(target, commenting)
      const comment = items.findIndex((item) => item.command === 'comment')
      expect(items[comment]).toMatchObject({ label: 'Комментировать', separatorBefore: true, disabled: false })
      expect(items[comment + 1]?.command).toBe('delete')
    }
    expect(labels('canvas', commenting)).not.toContain('Комментировать')
    expect(labels('selection', commenting)).not.toContain('Комментировать')
    expect(labels('shape', all)).not.toContain('Комментировать')
  })

  it('offers commenting on the point of the click at the end of the menu of the empty canvas, when the page takes comments', () => {
    const items = menuItems('canvas', { ...all, canComment: true })

    expect(items.map((item) => item.label)).toEqual(['Вставить', 'Выделить всё', 'Отменить', 'Повторить', 'Комментировать здесь'])
    expect(items.at(-1)).toMatchObject({ command: 'commentHere', separatorBefore: true, disabled: false })
    expect(labels('canvas', all)).not.toContain('Комментировать здесь')
    for (const target of ['shape', 'table', 'field', 'index', 'edge', 'group', 'selection'] as const) {
      expect(labels(target, { ...all, canComment: true })).not.toContain('Комментировать здесь')
    }
  })

  it('lets a participant who may only view comment, also on a field or an edge', () => {
    const viewing = { ...all, readOnly: true, canComment: true }

    expect(labels('shape', viewing)).toEqual(['Копировать', 'Копировать стиль', 'Комментировать'])
    expect(labels('field', viewing)).toEqual(['Копировать стиль', 'Комментировать'])
    expect(labels('edge', viewing)).toEqual(['Копировать стиль', 'Комментировать'])
  })
})
