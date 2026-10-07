import { describe, expect, it } from 'vitest'
import { isModLetter, latinLetter } from './keyboard.ts'

const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init)

describe('latinLetter', () => {
  it('is the Latin letter a key types, in lower case', () => {
    expect(latinLetter(key({ key: 'c', code: 'KeyC' }))).toBe('c')
    expect(latinLetter(key({ key: 'V', code: 'KeyV' }))).toBe('v')
    // Dvorak types its own letters on the keys of QWERTY.
    expect(latinLetter(key({ key: 'j', code: 'KeyC' }))).toBe('j')
  })

  it('is the letter of the key on the Latin layout when the key types another character', () => {
    expect(latinLetter(key({ key: 'с', code: 'KeyC' }))).toBe('c')
    expect(latinLetter(key({ key: 'м', code: 'KeyV' }))).toBe('v')
    // Option on macOS.
    expect(latinLetter(key({ key: 'ç', code: 'KeyC' }))).toBe('c')
    expect(latinLetter(key({ key: '√', code: 'KeyV' }))).toBe('v')
  })

  it('is no letter for other keys', () => {
    expect(latinLetter(key({ key: 'Enter', code: 'Enter' }))).toBeNull()
    expect(latinLetter(key({ key: '1', code: 'Digit1' }))).toBeNull()
  })
})

describe('isModLetter', () => {
  it('takes Ctrl, or Cmd on macOS, with the letter in any layout, and neither Shift nor Alt', () => {
    expect(isModLetter(key({ key: 'f', code: 'KeyF', ctrlKey: true }), 'f', false)).toBe(true)
    expect(isModLetter(key({ key: 'а', code: 'KeyF', ctrlKey: true }), 'f', false)).toBe(true)
    expect(isModLetter(key({ key: 'f', code: 'KeyF', metaKey: true }), 'f', true)).toBe(true)
    expect(isModLetter(key({ key: 'f', code: 'KeyF', ctrlKey: true }), 'f', true)).toBe(false)
    expect(isModLetter(key({ key: 'f', code: 'KeyF', ctrlKey: true, altKey: true }), 'f', false)).toBe(false)
    expect(isModLetter(key({ key: 'F', code: 'KeyF', ctrlKey: true, shiftKey: true }), 'f', false)).toBe(false)
  })
})
