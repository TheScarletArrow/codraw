import { defineMessages } from '../i18n/i18n.ts'

export const tableShapeMessages = defineMessages({
  ru: {
    fieldPlaceholder: 'имя поля',
    indexPlaceholder: 'имя (столбцы)',
    indexes: 'Индексы',
    icons: {
      key: 'Ключ — первичный ключ',
      link: 'Звено — внешний ключ',
      unique: 'Ромб — уникальное значение (UNIQUE)',
      index: 'Молния — поле входит в индекс',
    },
    uniqueIndexIcon: 'Ромб — уникальный индекс',
    indexIcon: 'Молния — индекс',
  },
  en: {
    fieldPlaceholder: 'field name',
    indexPlaceholder: 'name (columns)',
    indexes: 'Indexes',
    icons: {
      key: 'Key — primary key',
      link: 'Link — foreign key',
      unique: 'Diamond — unique value (UNIQUE)',
      index: 'Bolt — part of an index',
    },
    uniqueIndexIcon: 'Diamond — unique index',
    indexIcon: 'Bolt — index',
  },
})
