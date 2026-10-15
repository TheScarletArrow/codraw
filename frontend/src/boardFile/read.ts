import { generateNKeysBetween } from 'fractional-indexing'
import { EDGE_API_KEY, edgeApiOf } from '../diagram/edgeApi.ts'
import { LINK_KEY, linkOf } from '../diagram/links.ts'
import { LOCKED_BY_KEY } from '../diagram/locks.ts'
import {
  ELEMENT_STYLE_KEYS,
  LAYER_CELL_ID,
  readDetailOf,
  readPlace,
  ROOT_CELL_ID,
  type CellData,
  type DetailOf,
  type ElementField,
  type GeometryData,
  type PlaceData,
  type PointData,
  type StyleValue,
  type ViewData,
} from '../diagram/model.ts'
import { isElementStatus, type ElementStatus } from '../diagram/status.ts'
import { readViewRule } from '../diagram/viewRule.ts'
import { normalizeTableComment, TABLE_COMMENT_KEY } from '../diagram/tableComments.ts'
import { VIEW_QUERY_KEY, viewQueryOf } from '../diagram/views.ts'
import { TITLE_MAX_LENGTH } from '../board/TitleInput.tsx'
import { openZip, ZipError, type ZipArchive } from '../lib/zip.ts'
import {
  BOARD_FILE_FORMAT,
  BOARD_FILE_VERSION,
  BOARD_JSON,
  BoardFileError,
  damagedBoardFile,
  IMAGE_EXTENSIONS,
  IMAGES_FOLDER,
  notBoardFile,
  type FileElement,
} from './format.ts'
import { boardFileMessages } from './messages.ts'

/** How much a file from outside may hold: files in the archive, bytes of `board.json` and of everything unpacked. */
export const BOARD_FILE_LIMITS = { entries: 10_000, json: 64 * 1024 * 1024, total: 512 * 1024 * 1024 }

/** A cell of a file as the board document stores it, with its custom properties and its status. */
export interface BoardFileCell extends CellData {
  attrs?: Record<string, string>
  status?: ElementStatus
}

export interface BoardFilePage {
  id: string
  name: string
  detailOf?: DetailOf
  view?: ViewData
  /** The cells but the root: the layers in the root, every other cell in a layer or in a cell of the page. */
  cells: BoardFileCell[]
}

/** A `.codraw` file, read and checked. */
export interface BoardFile {
  title: string
  pages: BoardFilePage[]
  elements: Record<string, FileElement>
  checks: Record<string, boolean>
  /** The pictures of the archive by their paths, which the `image` of the style of a cell names. */
  images: Map<string, Blob>
}

/** The longest id of a page, a cell or an element the file may have. */
const MAX_ID = 256

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)
const isId = (value: unknown): value is string => typeof value === 'string' && value !== '' && value.length <= MAX_ID
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [])

/**
 * Reads a `.codraw` file. Throws {@link BoardFileError}: «Это не файл CoDraw или draw.io» for an archive without a board,
 * «Файл .codraw повреждён» for a broken archive, a damaged or too large `board.json` or a picture it lists but lacks,
 * «Файл сохранён более новой версией CoDraw» for a later version of the format. Every field is checked: values of a
 * wrong type are dropped, and so are links, descriptions of API and queries of views that an import of draw.io drops.
 */
export async function readBoardFile(bytes: Uint8Array): Promise<BoardFile> {
  let archive: ZipArchive
  try {
    archive = openZip(bytes, BOARD_FILE_LIMITS)
  } catch (error) {
    throw damagedBoardFile(error)
  }
  const size = archive.size(BOARD_JSON)
  if (size === null) throw notBoardFile()
  if (size > BOARD_FILE_LIMITS.json) throw damagedBoardFile()
  const json = parseJson(await readEntry(archive, BOARD_JSON))
  if (!isObject(json) || json.format !== BOARD_FILE_FORMAT) throw notBoardFile()
  if (!Number.isInteger(json.version) || (json.version as number) < 1) throw damagedBoardFile()
  if ((json.version as number) > BOARD_FILE_VERSION) throw new BoardFileError(boardFileMessages.newerVersion)

  const imagePaths = new Set(strings(json.images).filter(isImagePath))
  const images = new Map<string, Blob>()
  for (const path of imagePaths) {
    const data = await readEntry(archive, path)
    if (data === null) throw damagedBoardFile()
    images.set(path, new Blob([data as Uint8Array<ArrayBuffer>], { type: IMAGE_EXTENSIONS[extension(path)]! }))
  }

  const pages: BoardFilePage[] = []
  const pageIds = new Set<string>()
  for (const page of Array.isArray(json.pages) ? json.pages : []) {
    if (!isObject(page) || !isId(page.id) || pageIds.has(page.id)) continue
    pageIds.add(page.id)
    pages.push(readPage(page))
  }
  if (pages.length === 0) throw damagedBoardFile()
  return {
    title: typeof json.title === 'string' ? json.title.trim().slice(0, TITLE_MAX_LENGTH) : '',
    pages,
    elements: readElements(json.elements),
    checks: readChecks(json.checks),
    images,
  }
}

async function readEntry(archive: ZipArchive, name: string): Promise<Uint8Array | null> {
  try {
    return await archive.read(name)
  } catch (error) {
    throw error instanceof ZipError ? damagedBoardFile(error) : error
  }
}

function parseJson(data: Uint8Array | null): unknown {
  if (data === null) throw notBoardFile()
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data))
  } catch (error) {
    throw damagedBoardFile(error)
  }
}

const extension = (path: string) => path.slice(path.lastIndexOf('.') + 1).toLowerCase()

/** A path of a picture in the folder of pictures, of a type that boards take. */
const isImagePath = (path: string) =>
  path.startsWith(IMAGES_FOLDER) && !path.includes('..') && path.length <= MAX_ID && extension(path) in IMAGE_EXTENSIONS

function readPage(page: Json): BoardFilePage {
  const detailOf = readDetailOf(page.detailOf)
  const view = readView(page.view)
  return {
    id: page.id as string,
    name: typeof page.name === 'string' ? page.name : '',
    ...(detailOf && { detailOf }),
    ...(view && { view }),
    cells: readCells(Array.isArray(page.cells) ? page.cells : []),
  }
}

function readView(value: unknown): ViewData | undefined {
  if (!isObject(value)) return undefined
  const rule = readViewRule(value.rule)
  if (!rule) return undefined
  const places: Record<string, PlaceData> = {}
  if (isObject(value.places)) {
    for (const [key, place] of Object.entries(value.places)) {
      const box = readPlace(place)
      if (box) places[key] = box
    }
  }
  return { rule, hidden: [...new Set(strings(value.hidden))].sort(), places }
}

/**
 * The cells of a page as the document stores them. A cell without an id, with the id of the root or of a cell before
 * it, or of no known kind is dropped; a cell whose parent the page lacks, or whose parents lead back to it, lies in the
 * main layer, as the canvas puts it; an edge whose end the page lacks is loose at that end. Siblings get keys of order
 * in the order of the file.
 */
function readCells(values: unknown[]): BoardFileCell[] {
  const cells: BoardFileCell[] = []
  const ids = new Set<string>([ROOT_CELL_ID])
  for (const value of values) {
    if (!isObject(value) || !isId(value.id) || ids.has(value.id)) continue
    const kind = value.kind === undefined ? 'vertex' : value.kind
    if (kind !== 'vertex' && kind !== 'edge' && kind !== 'layer') continue
    ids.add(value.id)
    const status = value.status
    const attrs = readAttrs(value.attrs)
    cells.push({
      id: value.id,
      kind,
      parent: kind === 'layer' ? ROOT_CELL_ID : isId(value.parent) ? value.parent : LAYER_CELL_ID,
      order: '',
      value: typeof value.value === 'string' ? value.value : '',
      geometry: readGeometry(value.geometry),
      source: kind === 'edge' && isId(value.source) ? value.source : null,
      target: kind === 'edge' && isId(value.target) ? value.target : null,
      style: readStyle(value.style),
      ...(Object.keys(attrs).length > 0 && { attrs }),
      ...(isElementStatus(status) && { status }),
    })
  }

  const byId = new Map(cells.map((cell) => [cell.id, cell]))
  const holds = (id: string) => id === LAYER_CELL_ID || byId.has(id)
  for (const cell of cells) {
    if (cell.kind === 'layer') continue
    if (!holds(cell.parent!) || leadsBack(cell, byId)) cell.parent = LAYER_CELL_ID
    if (cell.source !== null && !byId.has(cell.source)) cell.source = null
    if (cell.target !== null && !byId.has(cell.target)) cell.target = null
  }

  const siblings = new Map<string, BoardFileCell[]>()
  for (const cell of cells) siblings.set(cell.parent!, [...(siblings.get(cell.parent!) ?? []), cell])
  siblings.forEach((group) => {
    const keys = generateNKeysBetween(null, null, group.length)
    group.forEach((cell, index) => (cell.order = keys[index]!))
  })
  return cells
}

/** The parents of the cell lead back to it rather than to a layer. */
function leadsBack(cell: BoardFileCell, byId: ReadonlyMap<string, BoardFileCell>): boolean {
  const seen = new Set([cell.id])
  for (let parent = byId.get(cell.parent!); parent && parent.kind !== 'layer'; parent = byId.get(parent.parent!)) {
    if (seen.has(parent.id)) return true
    seen.add(parent.id)
  }
  return false
}

function readAttrs(value: unknown): Record<string, string> {
  if (!isObject(value)) return {}
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
}

function readPoint(value: unknown): PointData | undefined {
  if (!isObject(value)) return undefined
  return { x: isNumber(value.x) ? value.x : 0, y: isNumber(value.y) ? value.y : 0 }
}

function readGeometry(value: unknown): GeometryData | null {
  if (!isObject(value)) return null
  const number = (key: string) => (isNumber(value[key]) ? value[key] : 0)
  const geometry: GeometryData = { x: number('x'), y: number('y'), width: number('width'), height: number('height') }
  if (value.relative === true) geometry.relative = true
  if (Array.isArray(value.points)) {
    const points = value.points.map(readPoint).filter((point): point is PointData => point !== undefined)
    if (points.length > 0) geometry.points = points
  }
  for (const key of ['offset', 'sourcePoint', 'targetPoint'] as const) {
    const point = readPoint(value[key])
    if (point) geometry[key] = point
  }
  return geometry
}

const isStyleValue = (value: unknown): value is StyleValue =>
  typeof value === 'string' ||
  typeof value === 'boolean' ||
  isNumber(value) ||
  (Array.isArray(value) && value.every((item) => typeof item === 'string'))

/**
 * The style of a cell: values of the types a style holds. A link that CoDraw would not open, a description of API it
 * cannot read, a query too long to keep and a comment of a table that is not text are dropped, as an import of draw.io
 * drops them, and so is who locked it; a comment of a table becomes one line, as CoDraw keeps it.
 */
function readStyle(value: unknown): Record<string, StyleValue> {
  if (!isObject(value)) return {}
  const style: Record<string, StyleValue> = {}
  for (const [key, item] of Object.entries(value)) {
    if (key === LOCKED_BY_KEY || !isStyleValue(item)) continue
    style[key] = Array.isArray(item) ? [...item] : item
  }
  if (LINK_KEY in style) {
    const link = linkOf(style)
    if (link) style[LINK_KEY] = link
    else delete style[LINK_KEY]
  }
  if (EDGE_API_KEY in style && !edgeApiOf(style)) delete style[EDGE_API_KEY]
  if (VIEW_QUERY_KEY in style && !viewQueryOf(style)) delete style[VIEW_QUERY_KEY]
  if (TABLE_COMMENT_KEY in style) {
    const comment = typeof style[TABLE_COMMENT_KEY] === 'string' ? normalizeTableComment(style[TABLE_COMMENT_KEY]) : ''
    if (comment) style[TABLE_COMMENT_KEY] = comment
    else delete style[TABLE_COMMENT_KEY]
  }
  return style
}

const ELEMENT_FIELDS = Object.keys(ELEMENT_STYLE_KEYS) as ElementField[]

function readElements(value: unknown): Record<string, FileElement> {
  if (!isObject(value)) return {}
  const elements: Record<string, FileElement> = {}
  for (const [id, item] of Object.entries(value)) {
    if (!isId(id) || !isObject(item)) continue
    const element: FileElement = {}
    for (const field of ELEMENT_FIELDS) {
      if (field === 'tags') {
        const tags = strings(item.tags).filter((tag) => tag !== '')
        if (tags.length > 0) element.tags = tags
      } else if (typeof item[field] === 'string' && item[field] !== '') {
        element[field] = item[field]
      }
    }
    if (isId(item.parent)) element.parent = item.parent
    if (typeof item.environment === 'string') element.environment = item.environment
    elements[id] = element
  }
  return elements
}

function readChecks(value: unknown): Record<string, boolean> {
  if (!isObject(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, boolean] => (entry[0].startsWith('rule:') || entry[0].startsWith('hidden:')) && typeof entry[1] === 'boolean',
    ),
  )
}
