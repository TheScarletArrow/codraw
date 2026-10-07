import monoBold from './pdfFonts/LiberationMono-Bold.ttf?url'
import monoBoldItalic from './pdfFonts/LiberationMono-BoldItalic.ttf?url'
import monoItalic from './pdfFonts/LiberationMono-Italic.ttf?url'
import monoRegular from './pdfFonts/LiberationMono-Regular.ttf?url'
import sansBold from './pdfFonts/LiberationSans-Bold.ttf?url'
import sansBoldItalic from './pdfFonts/LiberationSans-BoldItalic.ttf?url'
import sansItalic from './pdfFonts/LiberationSans-Italic.ttf?url'
import sansRegular from './pdfFonts/LiberationSans-Regular.ttf?url'
import serifBold from './pdfFonts/LiberationSerif-Bold.ttf?url'
import serifBoldItalic from './pdfFonts/LiberationSerif-BoldItalic.ttf?url'
import serifItalic from './pdfFonts/LiberationSerif-Italic.ttf?url'
import serifRegular from './pdfFonts/LiberationSerif-Regular.ttf?url'

/**
 * The fonts that PDF files embed, Liberation (SIL OFL 1.1, see `pdfFonts/OFL.txt`): without serifs, with serifs and
 * monospaced, with the widths of the letters of Arial, Times New Roman and Courier New.
 */
export type PdfFont = 'sans' | 'serif' | 'mono'

/** Styles of a font, as jsPDF names them. */
export type PdfFontStyle = 'normal' | 'bold' | 'italic' | 'bolditalic'

/** Names of the embedded fonts in the PDF and in the SVG that it is drawn from. */
export const PDF_FONT_NAMES: Record<PdfFont, string> = {
  sans: 'LiberationSans',
  serif: 'LiberationSerif',
  mono: 'LiberationMono',
}

/** Addresses of the files of the fonts, files of the build that are loaded only for a PDF. */
const PDF_FONT_FILES: Record<PdfFont, Record<PdfFontStyle, string>> = {
  sans: { normal: sansRegular, bold: sansBold, italic: sansItalic, bolditalic: sansBoldItalic },
  serif: { normal: serifRegular, bold: serifBold, italic: serifItalic, bolditalic: serifBoldItalic },
  mono: { normal: monoRegular, bold: monoBold, italic: monoItalic, bolditalic: monoBoldItalic },
}

/** Families of fonts that CoDraw knows, in lower case, by the font of the PDF that stands for them. */
const KNOWN_FAMILIES: Record<PdfFont, Set<string>> = {
  sans: new Set(['arial', 'helvetica', 'verdana', 'tahoma', 'trebuchet ms', 'liberation sans', 'arimo', 'sans-serif']),
  serif: new Set([
    'times new roman',
    'times',
    'georgia',
    'garamond',
    'palatino',
    'palatino linotype',
    'book antiqua',
    'cambria',
    'liberation serif',
    'tinos',
    'serif',
  ]),
  mono: new Set(['courier new', 'courier', 'consolas', 'lucida console', 'monaco', 'menlo', 'liberation mono', 'cousine', 'monospace']),
}

/**
 * The font of the PDF for a `font-family` of SVG, a list of families: that of the first family CoDraw knows. Fonts it
 * does not know are drawn without serifs, as the default font of the canvas.
 */
export function pdfFont(fontFamily: string): PdfFont {
  for (const family of fontFamily.split(',')) {
    const name = family.trim().replace(/^["']|["']$/g, '').toLowerCase()
    const font = (Object.keys(KNOWN_FAMILIES) as PdfFont[]).find((candidate) => KNOWN_FAMILIES[candidate].has(name))
    if (font) return font
  }
  return 'sans'
}

/** The style of the font of the PDF for `font-weight` and `font-style` of SVG; `null` is their default. */
export function pdfFontStyle(weight: string | null, style: string | null): PdfFontStyle {
  const bold = weight === 'bold' || weight === 'bolder' || Number(weight) >= 600
  const italic = style === 'italic' || style === 'oblique'
  return bold ? (italic ? 'bolditalic' : 'bold') : italic ? 'italic' : 'normal'
}

/** The address of the file of a font of the PDF. */
export function pdfFontFile(font: PdfFont, style: PdfFontStyle): string {
  return PDF_FONT_FILES[font][style]
}
