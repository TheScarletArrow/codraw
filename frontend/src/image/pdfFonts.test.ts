import { describe, expect, it } from 'vitest'
import { FONT_FAMILIES } from '../diagram/fonts.ts'
import { pdfFont, pdfFontFile, pdfFontStyle, type PdfFont, type PdfFontStyle } from './pdfFonts.ts'

describe('fonts of PDF files', () => {
  it('stands in for the fonts of the toolbar with fonts of the same kind', () => {
    expect(Object.fromEntries(FONT_FAMILIES.map((family) => [family, pdfFont(family)]))).toEqual({
      Arial: 'sans',
      Verdana: 'sans',
      Tahoma: 'sans',
      'Trebuchet MS': 'sans',
      Georgia: 'serif',
      'Times New Roman': 'serif',
      'Courier New': 'mono',
    })
  })

  it('takes the first family it knows from a list, and draws unknown fonts without serifs', () => {
    expect(pdfFont('Arial,Helvetica,sans-serif')).toBe('sans')
    expect(pdfFont('"Roboto Slab", Georgia, serif')).toBe('serif')
    expect(pdfFont("'JetBrains Mono', monospace")).toBe('mono')
    expect(pdfFont('Comic Sans MS')).toBe('sans')
    expect(pdfFont('')).toBe('sans')
  })

  it('reads bold and italic from the weight and the style of SVG text', () => {
    expect(pdfFontStyle(null, null)).toBe('normal')
    expect(pdfFontStyle('bold', null)).toBe('bold')
    expect(pdfFontStyle(null, 'italic')).toBe('italic')
    expect(pdfFontStyle('bold', 'italic')).toBe('bolditalic')
    expect(pdfFontStyle('700', 'oblique')).toBe('bolditalic')
    expect(pdfFontStyle('400', 'normal')).toBe('normal')
  })

  it('has a file of each style of each font', () => {
    const fonts: PdfFont[] = ['sans', 'serif', 'mono']
    const styles: PdfFontStyle[] = ['normal', 'bold', 'italic', 'bolditalic']
    const files = fonts.flatMap((font) => styles.map((style) => pdfFontFile(font, style)))

    expect(new Set(files).size).toBe(12)
    expect(pdfFontFile('serif', 'bolditalic')).toMatch(/LiberationSerif-BoldItalic.*\.ttf$/)
    expect(pdfFontFile('mono', 'normal')).toMatch(/LiberationMono-Regular.*\.ttf$/)
  })
})
