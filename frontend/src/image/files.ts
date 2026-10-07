import { fileName } from '../lib/download.ts'

/** Pixel densities of PNG images that the export offers. */
export const PNG_SCALES = [1, 2, 3, 4] as const

export type PngScale = (typeof PNG_SCALES)[number]

/** Pixel density of PNG images by default: sharp on screens of high density. */
export const DEFAULT_PNG_SCALE: PngScale = 2

/** The longest side of a PNG image; larger canvases fail in some browsers, and the diagram reads well anyway. */
export const MAX_PNG_SIDE = 8192

export type ImageFormat = 'png' | 'svg' | 'pdf'

/**
 * Size of the PNG image of a diagram of `width` × `height` at 100% drawn with `scale` pixels per point, and the density
 * it is drawn with: lower than `scale` when the longest side would exceed {@link MAX_PNG_SIDE}.
 */
export function pngSize(width: number, height: number, scale: number): { width: number; height: number; scale: number } {
  const density = Math.min(scale, MAX_PNG_SIDE / Math.max(width, height))
  return { width: Math.round(width * density), height: Math.round(height * density), scale: density }
}

/** The name of the image of a page: the board title, and the page name when the board has several pages. */
export function imageFileName(boardTitle: string, pageName: string, pageCount: number, format: ImageFormat): string {
  return fileName(pageCount > 1 ? `${boardTitle} — ${pageName}` : boardTitle, format)
}

/** Which pages of the board a PDF has. */
export type PdfPages = 'current' | 'all'

/** The name of a PDF: of the board for all its pages, as the image of the page for the current one. */
export function pdfFileName(boardTitle: string, pageName: string, pageCount: number, pages: PdfPages): string {
  return pages === 'all' ? fileName(boardTitle, 'pdf') : imageFileName(boardTitle, pageName, pageCount, 'pdf')
}
