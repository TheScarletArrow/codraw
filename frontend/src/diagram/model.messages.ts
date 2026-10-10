import { defineMessages } from '../i18n/i18n.ts'

/**
 * The texts of the model of a board: the names CoDraw gives to new pages, layers and elements, and the words for what
 * the document keeps. The document keeps keys (`draft`, `added`, `landscape`…); these texts only show them.
 */
export const modelMessages = defineMessages({
  ru: {
    page: (number: number) => `Страница ${number}`,
    pageCopy: (name: string) => `${name} (копия)`,
    mainLayer: 'Основной слой',
    unnamedLayer: 'Слой без имени',
    layer: (number: number) => `Слой ${number}`,
    unnamed: 'Без имени',
    component: 'Компонент',
    detailPage: { containers: (name: string) => `${name}: контейнеры`, components: (name: string) => `${name}: компоненты` },
    apiResponse: 'Ответ',
    modified: (name: string, mine: boolean, when: string) => `Изменено: ${name}${mine ? ' (вы)' : ''}, ${when}`,
    lockedBy: (names: string) => `Закреплено: ${names}`,
    locked: 'Закреплено',
    andMore: (labels: string, more: number) => `${labels}; и ещё ${more}`,
    notSpecified: 'Не указан',
  },
  en: {
    page: (number: number) => `Page ${number}`,
    pageCopy: (name: string) => `${name} (copy)`,
    mainLayer: 'Main layer',
    unnamedLayer: 'Untitled layer',
    layer: (number: number) => `Layer ${number}`,
    unnamed: 'Untitled',
    component: 'Component',
    detailPage: { containers: (name: string) => `${name}: containers`, components: (name: string) => `${name}: components` },
    apiResponse: 'Response',
    modified: (name: string, mine: boolean, when: string) => `Changed by ${name}${mine ? ' (you)' : ''}, ${when}`,
    lockedBy: (names: string) => `Locked: ${names}`,
    locked: 'Locked',
    andMore: (labels: string, more: number) => `${labels}; and ${more} more`,
    notSpecified: 'Not specified',
  },
})

/** What a status of an element is called. */
export const statusLabels = defineMessages({
  ru: { draft: 'Черновик', review: 'Нужно ревью', done: 'Готово' },
  en: { draft: 'Draft', review: 'Needs review', done: 'Done' },
})

/** What a mark of the plan is called. */
export const planLabels = defineMessages({
  ru: { added: 'Появится', removed: 'Уйдёт' },
  en: { added: 'Will appear', removed: 'Will go' },
})

/** What a view of the plan is called. */
export const planViewLabels = defineMessages({
  ru: { diff: 'Разница', current: 'Как есть', target: 'Как будет' },
  en: { diff: 'Difference', current: 'As is', target: 'To be' },
})

/** Where a parameter of an HTTP call goes. */
export const locationLabels = defineMessages({
  ru: { path: 'путь', query: 'запрос', header: 'заголовок', cookie: 'cookie' },
  en: { path: 'path', query: 'query', header: 'header', cookie: 'cookie' },
})

/** The kinds of views of the model. */
export const viewKindLabels = defineMessages({
  ru: {
    landscape: 'Ландшафт',
    context: 'Система и её окружение',
    containers: 'Контейнеры системы',
    components: 'Компоненты контейнера',
    deployment: 'Развёртывание окружения',
  },
  en: {
    landscape: 'Landscape',
    context: 'System and its context',
    containers: 'Containers of a system',
    components: 'Components of a container',
    deployment: 'Deployment of an environment',
  },
})

/** The facets of the slice of a view. */
export const sliceLabels = defineMessages({
  ru: { owners: 'Команды', tags: 'Теги', technologies: 'Технологии' },
  en: { owners: 'Teams', tags: 'Tags', technologies: 'Technologies' },
})

/** The names of the pages of views and the titles of their bars. */
export const viewMessages = defineMessages({
  ru: {
    noEnvironment: 'без окружения',
    unnamed: 'Без имени',
    unnamedLower: 'без имени',
    landscape: 'Ландшафт',
    contextPage: (name: string) => `${name}: окружение`,
    containersPage: (name: string) => `${name}: контейнеры`,
    componentsPage: (name: string) => `${name}: компоненты`,
    deploymentPage: (environment: string) => `Развёртывание: ${environment}`,
    contextTitle: (name: string) => `Система ${name} и её окружение`,
    containersTitle: (name: string) => `Контейнеры системы ${name}`,
    componentsTitle: (name: string) => `Компоненты контейнера ${name}`,
    deploymentTitle: (environment: string) => `Развёртывание окружения ${environment}`,
    deploymentWithoutEnvironment: 'Развёртывание узлов без окружения',
  },
  en: {
    noEnvironment: 'no environment',
    unnamed: 'Untitled',
    unnamedLower: 'untitled',
    landscape: 'Landscape',
    contextPage: (name: string) => `${name}: context`,
    containersPage: (name: string) => `${name}: containers`,
    componentsPage: (name: string) => `${name}: components`,
    deploymentPage: (environment: string) => `Deployment: ${environment}`,
    contextTitle: (name: string) => `System ${name} and its context`,
    containersTitle: (name: string) => `Containers of the system ${name}`,
    componentsTitle: (name: string) => `Components of the container ${name}`,
    deploymentTitle: (environment: string) => `Deployment of the environment ${environment}`,
    deploymentWithoutEnvironment: 'Deployment of the nodes without an environment',
  },
})
