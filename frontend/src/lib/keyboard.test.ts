import { describe, expect, it } from 'vitest'
import { isModLetter, latinKeyCode } from './keyboard.ts'

const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init)

describe('keys in any layout', () => {
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

  it('reads Mod with a letter in the layout of the key', () => {
    expect(isModLetter(key({ key: 'а', code: 'KeyF', ctrlKey: true }), 'f', false)).toBe(true)
    expect(isModLetter(key({ key: 'f', code: 'KeyF', metaKey: true }), 'f', true)).toBe(true)
    expect(isModLetter(key({ key: 'f', code: 'KeyF', ctrlKey: true, shiftKey: true }), 'f', false)).toBe(false)
  })
})
