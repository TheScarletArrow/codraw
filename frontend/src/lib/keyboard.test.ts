import { describe, expect, it } from 'vitest'
import { isModLetter, latinKeyCode, latinLetter } from './keyboard.ts'

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

describe('latinKeyCode', () => {
  it('reads a letter of a layout without Latin letters as the letter of its key on the Latin one', () => {
    expect(latinKeyCode(key({ key: 'т', code: 'KeyN', keyCode: 0 }))).toBe(78)
    expect(latinKeyCode(key({ key: 'Т', code: 'KeyN', keyCode: 78, shiftKey: true }))).toBe(78)
    expect(latinKeyCode(key({ key: 'я', code: 'KeyZ', keyCode: 90, ctrlKey: true }))).toBe(90)
  })

  it('keeps the key code of Latin letters wherever their keys are, and of other keys', () => {
    // On the French layout the key of Q gives A.
    expect(latinKeyCode(key({ key: 'a', code: 'KeyQ', keyCode: 65 }))).toBe(65)
    expect(latinKeyCode(key({ key: 'Delete', code: 'Delete', keyCode: 46 }))).toBe(46)
    expect(latinKeyCode(key({ key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 }))).toBe(38)
    expect(latinKeyCode(key({ key: '1', code: 'Digit1', keyCode: 49 }))).toBe(49)
    expect(latinKeyCode(key({ keyCode: 75 }))).toBe(75)
  })
})
