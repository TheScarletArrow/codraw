import * as Y from 'yjs'
import { exportBoardDocument, exportData, type ExportedData } from '../api/account.ts'
import { exportDrawio } from '../drawio/serialize.ts'
import { embeddedImages } from '../image/inlineImages.ts'
import { downloadBlob, fileName } from '../lib/download.ts'
import { zipBytes, type ZipEntry } from '../lib/zip.ts'

/** A part of the data as the name of its file: `sharedBoards` goes to `shared-boards.json`. */
function jsonName(key: string): string {
  return `${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}.json`
}

/** Names of files in a folder of the archive, each once: a repeated title gets the number of its turn. */
function uniqueNames() {
  const taken = new Set<string>()
  return (title: string, extension: string) => {
    let name = fileName(title, extension)
    for (let turn = 2; taken.has(name.toLowerCase()); turn++) name = fileName(`${title} (${turn})`, extension)
    taken.add(name.toLowerCase())
    return name
  }
}

/**
 * The files of the archive of the data of the user: a JSON file per part of the data, the personal templates as
 * `.drawio` and each board of the user, those in the trash too, as `.drawio` with its pictures inside. `drawioOf` turns
 * the board of the id into its file.
 */
export async function archiveEntries(
  data: ExportedData,
  drawioOf: (boardId: string) => Promise<string>,
): Promise<ZipEntry[]> {
  const entries: ZipEntry[] = Object.entries(data).map(([key, value]) => ({
    name: jsonName(key),
    text: `${JSON.stringify(value, null, 2)}\n`,
  }))
  const templateName = uniqueNames()
  for (const template of data.templates) {
    entries.push({ name: `templates/${templateName(template.title, 'drawio')}`, text: template.drawio })
  }
  const boardName = uniqueNames()
  // One at a time: a board with many pictures takes its share of the memory and of the connection.
  for (const board of data.boards) {
    entries.push({ name: `boards/${boardName(board.title, 'drawio')}`, text: await drawioOf(board.id) })
  }
  return entries
}

/** The board as a `.drawio` file with its pictures inside, from its stored document. */
async function boardDrawio(boardId: string): Promise<string> {
  const doc = new Y.Doc()
  try {
    const state = await exportBoardDocument(boardId)
    if (state.length > 0) Y.applyUpdate(doc, state)
    return exportDrawio(doc, await embeddedImages(doc))
  } finally {
    doc.destroy()
  }
}

/** The name of the archive: `codraw-data-<date>.zip` by the local date. */
export function archiveName(date = new Date()): string {
  const day = [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((part) => String(part).padStart(2, '0'))
  return `codraw-data-${day.join('-')}.zip`
}

/** Collects all data of the signed-in user into a ZIP archive and saves it through the downloads of the browser. */
export async function downloadMyData(): Promise<void> {
  const entries = await archiveEntries(await exportData(), boardDrawio)
  downloadBlob(new Blob([zipBytes(entries)], { type: 'application/zip' }), archiveName())
}
