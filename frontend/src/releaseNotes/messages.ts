import { defineMessages } from '../i18n/i18n.ts'

/** The texts of the window «Что нового»; the novelties themselves are in both languages in `releases.ts`. */
export const whatsNewMessages = defineMessages({
  ru: {
    whatsNew: 'Что нового',
    heading: 'Что нового в CoDraw',
    version: (version: string) => `Версия ${version}`,
    allVersions: 'Все версии',
  },
  en: {
    whatsNew: 'What’s new',
    heading: 'What’s new in CoDraw',
    version: (version: string) => `Version ${version}`,
    allVersions: 'All versions',
  },
})
