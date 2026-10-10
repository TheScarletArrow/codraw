import { defineMessages } from '../i18n/i18n.ts'

export const errorsMessages = defineMessages({
  ru: {
    title: 'Что-то пошло не так',
    text: 'Страница не смогла отрисоваться. Мы уже получили отчёт об ошибке. Изменения на досках сохраняются сами, так что обновить страницу безопасно.',
    reload: 'Обновить страницу',
  },
  en: {
    title: 'Something went wrong',
    text: 'The page could not be drawn. We have already received an error report. Changes on boards are saved automatically, so it is safe to reload the page.',
    reload: 'Reload the page',
  },
})
