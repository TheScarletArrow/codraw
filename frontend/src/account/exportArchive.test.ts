import { describe, expect, it } from 'vitest'
import type { ExportedData } from '../api/account.ts'
import { archiveEntries, archiveName } from './exportArchive.ts'

const data: ExportedData = {
  profile: { id: 'u1', name: 'Аня' },
  boards: [
    { id: 'b1', title: 'Схема', deletedAt: null },
    { id: 'b2', title: 'Схема', deletedAt: '2026-10-01T00:00:00Z' },
    { id: 'b3', title: 'API: v1/v2', deletedAt: null },
  ],
  sharedBoards: [],
  comments: [{ id: 'c1', body: 'Мой комментарий' }],
  templates: [{ title: 'Шаблон', drawio: '<mxfile host="CoDraw"/>' }],
}

describe('archive of the data of the user', () => {
  it('writes a JSON file per part, the templates and each board as .drawio, with titles made into unique names', async () => {
    const entries = await archiveEntries(data, async (boardId) => `<mxfile id="${boardId}"/>`)

    expect(entries.map((entry) => entry.name)).toEqual([
      'profile.json',
      'boards.json',
      'shared-boards.json',
      'comments.json',
      'templates.json',
      'templates/Шаблон.drawio',
      'boards/Схема.drawio',
      'boards/Схема (2).drawio',
      'boards/API_ v1_v2.drawio',
    ])
    expect(JSON.parse(entries.find((entry) => entry.name === 'comments.json')!.text)).toEqual(data.comments)
    expect(entries.find((entry) => entry.name === 'boards/Схема (2).drawio')!.text).toBe('<mxfile id="b2"/>')
    expect(entries.find((entry) => entry.name === 'templates/Шаблон.drawio')!.text).toBe('<mxfile host="CoDraw"/>')
  })

  it('names the archive by the local date', () => {
    expect(archiveName(new Date(2026, 9, 5, 23, 30))).toBe('codraw-data-2026-10-05.zip')
  })
})
