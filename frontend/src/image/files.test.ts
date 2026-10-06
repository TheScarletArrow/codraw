import { describe, expect, it } from 'vitest'
import { fileName } from '../lib/download.ts'
import { imageFileName, MAX_PNG_SIDE, pdfFileName, pngSize } from './files.ts'

describe('image files', () => {
  it('draws a PNG with the chosen density', () => {
    expect(pngSize(300, 200, 2)).toEqual({ width: 600, height: 400, scale: 2 })
    expect(pngSize(300, 200, 3)).toEqual({ width: 900, height: 600, scale: 3 })
  })

  it('lowers the density of a large diagram so that its longest side fits', () => {
    expect(pngSize(6000, 1500, 2)).toEqual({ width: MAX_PNG_SIDE, height: 2048, scale: MAX_PNG_SIDE / 6000 })
    expect(pngSize(1000, 5000, 4)).toEqual({ width: 1638, height: MAX_PNG_SIDE, scale: MAX_PNG_SIDE / 5000 })
  })

  it('names the image after the board, and after the page on a board of several pages', () => {
    expect(imageFileName('Архитектура', 'Страница 1', 1, 'png')).toBe('Архитектура.png')
    expect(imageFileName('Архитектура', 'Контейнеры', 3, 'svg')).toBe('Архитектура — Контейнеры.svg')
  })

  it('names the PDF of a page as its image, and the PDF of all pages after the board', () => {
    expect(pdfFileName('Архитектура', 'Страница 1', 1, 'current')).toBe('Архитектура.pdf')
    expect(pdfFileName('Архитектура', 'Контейнеры', 3, 'current')).toBe('Архитектура — Контейнеры.pdf')
    expect(pdfFileName('Архитектура', 'Контейнеры', 3, 'all')).toBe('Архитектура.pdf')
    expect(pdfFileName('A/B', 'Контейнеры', 3, 'all')).toBe('A_B.pdf')
  })

  it('replaces characters that file systems do not allow', () => {
    expect(fileName('A/B: C?', 'png')).toBe('A_B_ C_.png')
    expect(fileName('  ', 'svg')).toBe('Доска.svg')
  })
})
