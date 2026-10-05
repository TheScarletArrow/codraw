import { describe, expect, it } from 'vitest'
import { KEY_BINDINGS } from './editor.ts'
import { formatKeys, SHORTCUT_GROUPS, shortcutGroups } from './shortcuts.ts'

/** Keys of the help that are not keys of the key handler: clipboard events, the mouse and the help itself. */
const NOT_BOUND = /^(Mod\+[CXV]|\?)$|Click|Drag|Wheel/

describe('shortcuts', () => {
  it('describes exactly the keys the editor binds, with the same editing flag', () => {
    const help = new Map<string, boolean>()
    for (const entry of SHORTCUT_GROUPS.flatMap((group) => group.entries)) {
      for (const keys of entry.keys) {
        if (NOT_BOUND.test(keys)) continue
        const expanded = keys.includes('Arrows')
          ? ['Left', 'Up', 'Right', 'Down'].map((arrow) => keys.replace('Arrows', `Arrow${arrow}`))
          : [keys]
        expanded.forEach((key) => help.set(key, entry.editing ?? false))
      }
    }

    expect(Object.fromEntries(help)).toEqual(
      Object.fromEntries(KEY_BINDINGS.map((binding) => [binding.keys, binding.editing])),
    )
  })

  it('writes keys with Ctrl, Shift and Alt, or with the symbols of macOS in its order', () => {
    expect(formatKeys('Mod+Shift+Z', false)).toBe('Ctrl+Shift+Z')
    expect(formatKeys('Mod+Shift+Z', true)).toBe('⇧⌘Z')
    expect(formatKeys('Mod+D', true)).toBe('⌘D')
    expect(formatKeys('Delete', true)).toBe('⌫')
    expect(formatKeys('Shift+Arrows', false)).toBe('Shift+←↑→↓')
    expect(formatKeys('Shift+Arrows', true)).toBe('⇧←↑→↓')
    expect(formatKeys('Mod+Wheel', false)).toBe('Ctrl+колесо')
    expect(formatKeys('Mod+Wheel', true)).toBe('⌘+колесо')
    expect(formatKeys('Alt+Drag', true)).toBe('⌥+перетаскивание')
    expect(formatKeys('F2', true)).toBe('F2')
  })

  it('leaves the editing shortcuts out for a participant who may only view', () => {
    const actions = shortcutGroups(true).flatMap((group) => group.entries.map((entry) => entry.action))

    expect(actions).toContain('Копировать')
    expect(actions).toContain('Показать всё')
    expect(actions).not.toContain('Удалить')
    expect(actions).not.toContain('Дублировать')
    expect(shortcutGroups(true).map((group) => group.title)).not.toContain('Текст')
  })
})
