import type { DetailOf, ElementData, PlaceData, PointData, StyleValue } from '../diagram/model.ts'
import type { ElementStatus } from '../diagram/status.ts'
import { boardFileMessages } from './messages.ts'

/**
 * The file of a board, `.codraw`: CoDraw's own format, which keeps everything the document of a board holds and opens
 * only in CoDraw. A ZIP archive of
 *
 * - `board.json`, deflated: the board as {@link BoardFileJson} — pages in their order, cells in drawing order without
 *   the keys of order of the CRDT and without fields at their defaults, styles as objects, the properties of each
 *   element once;
 * - `images/<n>.<ext>`, stored: the pictures of the board as bytes, each once however many shapes show it.
 *
 * The file carries only the fields listed here: who changed what, who locked what and who set a status stay on the
 * board. A field that a new feature adds to the document of a board is added here, with its test, or files lose it.
 */

export const BOARD_FILE_FORMAT = 'codraw'

/** The version of `board.json` that CoDraw writes; it reads this one and the earlier ones. */
export const BOARD_FILE_VERSION = 1

export const BOARD_FILE_EXTENSION = 'codraw'

export const BOARD_FILE_MIME_TYPE = 'application/vnd.codraw.board+zip'

/** The entry of the archive with the board. */
export const BOARD_JSON = 'board.json'

/** The folder of the archive with the pictures. */
export const IMAGES_FOLDER = 'images/'

/** Types of pictures that the file carries, by the extensions of their files in the archive. */
export const IMAGE_EXTENSIONS: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}

/** `board.json`. */
export interface BoardFileJson {
  format: typeof BOARD_FILE_FORMAT
  version: number
  title: string
  /** The pages in the order of the board. */
  pages: FilePage[]
  /** The elements of the architecture that cells name, by id: their properties and their place in the model. */
  elements?: Record<string, FileElement>
  /** The settings of the checks of the board: `rule:<rule>` whether it is on, `hidden:<key>` a hidden remark. */
  checks?: Record<string, boolean>
  /** The paths of the pictures in the archive; a cell whose `image` is one of them shows that picture. */
  images?: string[]
}

export interface FilePage {
  id: string
  name: string
  detailOf?: DetailOf
  view?: FileView
  /** The cells but the root, in drawing order: each before its children, siblings in their order. */
  cells: FileCell[]
}

export interface FileView {
  rule: Record<string, string | string[]>
  hidden?: string[]
  places?: Record<string, PlaceData>
}

/** A cell; a field at its default is left out. */
export interface FileCell {
  id: string
  /** `vertex` without it. */
  kind?: 'edge' | 'layer'
  /** The main layer `1` without it; a layer lies in the root. */
  parent?: string
  value?: string
  geometry?: FileGeometry
  source?: string
  target?: string
  style?: Record<string, StyleValue>
  /** Custom properties, the attributes of `<object>` of draw.io. */
  attrs?: Record<string, string>
  /** The status of an element, without who set it and when. */
  status?: ElementStatus
}

/** The geometry of a cell; coordinates and sizes of 0 and `relative: false` are left out. */
export interface FileGeometry {
  x?: number
  y?: number
  width?: number
  height?: number
  relative?: true
  points?: PointData[]
  offset?: PointData
  sourcePoint?: PointData
  targetPoint?: PointData
}

/** An element: its properties, the element it is a part of and the environment of a node of deployment. */
export interface FileElement extends ElementData {
  parent?: string
  environment?: string
}

/** The file cannot be opened; the message says why, in words for the user. */
export class BoardFileError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'BoardFileError'
  }
}

export const notBoardFile = (cause?: unknown) => new BoardFileError(boardFileMessages.notBoardFile, { cause })
export const damagedBoardFile = (cause?: unknown) => new BoardFileError(boardFileMessages.damaged, { cause })
