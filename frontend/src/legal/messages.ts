import { defineMessages, pluralEn, pluralRu } from '../i18n/i18n.ts'

/**
 * The short texts of the legal pages: their titles, the frame of the page and the operator. The texts of the policy and
 * the terms themselves are whole pages in each language: `PrivacyPage.ru.tsx`, `PrivacyPage.en.tsx` and so on.
 */
export const legalMessages = defineMessages({
  ru: {
    privacy: 'Политика конфиденциальности',
    terms: 'Условия использования',
    updated: (date: string) => `Обновлено ${date}`,
    loading: 'Загрузка…',
    loadFailed: 'Не удалось загрузить данные оператора. Обновите страницу.',
    documents: 'Документы',
    backToApp: 'Вернуться в CoDraw',
    operatorUnknown:
      'Оператор этой установки CoDraw не указал свои данные. Прежде чем пользоваться сервисом, узнайте, кто его предоставляет.',
    operator: (name: string) => `Оператор сервиса — ${name}.`,
    operatorNotNamed: 'не указан',
    contact: 'Адрес для обращений:',
    noContact: 'Адрес для обращений оператор не указал.',
    days: (count: number) => `${count} ${pluralRu(count, 'день', 'дня', 'дней')}`,
  },
  en: {
    privacy: 'Privacy policy',
    terms: 'Terms of use',
    updated: (date: string) => `Updated ${date}`,
    loading: 'Loading…',
    loadFailed: 'Could not load the details of the operator. Reload the page.',
    documents: 'Documents',
    backToApp: 'Back to CoDraw',
    operatorUnknown:
      'The operator of this installation of CoDraw has not provided their details. Before using the service, find out who provides it.',
    operator: (name: string) => `The operator of the service is ${name}.`,
    operatorNotNamed: 'not named',
    contact: 'Contact address:',
    noContact: 'The operator has not provided a contact address.',
    days: (count: number) => `${count} ${pluralEn(count, 'day', 'days')}`,
  },
})
