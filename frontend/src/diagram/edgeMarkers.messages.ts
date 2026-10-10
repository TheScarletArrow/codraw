import { defineMessages } from '../i18n/i18n.ts'

/** The names of the markers of the ends of an edge, by the value of the choice. */
export const edgeMarkerMessages = defineMessages({
  ru: {
    classic: 'Стрелка',
    none: 'Без маркера',
    ERone: 'Один',
    ERmandOne: 'Обязательно один',
    ERmany: 'Много',
    ERoneToMany: 'Один или много',
    ERzeroToOne: 'Ноль или один',
    ERzeroToMany: 'Ноль или много',
    open: 'Открытая стрелка',
    blockHollow: 'Полый треугольник',
  },
  en: {
    classic: 'Arrow',
    none: 'No marker',
    ERone: 'One',
    ERmandOne: 'Exactly one',
    ERmany: 'Many',
    ERoneToMany: 'One or many',
    ERzeroToOne: 'Zero or one',
    ERzeroToMany: 'Zero or many',
    open: 'Open arrow',
    blockHollow: 'Hollow triangle',
  },
})
