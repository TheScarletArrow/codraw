import * as Y from 'yjs'
import { getCheckSettings } from '../checks/checks.ts'
import { boardImageOf, dataUriToBlob } from '../diagram/images.ts'
import { LOCKED_BY_KEY } from '../diagram/locks.ts'
import {
  cellElementId,
  compareCells,
  ELEMENT_STYLE_KEYS,
  getCells,
  getElements,
  getPages,
  LAYER_CELL_ID,
  readAttrs,
  readPage,
  ROOT_CELL_ID,
  type CellMap,
  type ElementField,
  type GeometryData,
  type PointData,
  type StyleValue,
} from '../diagram/model.ts'
import { listPages } from '../diagram/pages.ts'
import { isElementStatus, STATUS_KEY } from '../diagram/status.ts'
import { viewRuleData } from '../diagram/viewRule.ts'
import { downloadPicture } from '../image/inlineImages.ts'
import { crc32, zipFiles, type ZipFile } from '../lib/zip.ts'
import {
  BOARD_FILE_FORMAT,
  BOARD_FILE_VERSION,
  BOARD_JSON,
  IMAGE_EXTENSIONS,
  IMAGES_FOLDER,
  type BoardFileJson,
  type FileCell,
  type FileElement,
  type FileGeometry,
  type FilePage,
} from './format.ts'

/** Keys of the style that name who did something: the board keeps them, a file does not. */
const PERSONAL_STYLE_KEYS: ReadonlySet<string> = new Set([LOCKED_BY_KEY])

const ELEMENT_FIELDS = Object.keys(ELEMENT_STYLE_KEYS) as ElementField[]

/**
 * The board of `doc` as `board.json`. `images` gives the path in the archive of each picture the file carries, by its
 * address on the board; a picture without one keeps its address.
 */
export function boardFileJson(doc: Y.Doc, title: string, images: ReadonlyMap<string, string> = new Map()): BoardFileJson {
  const named = new Set<string>()
  const used = new Set<string>()
  const pages = listPages(doc).map((info): FilePage => {
    const page = readPage(getPages(doc).get(info.id)!)
    const cells = drawingOrder(getCells(doc, info.id)).map(({ id, cell, parent }) => {
      const element = cellElementId(cell)
      if (element !== null) named.add(element)
      return fileCell(id, cell, parent, (url) => {
        const path = images.get(url)
        if (path !== undefined) used.add(path)
        return path
      })
    })
    return {
      id: info.id,
      name: page.name,
      ...(page.detailOf && { detailOf: { ...page.detailOf } }),
      ...(page.view && {
        view: {
          rule: viewRuleData(page.view.rule),
          ...(page.view.hidden.length > 0 && { hidden: [...page.view.hidden] }),
          ...(Object.keys(page.view.places).length > 0 && { places: structuredClone(page.view.places) }),
        },
      }),
      cells,
    }
  })
  const elements = fileElements(doc, named)
  const checks = fileChecks(doc)
  return {
    format: BOARD_FILE_FORMAT,
    version: BOARD_FILE_VERSION,
    title,
    pages,
    ...(Object.keys(elements).length > 0 && { elements }),
    ...(Object.keys(checks).length > 0 && { checks }),
    ...(used.size > 0 && { images: [...used].sort(byNumber) }),
  }
}

/** `images/2.png` before `images/10.png`. */
const byNumber = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true })

interface Placed {
  id: string
  cell: CellMap
  /** The parent as the canvas has it: the root for a layer, the main layer for a cell whose parent is gone. */
  parent: string
}

/**
 * The cells of a page but the root, as the canvas draws them: the layers in their order, each cell followed by its
 * children in their order. A cell whose parent the page does not have lies in the main layer, as on the canvas.
 */
function drawingOrder(cells: Y.Map<CellMap>): Placed[] {
  const entries = Array.from(cells.entries()).filter(
    ([id, cell]) => id !== ROOT_CELL_ID && cell instanceof Y.Map && cell.get('kind') !== 'root',
  )
  const parentOf = new Map<string, string>()
  for (const [id, cell] of entries) {
    const parent = cell.get('parent')
    const own = typeof parent === 'string' && parent !== ROOT_CELL_ID && parent !== id && cells.has(parent) ? parent : null
    parentOf.set(id, cell.get('kind') === 'layer' ? ROOT_CELL_ID : (own ?? LAYER_CELL_ID))
  }
  const children = new Map<string, { id: string; order: string; cell: CellMap }[]>()
  for (const [id, cell] of entries) {
    const parent = parentOf.get(id)!
    const order = cell.get('order')
    const siblings = children.get(parent) ?? []
    siblings.push({ id, order: typeof order === 'string' ? order : '', cell })
    children.set(parent, siblings)
  }
  children.forEach((siblings) => siblings.sort(compareCells))

  const placed: Placed[] = []
  const seen = new Set<string>()
  const visit = (parent: string) => {
    for (const { id, cell } of children.get(parent) ?? []) {
      if (seen.has(id)) continue
      seen.add(id)
      placed.push({ id, cell, parent: parentOf.get(id)! })
      visit(id)
    }
  }
  visit(ROOT_CELL_ID)
  // Cells that only lead to each other through their parents: the canvas puts them into the main layer.
  for (const [id, cell] of entries) {
    if (seen.has(id)) continue
    seen.add(id)
    parentOf.set(id, LAYER_CELL_ID)
    placed.push({ id, cell, parent: LAYER_CELL_ID })
    visit(id)
  }
  return placed
}

/** The path in the archive of the picture of an address, `undefined` for a picture the file does not carry. */
type ImagePath = (url: string) => string | undefined

function fileCell(id: string, cell: CellMap, parent: string, imagePath: ImagePath): FileCell {
  const kind = cell.get('kind')
  const value = cell.get('value')
  const geometry = cell.get('geometry') as GeometryData | null | undefined
  const source = cell.get('source')
  const target = cell.get('target')
  const style = fileStyle(cell.get('style'), imagePath)
  const attrs = readAttrs(cell)
  const status = cell.get(STATUS_KEY)
  const layer = kind === 'layer'
  const compact = geometry ? fileGeometry(geometry) : null
  return {
    id,
    ...((kind === 'edge' || layer) && { kind }),
    ...(parent !== (layer ? ROOT_CELL_ID : LAYER_CELL_ID) && { parent }),
    ...(typeof value === 'string' && value !== '' && { value }),
    ...(compact && { geometry: compact }),
    ...(typeof source === 'string' && source !== '' && { source }),
    ...(typeof target === 'string' && target !== '' && { target }),
    ...(Object.keys(style).length > 0 && { style }),
    ...(Object.keys(attrs).length > 0 && { attrs }),
    ...(isElementStatus(status) && { status }),
  }
}

/** The own style of a cell without the keys of who did something, its pictures at their paths in the archive. */
function fileStyle(style: unknown, imagePath: ImagePath): Record<string, StyleValue> {
  if (!(style instanceof Y.Map)) return {}
  const own = style.toJSON() as Record<string, StyleValue>
  const result: Record<string, StyleValue> = {}
  for (const [key, value] of Object.entries(own)) {
    if (PERSONAL_STYLE_KEYS.has(key) || value === undefined || value === null) continue
    result[key] = key === 'image' && typeof value === 'string' ? (imagePath(value) ?? value) : value
  }
  return result
}

const copyPoint = ({ x, y }: PointData): PointData => ({ x, y })

/** The geometry without zeros and `false`; an empty one is left out of the cell as a whole. */
function fileGeometry(geometry: GeometryData): FileGeometry | null {
  const result: FileGeometry = {}
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    const value = geometry[key]
    if (typeof value === 'number' && Number.isFinite(value) && value !== 0) result[key] = value
  }
  if (geometry.relative) result.relative = true
  if (geometry.points && geometry.points.length > 0) result.points = geometry.points.map(copyPoint)
  if (geometry.offset) result.offset = copyPoint(geometry.offset)
  if (geometry.sourcePoint) result.sourcePoint = copyPoint(geometry.sourcePoint)
  if (geometry.targetPoint) result.targetPoint = copyPoint(geometry.targetPoint)
  return Object.keys(result).length > 0 ? result : null
}

/** The elements of `ids` with their properties and their fields of the model; those the document lacks are left out. */
function fileElements(doc: Y.Doc, ids: ReadonlySet<string>): Record<string, FileElement> {
  const elements = getElements(doc)
  const result: Record<string, FileElement> = {}
  for (const id of [...ids].sort()) {
    const element = elements.get(id)
    if (!(element instanceof Y.Map)) continue
    const data: FileElement = {}
    for (const field of ELEMENT_FIELDS) {
      const value = element.get(field)
      if (field === 'tags') {
        const tags = Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === 'string' && tag !== '') : []
        if (tags.length > 0) data.tags = tags
      } else if (typeof value === 'string' && value !== '') {
        data[field] = value
      }
    }
    const parent = element.get('parent')
    if (typeof parent === 'string' && parent !== '') data.parent = parent
    const environment = element.get('environment')
    if (typeof environment === 'string') data.environment = environment
    result[id] = data
  }
  return result
}

/** The settings of the checks: what rules are on or off and what remarks are hidden. */
function fileChecks(doc: Y.Doc): Record<string, boolean> {
  const result: Record<string, boolean> = {}
  for (const [key, value] of getCheckSettings(doc).entries()) {
    if ((key.startsWith('rule:') || key.startsWith('hidden:')) && typeof value === 'boolean') result[key] = value
  }
  return result
}

/** The extension of a picture of a type that the file carries; `null` for another type. */
function extensionOf(type: string): string | null {
  const normalized = type.toLowerCase().replace('image/jpg', 'image/jpeg')
  return Object.entries(IMAGE_EXTENSIONS).find(([, known]) => known === normalized)?.[0] ?? null
}

/** The pictures of a document that a file carries, and the path in the archive of each by its address. */
export interface PackedImages {
  paths: Map<string, string>
  files: ZipFile[]
}

/**
 * The pictures of the board and the raster images in `data:` addresses of the cells of `doc`, each once: pictures with
 * the same bytes under different addresses share a file. A picture that could not be downloaded, e.g. without a
 * connection, or of a type that boards do not take, is left out, and its cell keeps its address.
 */
export async function packImages(doc: Y.Doc, download: (url: string) => Promise<Blob | null> = downloadPicture): Promise<PackedImages> {
  const urls = new Set<string>()
  for (const page of listPages(doc)) {
    for (const cell of getCells(doc, page.id).values()) {
      const style = cell instanceof Y.Map ? cell.get('style') : undefined
      const image = style instanceof Y.Map ? style.get('image') : undefined
      if (typeof image === 'string' && (boardImageOf(image) || dataUriToBlob(image))) urls.add(image)
    }
  }
  const pictures = await Promise.all(
    [...urls].map(async (url) => [url, dataUriToBlob(url) ?? (await download(url))] as const),
  )
  const paths = new Map<string, string>()
  const files: ZipFile[] = []
  // Files by the CRC-32 and the size of their bytes, to find the same picture under another address.
  const known = new Map<string, ZipFile[]>()
  for (const [url, picture] of pictures) {
    const extension = picture && extensionOf(picture.type)
    if (!picture || !extension) continue
    const data = new Uint8Array(await picture.arrayBuffer())
    const key = `${crc32(data)}:${data.length}`
    const same = known.get(key)?.find((file) => file.name.endsWith(`.${extension}`) && equalBytes(file.data, data))
    if (same) {
      paths.set(url, same.name)
      continue
    }
    const file = { name: `${IMAGES_FOLDER}${files.length + 1}.${extension}`, data }
    files.push(file)
    known.set(key, [...(known.get(key) ?? []), file])
    paths.set(url, file.name)
  }
  return { paths, files }
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let index = 0; index < a.length; index++) if (a[index] !== b[index]) return false
  return true
}

/** The board of `doc` as a `.codraw` file: `board.json` deflated and the pictures of the board stored. */
export async function boardFileBytes(
  doc: Y.Doc,
  title: string,
  download: (url: string) => Promise<Blob | null> = downloadPicture,
): Promise<Uint8Array<ArrayBuffer>> {
  const images = await packImages(doc, download)
  const json = boardFileJson(doc, title, images.paths)
  const used = new Set(json.images ?? [])
  return zipFiles([
    { name: BOARD_JSON, data: new TextEncoder().encode(JSON.stringify(json)), compress: true },
    ...images.files.filter((file) => used.has(file.name)),
  ])
}
