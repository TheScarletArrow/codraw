import { defineMessages } from '../i18n/i18n.ts'

/** The texts of the frame of the help: its title, search and contents; the topics themselves are in `topics.messages.ts`. */
export const helpMessages = defineMessages({
  ru: {
    help: 'Справка',
    helpHint: 'Справка: что умеет CoDraw и как этим пользоваться',
    title: 'Справка CoDraw',
    intro:
      'Что умеет CoDraw и где это найти. Ищите по словам или откройте раздел в содержании; у каждой темы есть своя ссылка.',
    search: 'Поиск по справке',
    searchPlaceholder: 'Например, слои, PDF или комментарии',
    nothingFound: 'Ничего не найдено. Попробуйте другие слова.',
    contents: 'Содержание',
    topicLink: (title: string) => `Ссылка на тему «${title}»`,
    shortcuts: 'Горячие клавиши',
    shortcutsIntro: 'Те же сочетания показывает окно «Горячие клавиши» в редакторе: кнопка с клавиатурой или клавиша ?.',
    documents: 'Документы',
    terms: 'Условия использования',
    privacy: 'Политика конфиденциальности',
    backToApp: 'Вернуться в CoDraw',
  },
  en: {
    help: 'Help',
    helpHint: 'Help: what CoDraw can do and how to use it',
    title: 'CoDraw help',
    intro:
      'What CoDraw can do and where to find it. Search by words or open a section in the contents; every topic has a link of its own.',
    search: 'Search the help',
    searchPlaceholder: 'For example, layers, PDF or comments',
    nothingFound: 'Nothing found. Try other words.',
    contents: 'Contents',
    topicLink: (title: string) => `Link to the topic “${title}”`,
    shortcuts: 'Keyboard shortcuts',
    shortcutsIntro: 'The “Keyboard shortcuts” window of the editor shows the same keys: the button with the keyboard or the ? key.',
    documents: 'Documents',
    terms: 'Terms of use',
    privacy: 'Privacy policy',
    backToApp: 'Back to CoDraw',
  },
})
