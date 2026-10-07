import * as Y from 'yjs'
import { boardImageOf, dataUriToBlob, IMAGE_PLACEHOLDER } from '../diagram/images.ts'
import { getCells, readCell } from '../diagram/model.ts'
import { listPages } from '../diagram/pages.ts'
import type { ExportedImage } from '../diagram/svgExport.ts'

const SVG_NS = 'http://www.w3.org/2000/svg'
const XLINK_NS = 'http://www.w3.org/1999/xlink'

/** How pictures go into a saved file. */
export interface InlineOptions {
  /**
   * Pictures at most this many times as large as they are drawn, re-encoded: a smaller file where the picture is drawn
   * small, e.g. in the live image. Without it pictures stay as they are.
   */
  maxScale?: number
  /** Types of pictures that stay as they are; other pictures become PNG. Without it every type stays. */
  types?: readonly string[]
}

/** The picture as a `data:` address with base64. */
export async function blobToDataUri(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  // In parts: spreading a large array into the arguments of a call overflows the stack.
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000))
  }
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`
}

/** The address is of this site, so the browser may download it with the session of the participant. */
function sameSite(url: string): boolean {
  try {
    return new URL(url, location.href).origin === location.origin
  } catch {
    return false
  }
}

/** The picture of an address of this site, from the cache of the browser when it has it; `null` when it cannot be had. */
export async function downloadPicture(url: string): Promise<Blob | null> {
  try {
    const response = await fetch(url, { credentials: 'same-origin', cache: 'force-cache' })
    return response.ok ? await response.blob() : null
  } catch {
    return null
  }
}

/**
 * The pictures of the board on all its pages, or on the page `pageId`, as `data:` addresses by their addresses, to write
 * them into a file: a `.drawio` file then needs no access to the board. Pictures that could not be downloaded, e.g.
 * without a connection, are left out, and the file keeps their addresses.
 */
export async function embeddedImages(doc: Y.Doc, pageId?: string): Promise<Map<string, string>> {
  const pages = pageId ? [pageId] : listPages(doc).map((page) => page.id)
  const urls = new Set<string>()
  for (const page of pages) {
    for (const [id, cell] of getCells(doc, page)) {
      const image = readCell(id, cell).style.image
      if (typeof image === 'string' && boardImageOf(image)) urls.add(image)
    }
  }
  const pictures = await Promise.all(
    [...urls].map(async (url) => {
      const picture = await downloadPicture(url)
      return [url, picture && (await blobToDataUri(picture))] as const
    }),
  )
  return new Map(pictures.filter((entry): entry is readonly [string, string] => entry[1] !== null))
}

/** The size of a picture to write: its own, or at most `maxScale` times the size it is drawn at. */
function encodedSize(natural: { width: number; height: number }, drawn: { width: number; height: number }, maxScale?: number) {
  if (!maxScale || drawn.width <= 0 || drawn.height <= 0) return natural
  const scale = Math.min(1, (drawn.width * maxScale) / natural.width, (drawn.height * maxScale) / natural.height)
  return { width: Math.max(1, Math.round(natural.width * scale)), height: Math.max(1, Math.round(natural.height * scale)) }
}

/**
 * The picture as a `data:` address, re-encoded when the options ask for it: smaller, or as PNG for a type that is not
 * kept. A browser that cannot draw it into a canvas writes it as it is.
 */
async function encode(picture: Blob, drawn: { width: number; height: number }, { maxScale, types }: InlineOptions) {
  const keepsType = !types || types.includes(picture.type)
  if (keepsType && !maxScale) return blobToDataUri(picture)
  try {
    const bitmap = await createImageBitmap(picture)
    const size = encodedSize(bitmap, drawn, maxScale)
    if (keepsType && size.width === bitmap.width && size.height === bitmap.height) {
      bitmap.close()
      return blobToDataUri(picture)
    }
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, size.width, size.height)
    bitmap.close()
    // A photo stays JPEG, which is much smaller; anything else becomes PNG, which keeps transparency.
    const type = keepsType && picture.type === 'image/jpeg' ? 'image/jpeg' : 'image/png'
    const encoded = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85))
    if (!encoded) return blobToDataUri(picture)
    return blobToDataUri(keepsType && encoded.size >= picture.size ? picture : encoded)
  } catch {
    return blobToDataUri(picture)
  }
}

/**
 * Writes the pictures of an SVG image into it: an `<image>` with an address of this site gets the picture as a `data:`
 * address, so that the file shows it without access to the board and a PNG drawn from it has it, and one that could not
 * be downloaded gets the placeholder of the canvas. Pictures at other sites stay addresses; pictures in `data:`
 * addresses stay, unless the options re-encode them.
 */
export async function inlineImages(svg: string, options: InlineOptions = {}): Promise<string> {
  const image = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const pictures = Array.from(image.getElementsByTagNameNS(SVG_NS, 'image'))
  if (pictures.length === 0) return svg
  const downloads = new Map<string, Promise<Blob | null>>()
  await Promise.all(
    pictures.map(async (element) => {
      const href = element.getAttributeNS(XLINK_NS, 'href') ?? element.getAttribute('href') ?? ''
      const embedded = href.startsWith('data:')
      if (!href || (!embedded && !sameSite(href))) return
      // A picture in an SVG image, e.g. an icon of draw.io, stays as it is.
      const picture = embedded ? dataUriToBlob(href) : await download(downloads, href)
      if (embedded && !picture) return
      const drawn = { width: Number(element.getAttribute('width')), height: Number(element.getAttribute('height')) }
      const uri = picture ? await encode(picture, drawn, options) : IMAGE_PLACEHOLDER
      if (uri === href) return
      element.removeAttribute('href')
      element.setAttributeNS(XLINK_NS, 'xlink:href', uri)
      if (!picture) element.setAttribute('preserveAspectRatio', 'xMidYMid meet')
    }),
  )
  return new XMLSerializer().serializeToString(image)
}

/** Each address once, however many times the image draws it. */
function download(downloads: Map<string, Promise<Blob | null>>, url: string): Promise<Blob | null> {
  let picture = downloads.get(url)
  if (!picture) {
    picture = downloadPicture(url)
    downloads.set(url, picture)
  }
  return picture
}

/** The image with its pictures in it; see {@link inlineImages}. */
export async function withInlinedImages<T extends Pick<ExportedImage, 'svg'>>(image: T, options: InlineOptions = {}): Promise<T> {
  return { ...image, svg: await inlineImages(image.svg, options) }
}

/** Types of pictures that PDF keeps; GIF and WebP become PNG. */
export const PDF_IMAGE_TYPES: readonly string[] = ['image/png', 'image/jpeg']
