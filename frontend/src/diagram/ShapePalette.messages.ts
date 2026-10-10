import { defineMessages } from '../i18n/i18n.ts'

export const paletteMessages = defineMessages({
  ru: {
    shapes: 'Фигуры',
    search: 'Поиск фигур',
    found: 'Найденные фигуры',
    fromLibraries: 'Из библиотек',
    logos: 'Логотипы',
    nothingFound: 'Ничего не найдено',
    logo: (title: string) => `Логотип ${title}`,
    imageFiles: 'Файлы изображений',
    imageHint: 'Изображение PNG, JPEG, GIF или WebP с компьютера; картинку можно и вставить (Ctrl+V), и перетащить на холст',
    image: 'Изображение',
  },
  en: {
    shapes: 'Shapes',
    search: 'Search shapes',
    found: 'Shapes found',
    fromLibraries: 'From libraries',
    logos: 'Logos',
    nothingFound: 'Nothing found',
    logo: (title: string) => `${title} logo`,
    imageFiles: 'Image files',
    imageHint: 'A PNG, JPEG, GIF or WebP image from your computer; you can also paste a picture (Ctrl+V) or drag it onto the canvas',
    image: 'Image',
  },
})
