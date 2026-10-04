import { fileName } from '../lib/download.ts'

/** Pixel density of PNG images: sharp on screens of high density. */
export const PNG_SCALE = 2

/** The longest side of a PNG image; larger canvases fail in some browsers, and the diagram reads well anyway. */
export const MAX_PNG_SIDE = 8192

export type ImageFormat = 'png' | 'svg'

/** Size of the PNG image of a diagram of `width` × `height` at 100%, and the density it is drawn with. */
export function pngSize(width: number, height: number): { width: number; height: number; scale: number } {
  const scale = Math.min(PNG_SCALE, MAX_PNG_SIDE / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale), scale }
}

/** The name of the image of a page: the board title, and the page name when the board has several pages. */
export function imageFileName(boardTitle: string, pageName: string, pageCount: number, format: ImageFormat): string {
  return fileName(pageCount > 1 ? `${boardTitle} — ${pageName}` : boardTitle, format)
}
