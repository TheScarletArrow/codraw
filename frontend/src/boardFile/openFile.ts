import * as Y from 'yjs'
import type { Author } from '../diagram/attribution.ts'
import { storePageImages, type ImageHost } from '../diagram/images.ts'
import { titleFromFileName } from '../drawio/files.ts'
import { importPages } from '../drawio/importPages.ts'
import { DrawioFormatError, parseDrawio, type DrawioPage } from '../drawio/parse.ts'
import { downloadBlob, fileName } from '../lib/download.ts'
import { isZip } from '../lib/zip.ts'
import { BOARD_FILE_EXTENSION, BOARD_FILE_MIME_TYPE, notBoardFile } from './format.ts'
import { importBoardFile, placeBoardFileImages } from './importFile.ts'
import { readBoardFile, type BoardFile } from './read.ts'

/** Files that opening and importing take: CoDraw's own and those of draw.io. */
export const BOARD_FILE_TYPES = `.${BOARD_FILE_EXTENSION},.drawio,.xml,.svg,application/zip,application/xml,text/xml,image/svg+xml`

/** A file read for a board: a `.codraw` file, or the pages of a file of draw.io. */
export type OpenedFile = { kind: 'codraw'; title: string; board: BoardFile } | { kind: 'drawio'; title: string; pages: DrawioPage[] }

/**
 * Reads a file of either format, by what it holds rather than by its name: a ZIP archive is a `.codraw` file, anything
 * else a file of draw.io. The title of a new board is the one the `.codraw` file keeps, or the name of the file. Throws
 * `BoardFileError` with words for the user.
 */
export async function readOpenedFile(file: Blob, name: string): Promise<OpenedFile> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (isZip(bytes)) {
    const board = await readBoardFile(bytes)
    return { kind: 'codraw', title: board.title || titleFromFileName(name), board }
  }
  try {
    return { kind: 'drawio', title: titleFromFileName(name), pages: await parseDrawio(new TextDecoder().decode(bytes)) }
  } catch (error) {
    throw error instanceof DrawioFormatError ? notBoardFile(error) : error
  }
}

/**
 * Adds the pages of a file to the board document, its pictures stored on the board of `host` first, and returns the
 * ids of the new pages.
 */
export async function applyOpenedFile(doc: Y.Doc, opened: OpenedFile, host: ImageHost | null, author: Author | null): Promise<string[]> {
  if (opened.kind === 'codraw') {
    await placeBoardFileImages(opened.board, host)
    return importBoardFile(doc, opened.board, author)
  }
  // The board keeps addresses of its pictures, not the pictures.
  if (host) await storePageImages(opened.pages, host)
  return importPages(doc, opened.pages, author)
}

/** Saves the file of the board as `<title>.codraw`. */
export function downloadBoardFile(title: string, bytes: Uint8Array<ArrayBuffer>) {
  downloadBlob(new Blob([bytes], { type: BOARD_FILE_MIME_TYPE }), fileName(title, BOARD_FILE_EXTENSION))
}

/** Files read on the list of boards, waiting for their new boards to be opened. */
const pendingImports = new Map<string, OpenedFile>()

export function setPendingImport(boardId: string, opened: OpenedFile) {
  pendingImports.set(boardId, opened)
}

/** Takes the file waiting for the board, once. */
export function takePendingImport(boardId: string): OpenedFile | null {
  const opened = pendingImports.get(boardId) ?? null
  pendingImports.delete(boardId)
  return opened
}
