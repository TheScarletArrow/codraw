import { describe, expect, it } from 'vitest'
import { menuItems, shortcutLabel, type MenuAvailability, type MenuTarget } from './canvasMenu.ts'

const all = { canPaste: true, canUndo: true, canRedo: true }
const labels = (target: MenuTarget, availability: MenuAvailability = all) => menuItems(target, availability).map((item) => item.label)

describe('menuItems', () => {
  it('offers paste, select all, undo and redo on the empty canvas', () => {
    expect(labels('canvas')).toEqual(['Вставить', 'Выделить всё', 'Отменить', 'Повторить'])
  })

  it('offers the label, the clipboard, the order and deletion for a shape', () => {
    expect(labels('shape')).toEqual([
      'Изменить подпись',
      'Вырезать',
      'Копировать',
      'Дублировать',
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
      'На передний план',
      'На задний план',
      'Удалить',
    ])
  })

  it('offers only editing, a new field and deletion for a field', () => {
    expect(labels('field')).toEqual(['Изменить', 'Добавить поле ниже', 'Удалить поле'])
  })

  it('offers only editing, a new index and deletion for an index', () => {
    expect(labels('index')).toEqual(['Изменить', 'Добавить индекс ниже', 'Удалить индекс'])
  })

  it('offers the label, reversing and deletion for an edge', () => {
    expect(labels('edge')).toEqual(['Изменить подпись', 'Развернуть направление', 'Удалить'])
  })

  it('offers grouping, the clipboard, the order and deletion for several elements', () => {
    expect(labels('selection')).toEqual([
      'Сгруппировать',
      'Вырезать',
      'Копировать',
      'Дублировать',
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

    expect(separated).toEqual(['Вырезать', 'На передний план', 'Удалить'])
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
      'На передний план',
      'На задний план',
      'Закрепить',
      'Удалить',
    ])
    expect(menuItems('shape', lockable).find((item) => item.command === 'lock')).toMatchObject({ separatorBefore: true })
    expect(labels('edge', lockable)).toEqual(['Изменить подпись', 'Развернуть направление', 'Закрепить', 'Удалить'])
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
    expect(labels('shape', { ...all, readOnly: true, canLock: true, canUnlock: true })).toEqual(['Копировать'])
  })

  it('maps items to the commands of the editor with their shortcuts', () => {
    expect(menuItems('table', all).map(({ command, shortcut }) => [command, shortcut])).toEqual([
      ['editLabel', 'F2'],
      ['addField', undefined],
      ['addIndex', undefined],
      ['cut', 'Mod+X'],
      ['copy', 'Mod+C'],
      ['duplicate', 'Mod+D'],
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
    expect(shortcutLabel('Delete', false)).toBe('Delete')
    expect(shortcutLabel('F2', false)).toBe('F2')
  })

  it('writes the symbols of the keys on macOS', () => {
    expect(shortcutLabel('Mod+C', true)).toBe('⌘C')
    expect(shortcutLabel('Mod+Shift+Z', true)).toBe('⇧⌘Z')
    expect(shortcutLabel('Delete', true)).toBe('⌫')
    expect(shortcutLabel('F2', true)).toBe('F2')
  })

  it('offers a participant who may only view copying and selecting all, and nothing for a field or an edge', () => {
    const viewing = { ...all, readOnly: true }

    expect(labels('canvas', viewing)).toEqual(['Выделить всё'])
    expect(labels('canvas', { ...viewing, canComment: true })).toEqual(['Выделить всё', 'Комментировать здесь'])
    expect(labels('shape', viewing)).toEqual(['Копировать'])
    expect(labels('table', viewing)).toEqual(['Копировать'])
    expect(labels('selection', viewing)).toEqual(['Копировать'])
    expect(labels('field', viewing)).toEqual([])
    expect(labels('edge', viewing)).toEqual([])
    expect(menuItems('shape', viewing).every((item) => !item.separatorBefore)).toBe(true)
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

  it('offers the link of a shape, a table, a group or an edge in its own group before commenting, when the page sets links', () => {
    const linking = { ...all, canLink: true, canComment: true }

    for (const target of ['shape', 'table', 'edge', 'group'] as const) {
      const items = menuItems(target, linking)
      const link = items.findIndex((item) => item.command === 'link')
      expect(items[link]).toMatchObject({ label: 'Ссылка…', separatorBefore: true, disabled: false })
      expect(items[link + 1]).toMatchObject({ command: 'comment', separatorBefore: true })
    }
    expect(labels('shape', { ...all, canLink: true }).slice(-2)).toEqual(['Ссылка…', 'Удалить'])
    for (const target of ['canvas', 'field', 'index', 'selection'] as const) expect(labels(target, linking)).not.toContain('Ссылка…')
    expect(labels('shape', all)).not.toContain('Ссылка…')
    // Locked, the link stays as it is; a participant who may only view follows links without the menu.
    expect(menuItems('shape', { ...linking, locked: true }).find((item) => item.command === 'link')).toMatchObject({ disabled: true })
    expect(labels('shape', { ...linking, readOnly: true })).toEqual(['Копировать', 'Комментировать'])
  })

  it('lets a participant who may only view comment, also on a field or an edge', () => {
    const viewing = { ...all, readOnly: true, canComment: true }

    expect(labels('shape', viewing)).toEqual(['Копировать', 'Комментировать'])
    expect(labels('field', viewing)).toEqual(['Комментировать'])
    expect(labels('edge', viewing)).toEqual(['Комментировать'])
  })
})
