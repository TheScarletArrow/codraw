import { downloadBlob, fileName } from '../lib/download.ts'
import type { DrawioPage } from './parse.ts'
import { DRAWIO_MIME_TYPE } from './serialize.ts'

/** Files the import accepts. */
export const DRAWIO_FILE_TYPES = '.drawio,.xml,.svg,application/xml,text/xml,image/svg+xml'

/** Board title from the name of a file: without `.drawio`, `.xml`, `.drawio.svg`. */
export function titleFromFileName(name: string): string {
  return name.replace(/(\.drawio)?\.(drawio|xml|svg)$/i, '').trim() || 'Доска из draw.io'
}

/** Saves the diagram as `<title>.drawio`. */
export function downloadDrawio(title: string, xml: string) {
  downloadBlob(new Blob([xml], { type: DRAWIO_MIME_TYPE }), fileName(title, 'drawio'))
}

/** Pages read from a file on the list of boards, waiting for the new board to be opened. */
const pendingImports = new Map<string, DrawioPage[]>()

export function setPendingImport(boardId: string, pages: DrawioPage[]) {
  pendingImports.set(boardId, pages)
}

/** Takes the pages waiting for the board, once. */
export function takePendingImport(boardId: string): DrawioPage[] | null {
  const pages = pendingImports.get(boardId) ?? null
  pendingImports.delete(boardId)
  return pages
}
