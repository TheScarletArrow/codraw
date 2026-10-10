import { defineMessages } from '../i18n/i18n.ts'

export const legendMessages = defineMessages({
  ru: {
    noFill: 'без заливки',
    dashed: 'пунктир',
    noArrow: 'без стрелки',
    bothWays: 'в обе стороны',
    openArrow: 'открытая стрелка',
    hollowTriangle: 'полый треугольник',
    noLine: 'без линии',
    edge: 'Связь',
    interactionEdge: { sync: 'Синхронная связь', async: 'Асинхронная связь' },
    empty: 'Нет фигур и связей',
    more: (count: number) => `…и ещё ${count}`,
  },
  en: {
    noFill: 'no fill',
    dashed: 'dashed',
    noArrow: 'no arrow',
    bothWays: 'both ways',
    openArrow: 'open arrow',
    hollowTriangle: 'hollow triangle',
    noLine: 'no line',
    edge: 'Connector',
    interactionEdge: { sync: 'Synchronous connector', async: 'Asynchronous connector' },
    empty: 'No shapes or connectors',
    more: (count: number) => `…and ${count} more`,
  },
})

