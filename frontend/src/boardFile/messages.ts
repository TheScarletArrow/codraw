import { defineMessages } from '../i18n/i18n.ts'

export const boardFileMessages = defineMessages({
  ru: {
    notBoardFile: 'Это не файл CoDraw или draw.io',
    damaged: 'Файл .codraw повреждён',
    newerVersion: 'Файл сохранён более новой версией CoDraw',
    importFailed: 'Не удалось импортировать файл',
    saveFailed: 'Не удалось сохранить файл',
    fileInput: 'Файл CoDraw или draw.io',
    importLabel: 'Импорт из файла',
    importTitle: 'Импорт из файла .codraw или .drawio: страницы файла добавятся к доске',
    saveLabel: 'Сохранить в .codraw',
    saveTitle: 'Сохранить в .codraw: вся доска без потерь, файл открывается в CoDraw',
  },
  en: {
    notBoardFile: 'This is not a CoDraw or draw.io file',
    damaged: 'The .codraw file is damaged',
    newerVersion: 'The file was saved by a newer version of CoDraw',
    importFailed: 'Could not import the file',
    saveFailed: 'Could not save the file',
    fileInput: 'CoDraw or draw.io file',
    importLabel: 'Import from file',
    importTitle: 'Import from a .codraw or .drawio file: the pages of the file are added to the board',
    saveLabel: 'Save as .codraw',
    saveTitle: 'Save as .codraw: the whole board without losses, the file opens in CoDraw',
  },
})
