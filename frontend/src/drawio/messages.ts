import { defineMessages } from '../i18n/i18n.ts'

export const drawioMessages = defineMessages({
  ru: {
    importFailed: 'Не удалось импортировать файл',
    notDrawio: 'Это не файл draw.io',
    fileInput: 'Файл draw.io',
    importLabel: 'Импорт из .drawio',
    importTitle: 'Импорт из .drawio: страницы файла добавятся к доске',
    exportLabel: 'Экспорт в .drawio',
    exportTitle: 'Экспорт в .drawio: все страницы доски',
    boardFromFile: 'Доска из draw.io',
    page: (number: number) => `Страница ${number}`,
  },
  en: {
    importFailed: 'Could not import the file',
    notDrawio: 'This is not a draw.io file',
    fileInput: 'draw.io file',
    importLabel: 'Import from .drawio',
    importTitle: 'Import from .drawio: the pages of the file are added to the board',
    exportLabel: 'Export to .drawio',
    exportTitle: 'Export to .drawio: all pages of the board',
    boardFromFile: 'Board from draw.io',
    page: (number: number) => `Page ${number}`,
  },
})
