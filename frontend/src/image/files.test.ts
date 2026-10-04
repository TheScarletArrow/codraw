import { describe, expect, it } from 'vitest'
import { fileName } from '../lib/download.ts'
import { imageFileName, pngSize } from './files.ts'

describe('pngSize', () => {
  it('draws with double density', () => {
    expect(pngSize(300, 140)).toEqual({ width: 600, height: 280, scale: 2 })
  })

  it('lowers the density so that the longer side is 8192 pixels, keeping the proportions', () => {
    expect(pngSize(6000, 1500)).toEqual({ width: 8192, height: 2048, scale: 8192 / 6000 })
    expect(pngSize(1500, 6000)).toEqual({ width: 2048, height: 8192, scale: 8192 / 6000 })
  })

  it('keeps double density up to 4096 at 100%', () => {
    expect(pngSize(4096, 100)).toEqual({ width: 8192, height: 200, scale: 2 })
  })
})

describe('imageFileName', () => {
  it('names the image of a board with one page after the board', () => {
    expect(imageFileName('Архитектура', 'Страница 1', 1, 'png')).toBe('Архитектура.png')
  })

  it('adds the page name for a board with several pages', () => {
    expect(imageFileName('Архитектура', 'Контейнеры', 3, 'svg')).toBe('Архитектура — Контейнеры.svg')
  })

  it('replaces characters that file names do not allow', () => {
    expect(imageFileName('A/B: план?', 'C*D', 2, 'png')).toBe('A_B_ план_ — C_D.png')
  })
})

describe('fileName', () => {
  it('falls back to «Доска» for an empty name', () => {
    expect(fileName('  ', 'drawio')).toBe('Доска.drawio')
  })
})
