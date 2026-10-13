import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { getCells, initializeDocument, LAYER_CELL_ID, orderBetween, writeCell } from '../diagram/model.ts'
import { listPages, renamePage } from '../diagram/pages.ts'
import { SAMPLE_DRAWIO } from '../drawio/fixtures.ts'
import { zipFiles } from '../lib/zip.ts'
import { BOARD_JSON, BoardFileError } from './format.ts'
import { applyOpenedFile, readOpenedFile } from './openFile.ts'
import { boardFileBytes } from './write.ts'

function board() {
  const doc = new Y.Doc()
  initializeDocument(doc)
  return doc
}

const noPictures = async () => null

describe('readOpenedFile', () => {
  it('reads a ZIP archive as a .codraw file, whatever its name, with the title the file keeps', async () => {
    const doc = board()
    renamePage(doc, 'page-1', 'Контекст')
    const bytes = await boardFileBytes(doc, 'Платежи', noPictures)

    const opened = await readOpenedFile(new Blob([bytes]), 'копия.zip')

    expect(opened.kind).toBe('codraw')
    expect(opened.title).toBe('Платежи')
  })

  it('names a board of a .codraw file without a title after the file', async () => {
    const bytes = await boardFileBytes(board(), '', noPictures)
    expect((await readOpenedFile(new Blob([bytes]), 'Схема.codraw')).title).toBe('Схема')
  })

  it('reads anything else as a file of draw.io', async () => {
    const opened = await readOpenedFile(new Blob([SAMPLE_DRAWIO]), 'Платёжный сервис.drawio')

    expect(opened.kind).toBe('drawio')
    expect(opened.title).toBe('Платёжный сервис')
  })

  it('tells a file of neither format', async () => {
    await expect(readOpenedFile(new Blob(['просто текст']), 'заметки.txt')).rejects.toThrow(
      new BoardFileError('Это не файл CoDraw или draw.io'),
    )
    const archive = await zipFiles([{ name: 'readme.md', data: new TextEncoder().encode('# Нет') }])
    await expect(readOpenedFile(new Blob([archive]), 'архив.zip')).rejects.toThrow('Это не файл CoDraw или draw.io')
    const empty = await zipFiles([{ name: BOARD_JSON, data: new TextEncoder().encode('{}') }])
    await expect(readOpenedFile(new Blob([empty]), 'x.codraw')).rejects.toThrow('Это не файл CoDraw или draw.io')
  })
})

describe('applyOpenedFile', () => {
  it('adds the pages of a file of either format to the board', async () => {
    const source = board()
    renamePage(source, 'page-1', 'Контекст')
    source.transact(() =>
      writeCell(getCells(source), {
        id: 'api',
        kind: 'vertex',
        parent: LAYER_CELL_ID,
        order: orderBetween(null, null),
        value: 'API',
        geometry: { x: 0, y: 0, width: 80, height: 40 },
        source: null,
        target: null,
        style: {},
      }),
    )
    const codraw = await readOpenedFile(new Blob([await boardFileBytes(source, 'Платежи', noPictures)]), 'Платежи.codraw')
    const drawio = await readOpenedFile(new Blob([SAMPLE_DRAWIO]), 'Архитектура.drawio')
    const doc = board()

    const [first] = await applyOpenedFile(doc, codraw, null, null)
    await applyOpenedFile(doc, drawio, null, null)

    expect(first).toBe('page-1')
    expect(listPages(doc).map((page) => page.name)).toEqual(['Контекст', 'Контекст', 'Слои'])
    expect(getCells(doc).get('api')?.get('value')).toBe('API')
  })
})
