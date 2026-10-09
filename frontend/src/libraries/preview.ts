import type { ExportedImage } from '../diagram/svgExport.ts'
import { blobToDataUri, inlineImages } from '../image/inlineImages.ts'

/** The size of a preview in pixels: twice the box it is shown in by the panel of shapes. */
export const PREVIEW_WIDTH = 192
export const PREVIEW_HEIGHT = 144

/** The largest preview the backend keeps, in bytes of its PNG. */
export const PREVIEW_MAX_BYTES = 128 * 1024

/** How long a preview waits for the browser to draw its picture. */
export const PREVIEW_WAIT = 3_000

/**
 * A small PNG of a picture that the browser loads as `<img>` (an address, a `data:` or `blob:` one), fitted into
 * {@link PREVIEW_WIDTH} × {@link PREVIEW_HEIGHT} with its proportions, as a `data:` address. `null` when the browser
 * does not draw it in {@link PREVIEW_WAIT} or the PNG is larger than {@link PREVIEW_MAX_BYTES}: a component without a
 * preview shows an icon.
 */
export async function previewOf(src: string): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), PREVIEW_WAIT)))
  try {
    return await Promise.race([draw(src), timeout])
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function draw(src: string): Promise<string | null> {
  const picture = new Image()
  await new Promise<void>((resolve, reject) => {
    picture.onload = () => resolve()
    picture.onerror = () => reject(new Error('The picture could not be loaded'))
    picture.src = src
  })
  const width = picture.naturalWidth || PREVIEW_WIDTH
  const height = picture.naturalHeight || PREVIEW_HEIGHT
  const scale = Math.min(PREVIEW_WIDTH / width, PREVIEW_HEIGHT / height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const context = canvas.getContext('2d')
  if (!context) return null
  context.drawImage(picture, 0, 0, canvas.width, canvas.height)
  const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  return png && png.size <= PREVIEW_MAX_BYTES ? blobToDataUri(png) : null
}

/** A preview of an image of cells (see {@link previewOf}), with the pictures of boards in it. */
export async function previewOfImage(image: Pick<ExportedImage, 'svg'>): Promise<string | null> {
  const svg = await inlineImages(image.svg)
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    return await previewOf(url)
  } finally {
    URL.revokeObjectURL(url)
  }
}
