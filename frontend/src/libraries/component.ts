import type { ComponentDraft } from '../api/libraries.ts'
import { COMPONENT_NAME_MAX_LENGTH } from '../api/libraries.ts'
import { megabytes } from '../board/imageUploads.ts'
import { cellsModelXml } from '../drawio/serialize.ts'
import { cellsXml } from '../diagram/clipboardFormat.ts'
import type { DiagramEditor } from '../diagram/editor.ts'
import { boardImageOf, cellImageUrls, fittedImageSize, IMAGE_FILE_TYPES, imageStyle, replaceCellImages } from '../diagram/images.ts'
import { LAYER_CELL_ID, type CellData } from '../diagram/model.ts'
import { blobToDataUri, downloadPicture } from '../image/inlineImages.ts'
import { libraryMessages as m } from './messages.ts'
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

/**
 * A picture of the selection at an address that is neither inside it nor at another site, e.g. a stencil of draw.io
 * (`img/lib/…`), which the canvas cannot show either; a library keeps no such reference.
 */
export class OutsidePicturesError extends Error {
  constructor() {
    super('The selection has pictures at addresses that a library does not keep')
    this.name = 'OutsidePicturesError'
  }
}

/** An SVG written into its address, as draw.io and CoDraw write them: base64, or encoded as an address. */
const SVG_DATA_URI = /^data:image\/svg\+xml(;base64)?,(.*)$/is

/** The text of an SVG in a `data:` address; `null` for one that cannot be decoded. */
function svgOf(url: string): string | null {
  const match = SVG_DATA_URI.exec(url)
  if (!match) return null
  try {
    if (match[1] || /^[A-Za-z0-9+/=\s]*$/.test(match[2]!)) {
      const binary = atob(match[2]!.replace(/\s/g, ''))
      return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)))
    }
    return decodeURIComponent(match[2]!)
  } catch {
    return null
  }
}

/**
 * The picture that a library keeps instead of the address `url` of a picture of the selection: a picture of a board
 * downloaded into a `data:` address, an SVG cleaned (see {@link cleanSvg}); `undefined` for one that stays as it is (a
 * raster `data:` picture, an address of another site), `null` for one that cannot be kept.
 */
async function keptPicture(url: string): Promise<string | null | undefined> {
  if (boardImageOf(url)) {
    const picture = await downloadPicture(url)
    if (!picture) throw new MissingPicturesError()
    return blobToDataUri(picture)
  }
  if (/^https?:\/\//i.test(url) || /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(url)) return undefined
  const svg = SVG_DATA_URI.test(url) ? svgOf(url) : null
  const icon = svg === null ? null : cleanSvg(svg)
  return icon ? svgDataUri(icon.svg) : null
}

/** A name of a component as the backend keeps it: without spaces around it, not longer than it allows. */
export function componentName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, COMPONENT_NAME_MAX_LENGTH).trim()
}

/**
 * The selection of the editor as a component of a library, named `name` or after the selection: what copying takes,
 * with the pictures of boards written into it, so that it shows them without access to the board, its SVG pictures
 * cleaned as the backend expects, and a preview. `null` when nothing is selected that copying takes; rejects with
 * {@link MissingPicturesError} when a picture of the board could not be downloaded, and with
 * {@link OutsidePicturesError} for a picture that a library cannot keep.
 */
export async function selectionDraft(editor: DiagramEditor, name?: string): Promise<ComponentDraft | null> {
  const selection = editor.selectionComponent()
  if (!selection) return null
  const urls = [...new Set(cellImageUrls(selection.cells))]
  const pictures = await Promise.all(urls.map(async (url) => [url, await keptPicture(url)] as const))
  if (pictures.some(([, kept]) => kept === null)) throw new OutsidePicturesError()
  const kept = pictures.filter((entry): entry is readonly [string, string] => typeof entry[1] === 'string')
  replaceCellImages(selection.cells, new Map(kept))
  return {
    name: componentName(name ?? selection.name) || m.component,
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
  if (!svg && !IMAGE_FILE_TYPES.includes(file.type)) return m.unsupportedImage
  if (file.size > imageLimit) return m.imageTooLarge(megabytes(imageLimit))
  let picture: string
  let size: { width: number; height: number }
  if (svg) {
    const icon = cleanSvg(await file.text())
    if (!icon) return m.notSvg
    picture = svgDataUri(icon.svg)
    size = iconSize(icon.width, icon.height, 600)
  } else {
    const natural = pictureSize(new Uint8Array(await file.arrayBuffer()))
    if (!natural) return m.unsupportedImage
    // Of the type its bytes have: a JPEG named «.png» is still a JPEG, which the backend checks.
    picture = await blobToDataUri(new Blob([file], { type: natural.type }))
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
    name: componentName(file.name.replace(/\.[^.]+$/, '')) || m.image,
    content,
    preview: await previewOf(picture),
  }
}
