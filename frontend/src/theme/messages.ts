import { defineMessages } from '../i18n/i18n.ts'

export const themeMessages = defineMessages({
  ru: {
    theme: 'Тема',
    current: (label: string) => `Тема: ${label}`,
    system: 'Как в системе',
    light: 'Светлая',
    dark: 'Тёмная',
  },
  en: {
    theme: 'Theme',
    current: (label: string) => `Theme: ${label}`,
    system: 'As in the system',
    light: 'Light',
    dark: 'Dark',
  },
})
