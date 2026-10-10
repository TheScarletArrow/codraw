import { describe, expect, it } from 'vitest'
import { HttpError } from '../api/http.ts'
import { copyErrorMessage } from './copyBoard.ts'

describe('copyErrorMessage', () => {
  it('names the limit of boards, the room of images and the storage of images', () => {
    expect(copyErrorMessage(new HttpError(409, { title: 'Board limit reached', limit: 100 }))).toBe(
      'Достигнут лимит 100 досок. Переместите ненужную доску в корзину и повторите.',
    )
    expect(copyErrorMessage(new HttpError(409, { title: 'Image quota reached', limit: 1024 }))).toBe(
      'Изображения доски не помещаются в квоту копии',
    )
    expect(copyErrorMessage(new HttpError(503))).toBe('Хранилище изображений недоступно. Повторите позже.')
  })

  it('says only that the copy failed for anything else', () => {
    expect(copyErrorMessage(new HttpError(403))).toBe('Не удалось создать копию')
    expect(copyErrorMessage(new TypeError('Failed to fetch'))).toBe('Не удалось создать копию')
  })
})
