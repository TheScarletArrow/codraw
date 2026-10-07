import type { Cell } from '@maxgraph/core'
import type { CellData } from './model.ts'
import type { ShapeStyle } from './shapes.ts'

/** An image that the board stores: its address from the root of the site and its size in pixels. */
export interface StoredImage {
  url: string
  width: number
  height: number
}

/**
 * Where the images of a canvas go: the board, or the draft of a proposal of the participant. The host checks a file,
 * uploads it and shows how the upload goes and why it failed.
 */
export interface ImageHost {
  /** Stores the image; resolves to it, or to `null` when it was not stored, which the host has told the participant. */
  store(image: Blob, name?: string): Promise<StoredImage | null>
  /** The address is an image of this board, which a copy needs no new upload for. */
  holds(url: string): boolean
}

/** Formats of images that boards take, the types of their files. */
export const IMAGE_FILE_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

/** The largest width and height of a new image on the canvas; a larger picture shrinks to fit, keeping its proportions. */
export const MAX_IMAGE_SIDE = 600

/** Room between images added together, which stand in a row. */
export const IMAGE_GAP = 20

/** A picture that did not load: a grey frame with a picture in it, as large as fits the shape. */
export const IMAGE_PLACEHOLDER =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect x="1" y="1" width="46" height="46" rx="6" fill="#f6f8fa" stroke="#afb8c1" stroke-width="1.5" stroke-dasharray="4 3"/><g fill="none" stroke="#8c959f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="13" y="15" width="22" height="18" rx="2"/><circle cx="19.5" cy="21" r="2"/><path d="M35 29l-6-6-11 10"/></g></svg>',
  )

/** At most this many images are uploaded at once when a diagram brings many. */
const PARALLEL_UPLOADS = 4

/**
 * The style of an image shape, as draw.io inserts pictures: the picture fills the shape (`imageAspect=0`), the shape
 * keeps its proportions when resized (`aspect=fixed`), and the label goes under it.
 */
export function imageStyle(url: string): ShapeStyle {
  return {
    shape: 'image',
    image: url,
    aspect: 'fixed',
    imageAspect: false,
    verticalLabelPosition: 'bottom',
    verticalAlign: 'top',
  } as ShapeStyle
}

/** The cell is an image shape of draw.io or CoDraw. */
export function isImageStyle(style: Record<string, unknown> | null | undefined): boolean {
  return style?.shape === 'image' && typeof style.image === 'string' && style.image !== ''
}

/** The size of a new image shape: that of the picture in pixels, shrunk to fit `max` × `max`, in whole units. */
export function fittedImageSize(width: number, height: number, max = MAX_IMAGE_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / width, max / height)
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

const BOARD_IMAGE_PATH = /^\/api\/boards\/([0-9a-f-]{36})\/images\/([0-9a-f-]{36})$/i

/** The address of an image of a board, from the root of the site. */
export function boardImageUrl(boardId: string, imageId: string): string {
  return `/api/boards/${boardId}/images/${imageId}`
}

/**
 * The board and the image that an address names: a path from the root of the site, or a full address of this site;
 * `null` for anything else, e.g. an address of another site or a `data:` image.
 */
export function boardImageOf(url: string): { boardId: string; imageId: string } | null {
  let path = url
  if (!url.startsWith('/')) {
    if (!/^https?:\/\//i.test(url) || typeof location === 'undefined') return null
    try {
      const parsed = new URL(url)
      if (parsed.origin !== location.origin) return null
      path = parsed.pathname
    } catch {
      return null
    }
  }
  const match = BOARD_IMAGE_PATH.exec(path)
  return match ? { boardId: match[1]!.toLowerCase(), imageId: match[2]!.toLowerCase() } : null
}

/** A raster image written into its address, which a board stores instead; SVG stays where it is. */
const RASTER_DATA_URI = /^data:(image\/(?:png|jpe?g|gif|webp));base64,([A-Za-z0-9+/=\s]+)$/i

/** The image that a `data:` address holds, or `null` for an address that holds no raster image. */
export function dataUriToBlob(url: string): Blob | null {
  const match = RASTER_DATA_URI.exec(url)
  if (!match) return null
  try {
    const binary = atob(match[2]!.replace(/\s/g, ''))
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return new Blob([bytes], { type: match[1]!.toLowerCase().replace('image/jpg', 'image/jpeg') })
  } catch {
    return null
  }
}

/**
 * The address names a picture that the board must store for its participants to see it: a raster image in a `data:`
 * address, or an image of another board of this site. Addresses of other sites stay: the browser does not show them
 * (Content Security Policy), and nobody downloads them.
 */
export function needsStoring(url: string, host: ImageHost): boolean {
  return RASTER_DATA_URI.test(url) || (boardImageOf(url) !== null && !host.holds(url))
}

/**
 * Whether a paste with these text and HTML of the clipboard and a picture in it is the picture: without text, or with
 * only the picture in the HTML, as browsers copy an image. Office programs put a picture of cells beside their text,
 * which is pasted as text.
 */
export function pastesAsImage(text: string, html: string): boolean {
  if (text.trim() === '') return true
  return /^\s*(<meta[^>]*>\s*)*(<html>\s*<body>\s*)?(<!--StartFragment-->\s*)?<img\b[^>]*>\s*(<!--EndFragment-->\s*)?(<\/body>\s*<\/html>\s*)?$/i.test(html)
}

/** The files of a paste or a drop; `[]` without them. */
export function filesOf(data: DataTransfer | null | undefined): File[] {
  return data ? Array.from(data.files ?? []) : []
}

/** The picture behind an address that needs storing: decoded from `data:`, or downloaded from the other board. */
async function pictureOf(url: string): Promise<Blob | null> {
  const data = dataUriToBlob(url)
  if (data) return data
  try {
    const response = await fetch(url, { credentials: 'same-origin' })
    return response.ok ? await response.blob() : null
  } catch {
    return null
  }
}

/**
 * Stores the pictures of the addresses `urls` that need storing on the board of `host` (see {@link needsStoring}), each
 * once, a few at a time. Resolves to the address on the board of each stored one; a picture that could not be stored is
 * left out, and its cell keeps its address.
 */
export async function storeImages(urls: Iterable<string>, host: ImageHost): Promise<Map<string, string>> {
  const pending = [...new Set(urls)].filter((url) => needsStoring(url, host))
  const stored = new Map<string, string>()
  const worker = async () => {
    for (let url = pending.shift(); url !== undefined; url = pending.shift()) {
      const picture = await pictureOf(url)
      const image = picture && (await host.store(picture))
      if (image) stored.set(url, image.url)
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL_UPLOADS, pending.length) }, worker))
  return stored
}

/** Stores the pictures that the cells of pages, e.g. of a `.drawio` file, need on the board, and points the cells at them. */
export async function storePageImages(pages: { cells: CellData[] }[], host: ImageHost): Promise<void> {
  const cells = pages.flatMap((page) => page.cells)
  const imageOf = (cell: CellData) => (typeof cell.style.image === 'string' ? cell.style.image : null)
  const stored = await storeImages(cells.flatMap((cell) => imageOf(cell) ?? []), host)
  for (const cell of cells) {
    const url = imageOf(cell)
    const replaced = url === null ? undefined : stored.get(url)
    if (replaced) cell.style.image = replaced
  }
}

/** Addresses of the pictures of the cells and of their descendants. */
export function cellImageUrls(cells: Cell[]): string[] {
  return cells.flatMap((cell) => {
    const image = cell.getStyle().image
    return [...(typeof image === 'string' && image ? [image] : []), ...cellImageUrls(cell.getChildren())]
  })
}

/** Points the cells and their descendants at the stored pictures, by their addresses before. */
export function replaceCellImages(cells: Cell[], stored: ReadonlyMap<string, string>) {
  for (const cell of cells) {
    const image = cell.getStyle().image
    const replaced = typeof image === 'string' ? stored.get(image) : undefined
    if (replaced) cell.setStyle({ ...cell.getStyle(), image: replaced })
    replaceCellImages(cell.getChildren(), stored)
  }
}
