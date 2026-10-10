import { HttpError } from '../api/http.ts'
import { megabytes } from '../board/imageUploads.ts'
import { defineMessages, pluralEn } from '../i18n/i18n.ts'

export const libraryMessages = defineMessages({
  ru: {
    unsupportedImage: 'Формат не поддерживается: подходят PNG, JPEG, GIF, WebP и SVG',
    saveFailed: 'Не удалось сохранить в библиотеку',
    changeFailed: 'Не удалось изменить библиотеку',
    componentLoadFailed: 'Не удалось взять компонент из библиотеки',
    imageTooLarge: (size: string) => `Изображение больше ${size}`,
    gone: 'Этой библиотеки или компонента уже нет',
    librariesLimit: (limit: number) => `Больше ${limit} библиотек не создать`,
    librariesFull: 'Больше библиотек не создать',
    componentsLimit: (limit: number) => `В библиотеке уже ${limit} компонентов — больше не поместится`,
    libraryFull: 'Библиотека заполнена',
    sizeLimit: (size: string) => `Библиотеки заняли всё место (${size}) — удалите ненужные компоненты`,
    sizeFull: 'Библиотеки заняли всё место — удалите ненужные компоненты',
    pixelsLimit: (megapixels: number) => `Изображение больше ${megapixels} мегапикселей`,
    imageTooLargeNoLimit: 'Изображение слишком большое',
    componentLimit: (size: string) => `Компонент больше ${size} — уберите из выделения большие изображения`,
    componentTooLarge: 'Компонент слишком большой',
    missingPictures: 'Не удалось взять изображения выделения с доски — проверьте связь',
    outsidePictures:
      'В выделении есть изображения по ссылкам, которые библиотека не хранит, например значки draw.io, — уберите их из выделения',
    nothingSelected: 'Выделите фигуры, которые нужно сохранить',
    saving: 'Сохранение в библиотеку…',
    addingImages: (n: number) => `Добавление изображений: ${n}…`,
    addingImage: 'Добавление изображения…',
    fileRefused: (name: string, reason: string) => `«${name}»: ${reason}`,
    notAdded: (refused: string) => `Не добавлены ${refused}`,
    component: 'Компонент',
    notSvg: 'Файл не похож на SVG',
    image: 'Изображение',
    defaultLibraryName: 'Мои фигуры',
    saveToLibrary: 'Сохранить в библиотеку',
    name: 'Название',
    library: 'Библиотека',
    newLibraryOption: 'Новая библиотека…',
    libraryName: 'Название библиотеки',
    cancel: 'Отмена',
    savingShort: 'Сохранение…',
    save: 'Сохранить',
    deleteLibraryOf: (name: string, count: number) =>
      `Удалить библиотеку «${name}» с ${count} ${count % 10 === 1 && count % 100 !== 11 ? 'компонентом' : 'компонентами'}? Вставленные на доски копии останутся.`,
    deleteEmptyLibrary: (name: string) => `Удалить пустую библиотеку «${name}»?`,
    myLibraries: 'Мои библиотеки',
    newLibrary: 'Новая библиотека',
    newLibraryName: 'Название новой библиотеки',
    gotIt: 'Понятно',
    unavailable: 'Библиотеки сейчас недоступны',
    emptyShelf: 'Выделите фигуры на холсте и выберите «Сохранить в библиотеку…» в меню правого щелчка',
    emptyLibrary: 'Пусто: добавьте выделенное или изображения в меню библиотеки',
    componentName: 'Название компонента',
    delete: 'Удалить',
    imagesFor: (name: string) => `Изображения для библиотеки «${name}»`,
    libraryMenu: (name: string) => `Меню библиотеки «${name}»`,
    libraryNamed: (name: string) => `Библиотека «${name}»`,
    addSelection: 'Добавить выделенное',
    addImages: 'Добавить изображения или SVG…',
    renameLibrary: 'Переименовать библиотеку',
    deleteLibrary: 'Удалить библиотеку…',
    componentMenu: (name: string) => `Меню компонента «${name}»`,
    componentNamed: (name: string) => `Компонент «${name}»`,
    rename: 'Переименовать',
    replaceWithSelection: 'Заменить выделенным',
    applyStyle: 'Применить стиль к выделенному',
    deleteComponent: (name: string) => `Удалить компонент «${name}»? Вставленные на доски копии останутся.`,
  },
  en: {
    unsupportedImage: 'The format is not supported: PNG, JPEG, GIF, WebP and SVG fit',
    saveFailed: 'Could not save to the library',
    changeFailed: 'Could not change the library',
    componentLoadFailed: 'Could not take the component from the library',
    imageTooLarge: (size: string) => `The image is larger than ${size}`,
    gone: 'This library or component no longer exists',
    librariesLimit: (limit: number) => `You cannot create more than ${limit} libraries`,
    librariesFull: 'You cannot create more libraries',
    componentsLimit: (limit: number) => `The library already has ${limit} components — no more will fit`,
    libraryFull: 'The library is full',
    sizeLimit: (size: string) => `The libraries took all the space (${size}) — delete components you do not need`,
    sizeFull: 'The libraries took all the space — delete components you do not need',
    pixelsLimit: (megapixels: number) => `The image is larger than ${megapixels} megapixels`,
    imageTooLargeNoLimit: 'The image is too large',
    componentLimit: (size: string) => `The component is larger than ${size} — remove large images from the selection`,
    componentTooLarge: 'The component is too large',
    missingPictures: 'Could not take the images of the selection from the board — check your connection',
    outsidePictures:
      'The selection has images by links that a library does not keep, e.g. draw.io icons — remove them from the selection',
    nothingSelected: 'Select the shapes to save',
    saving: 'Saving to the library…',
    addingImages: (n: number) => `Adding images: ${n}…`,
    addingImage: 'Adding the image…',
    fileRefused: (name: string, reason: string) => `“${name}”: ${reason}`,
    notAdded: (refused: string) => `Not added: ${refused}`,
    component: 'Component',
    notSvg: 'The file does not look like SVG',
    image: 'Image',
    defaultLibraryName: 'My shapes',
    saveToLibrary: 'Save to library',
    name: 'Name',
    library: 'Library',
    newLibraryOption: 'New library…',
    libraryName: 'Library name',
    cancel: 'Cancel',
    savingShort: 'Saving…',
    save: 'Save',
    deleteLibraryOf: (name: string, count: number) =>
      `Delete the library “${name}” with ${count} ${pluralEn(count, 'component', 'components')}? Copies placed on boards will stay.`,
    deleteEmptyLibrary: (name: string) => `Delete the empty library “${name}”?`,
    myLibraries: 'My libraries',
    newLibrary: 'New library',
    newLibraryName: 'Name of the new library',
    gotIt: 'Got it',
    unavailable: 'Libraries are unavailable now',
    emptyShelf: 'Select shapes on the canvas and choose “Save to library…” in the right-click menu',
    emptyLibrary: 'Empty: add the selection or images from the library menu',
    componentName: 'Component name',
    delete: 'Delete',
    imagesFor: (name: string) => `Images for the library “${name}”`,
    libraryMenu: (name: string) => `Menu of the library “${name}”`,
    libraryNamed: (name: string) => `Library “${name}”`,
    addSelection: 'Add selection',
    addImages: 'Add images or SVG…',
    renameLibrary: 'Rename library',
    deleteLibrary: 'Delete library…',
    componentMenu: (name: string) => `Menu of the component “${name}”`,
    componentNamed: (name: string) => `Component “${name}”`,
    rename: 'Rename',
    replaceWithSelection: 'Replace with selection',
    applyStyle: 'Apply style to selection',
    deleteComponent: (name: string) => `Delete the component “${name}”? Copies placed on boards will stay.`,
  },
})

const m = libraryMessages

/** Why a change of libraries did not happen, in words; `fallback` for a failure without a reason, e.g. no connection. */
export function libraryError(error: unknown, fallback: string): string {
  if (!(error instanceof HttpError)) return fallback
  const { limit, scope } = error.problem ?? {}
  switch (error.status) {
    case 404:
      return m.gone
    case 409:
      if (scope === 'libraries') return limit !== undefined ? m.librariesLimit(limit) : m.librariesFull
      if (scope === 'components') return limit !== undefined ? m.componentsLimit(limit) : m.libraryFull
      return limit !== undefined ? m.sizeLimit(megabytes(limit)) : m.sizeFull
    case 413:
      if (scope === 'pixels') return m.pixelsLimit(Math.round((limit ?? 50_000_000) / 1_000_000))
      if (scope === 'image') return limit !== undefined ? m.imageTooLarge(megabytes(limit)) : m.imageTooLargeNoLimit
      return limit !== undefined ? m.componentLimit(megabytes(limit)) : m.componentTooLarge
    case 415:
      return m.unsupportedImage
    default:
      return fallback
  }
}
