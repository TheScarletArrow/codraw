import { describe, expect, it } from 'vitest'
import { HttpError } from '../api/http.ts'
import { libraryError } from './messages.ts'

const fallback = 'Не удалось сохранить в библиотеку'
const answer = (status: number, problem = {}) => libraryError(new HttpError(status, problem), fallback)

describe('why a change of libraries failed', () => {
  it('names the limit that was reached', () => {
    expect(answer(409, { limit: 20, scope: 'libraries' })).toBe('Больше 20 библиотек не создать')
    expect(answer(409, { limit: 200, scope: 'components' })).toBe('В библиотеке уже 200 компонентов — больше не поместится')
    expect(answer(409, { limit: 50 * 1024 * 1024, used: 1, scope: 'size' })).toBe(
      'Библиотеки заняли всё место (50 МБ) — удалите ненужные компоненты',
    )
    expect(answer(413, { limit: 4 * 1024 * 1024 })).toBe('Компонент больше 4 МБ — уберите из выделения большие изображения')
    expect(answer(413, { limit: 2 * 1024 * 1024, scope: 'image' })).toBe('Изображение больше 2 МБ')
    expect(answer(413, { limit: 50_000_000, scope: 'pixels' })).toBe('Изображение больше 50 мегапикселей')
  })

  it('tells an unsupported picture and a library that is gone, and falls back without a reason', () => {
    expect(answer(415)).toBe('Формат не поддерживается: подходят PNG, JPEG, GIF, WebP и SVG')
    expect(answer(404)).toBe('Этой библиотеки или компонента уже нет')
    expect(answer(500)).toBe(fallback)
    expect(libraryError(new TypeError('Failed to fetch'), fallback)).toBe(fallback)
  })
})
