import { describe, expect, it } from 'vitest'
import { menuItems, shortcutLabel, type MenuTarget } from './canvasMenu.ts'

const all = { canPaste: true, canUndo: true, canRedo: true }
const labels = (target: MenuTarget, availability = all) => menuItems(target, availability).map((item) => item.label)

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

  it('adds a field to a table right after its label', () => {
    expect(labels('table')).toEqual([
      'Изменить подпись',
      'Добавить поле',
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

  it('maps items to the commands of the editor with their shortcuts', () => {
    expect(menuItems('table', all).map(({ command, shortcut }) => [command, shortcut])).toEqual([
      ['editLabel', 'F2'],
      ['addField', undefined],
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

  it('lets a participant who may only view comment, also on a field or an edge', () => {
    const viewing = { ...all, readOnly: true, canComment: true }

    expect(labels('shape', viewing)).toEqual(['Копировать', 'Комментировать'])
    expect(labels('field', viewing)).toEqual(['Комментировать'])
    expect(labels('edge', viewing)).toEqual(['Комментировать'])
  })
})
