import { HttpError } from '../api/http.ts'
import { megabytes } from '../board/imageUploads.ts'

export const UNSUPPORTED_LIBRARY_IMAGE = 'Формат не поддерживается: подходят PNG, JPEG, GIF, WebP и SVG'
export const LIBRARY_SAVE_FAILED = 'Не удалось сохранить в библиотеку'
export const LIBRARY_CHANGE_FAILED = 'Не удалось изменить библиотеку'
export const COMPONENT_LOAD_FAILED = 'Не удалось взять компонент из библиотеки'

export const libraryImageTooLarge = (limit: number) => `Изображение больше ${megabytes(limit)}`

/** Why a change of libraries did not happen, in words; `fallback` for a failure without a reason, e.g. no connection. */
export function libraryError(error: unknown, fallback: string): string {
  if (!(error instanceof HttpError)) return fallback
  const { limit, scope } = error.problem ?? {}
  switch (error.status) {
    case 404:
      return 'Этой библиотеки или компонента уже нет'
    case 409:
      if (scope === 'libraries') return limit !== undefined ? `Больше ${limit} библиотек не создать` : 'Больше библиотек не создать'
      if (scope === 'components') {
        return limit !== undefined ? `В библиотеке уже ${limit} компонентов — больше не поместится` : 'Библиотека заполнена'
      }
      return limit !== undefined
        ? `Библиотеки заняли всё место (${megabytes(limit)}) — удалите ненужные компоненты`
        : 'Библиотеки заняли всё место — удалите ненужные компоненты'
    case 413:
      if (scope === 'pixels') return `Изображение больше ${Math.round((limit ?? 50_000_000) / 1_000_000)} мегапикселей`
      if (scope === 'image') return limit !== undefined ? libraryImageTooLarge(limit) : 'Изображение слишком большое'
      return limit !== undefined
        ? `Компонент больше ${megabytes(limit)} — уберите из выделения большие изображения`
        : 'Компонент слишком большой'
    case 415:
      return UNSUPPORTED_LIBRARY_IMAGE
    default:
      return fallback
  }
}
