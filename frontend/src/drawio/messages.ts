import { defineMessages } from '../i18n/i18n.ts'

export const drawioMessages = defineMessages({
  ru: {
    notDrawio: 'Это не файл draw.io',
    exportLabel: 'Экспорт в .drawio',
    exportTitle: 'Экспорт в .drawio: все страницы доски',
    boardFromFile: 'Доска из draw.io',
    page: (number: number) => `Страница ${number}`,
  },
  en: {
    notDrawio: 'This is not a draw.io file',
    exportLabel: 'Export to .drawio',
    exportTitle: 'Export to .drawio: all pages of the board',
    boardFromFile: 'Board from draw.io',
    page: (number: number) => `Page ${number}`,
  },
})
