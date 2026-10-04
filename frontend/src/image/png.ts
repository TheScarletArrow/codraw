import type { ExportedImage } from '../diagram/svgExport.ts'
import { pngSize } from './files.ts'

/** Draws an SVG image into a PNG of {@link pngSize}: the browser rasterizes the vector image at that size. */
export async function svgToPng(image: ExportedImage): Promise<Blob> {
  const { width, height } = pngSize(image.width, image.height)
  // No foreign objects and no external resources: the canvas stays clean, so the browser lets it be read.
  const url = URL.createObjectURL(new Blob([image.svg], { type: 'image/svg+xml' }))
  try {
    const picture = new Image()
    await new Promise<void>((resolve, reject) => {
      picture.onload = () => resolve()
      picture.onerror = () => reject(new Error('The SVG image could not be loaded'))
      picture.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d')!.drawImage(picture, 0, 0, width, height)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The PNG image could not be made'))), 'image/png'),
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}
