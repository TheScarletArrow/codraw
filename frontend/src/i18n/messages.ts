import { defineMessages } from './i18n.ts'

export const languageMessages = defineMessages({
  ru: {
    language: 'Язык',
    current: (name: string) => `Язык: ${name}`,
  },
  en: {
    language: 'Language',
    current: (name: string) => `Language: ${name}`,
  },
})
