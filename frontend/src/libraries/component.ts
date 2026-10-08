import type { ComponentDraft } from '../api/libraries.ts'
import { COMPONENT_NAME_MAX_LENGTH } from '../api/libraries.ts'
import { cellsModelXml } from '../drawio/serialize.ts'
import { cellsXml } from '../diagram/clipboardFormat.ts'
import type { DiagramEditor } from '../diagram/editor.ts'
import { boardImageOf, cellImageUrls, fittedImageSize, IMAGE_FILE_TYPES, imageStyle, replaceCellImages } from '../diagram/images.ts'
import { LAYER_CELL_ID, type CellData } from '../diagram/model.ts'
import { blobToDataUri, downloadPicture } from '../image/inlineImages.ts'
import { libraryImageTooLarge, UNSUPPORTED_LIBRARY_IMAGE } from './messages.ts'
import { pictureSize } from './pictureSize.ts'
import { previewOf, previewOfImage } from './preview.ts'
import { cleanSvg, iconSize, svgDataUri } from './svgIcon.ts'

/** Types of files that libraries take: the pictures of boards, and SVG. */
export const LIBRARY_FILE_TYPES: readonly string[] = [...IMAGE_FILE_TYPES, 'image/svg+xml']

/** A picture of the selection that the browser could not download from the board, e.g. without a connection. */
export class MissingPicturesError extends Error {
  constructor() {
    super('The pictures of the selection could not be downloaded')
    this.name = 'MissingPicturesError'
  }
}

/** A name of a component as the backend keeps it: without spaces around it, not longer than it allows. */
export function componentName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, COMPONENT_NAME_MAX_LENGTH).trim()
}

/**
 * The selection of the editor as a component of a library, named `name` or after the selection: what copying takes,
 * with the pictures of boards written into it, so that it shows them without access to the board, and a preview.
 * `null` when nothing is selected that copying takes; rejects with {@link MissingPicturesError} when a picture of the
 * board could not be downloaded.
 */
export async function selectionDraft(editor: DiagramEditor, name?: string): Promise<ComponentDraft | null> {
  const selection = editor.selectionComponent()
  if (!selection) return null
  const urls = [...new Set(cellImageUrls(selection.cells))].filter((url) => boardImageOf(url) !== null)
  const pictures = await Promise.all(
    urls.map(async (url) => {
      const picture = await downloadPicture(url)
      return [url, picture && (await blobToDataUri(picture))] as const
    }),
  )
  if (pictures.some(([, uri]) => !uri)) throw new MissingPicturesError()
  replaceCellImages(selection.cells, new Map(pictures as (readonly [string, string])[]))
  return {
    name: componentName(name ?? selection.name) || 'Компонент',
    content: cellsXml(selection.cells),
    preview: selection.image ? await previewOfImage(selection.image) : null,
  }
}

const isSvg = (file: File) => file.type === 'image/svg+xml' || (file.type === '' && /\.svg$/i.test(file.name))

/**
 * A picture file as a component of a library: an image shape of the picture inside it, of the size of the picture but
 * not larger than 600 × 600 for a raster picture, of the size of the SVG for one; named after the file. A string tells
 * why the file does not fit: another format, a broken file, or larger than `imageLimit` bytes.
 */
export async function fileDraft(file: File, imageLimit: number): Promise<ComponentDraft | string> {
  const svg = isSvg(file)
  if (!svg && !IMAGE_FILE_TYPES.includes(file.type)) return UNSUPPORTED_LIBRARY_IMAGE
  if (file.size > imageLimit) return libraryImageTooLarge(imageLimit)
  let picture: string
  let size: { width: number; height: number }
  if (svg) {
    const icon = cleanSvg(await file.text())
    if (!icon) return 'Файл не похож на SVG'
    picture = svgDataUri(icon.svg)
    size = iconSize(icon.width, icon.height, 600)
  } else {
    const natural = pictureSize(new Uint8Array(await file.arrayBuffer()))
    if (!natural) return UNSUPPORTED_LIBRARY_IMAGE
    picture = await blobToDataUri(file)
    size = fittedImageSize(natural.width, natural.height)
  }
  const content = cellsModelXml([
    {
      id: '2',
      kind: 'vertex',
      parent: LAYER_CELL_ID,
      order: '',
      value: '',
      geometry: { x: 0, y: 0, ...size },
      source: null,
      target: null,
      style: imageStyle(picture) as CellData['style'],
    },
  ])
  return {
    name: componentName(file.name.replace(/\.[^.]+$/, '')) || 'Изображение',
    content,
    preview: await previewOf(picture),
  }
}
