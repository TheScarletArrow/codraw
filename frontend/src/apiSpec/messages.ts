import { defineMessages } from '../i18n/i18n.ts'

/** The texts that the imports of files share: reading the files and the common controls of an import window. */
export const documentMessages = defineMessages({
  ru: {
    back: 'Назад',
    addToPage: 'Добавить на страницу',
    updateViaProposal: 'Обновить через предложение',
    openFiles: 'Открыть файлы',
    fileCount: 'Файлов:',
    parsing: 'Разбор…',
    text: 'Текст',
    tooLarge: (name: string, megabytes: number) => `${name}: файл больше ${megabytes} МБ`,
    yamlUnavailable: (name: string) => `${name}: не удалось загрузить разбор YAML — проверьте подключение к сети`,
    syntaxError: (name: string, line: number, column: number, reason: string) =>
      `${name}: строка ${line}, столбец ${column} — ${reason}`,
    tooManyAliases: (name: string) => `${name}: слишком много ссылок на якоря YAML`,
    yamlReasons: {
      badIndent: 'неверный отступ',
      tabAsIndent: 'табуляция в отступе',
      duplicateKey: 'ключ повторяется',
      missingChar: 'не хватает закрывающего символа',
      multipleDocs: 'в файле несколько документов',
      badAlias: 'ссылка на неизвестный якорь',
      multilineKey: 'ключ на нескольких строках',
      unexpectedToken: 'неожиданный символ',
      other: 'ошибка синтаксиса',
    },
  },
  en: {
    back: 'Back',
    addToPage: 'Add to page',
    updateViaProposal: 'Update via a change proposal',
    openFiles: 'Open files',
    fileCount: 'Files:',
    parsing: 'Parsing…',
    text: 'Text',
    tooLarge: (name: string, megabytes: number) => `${name}: the file is larger than ${megabytes} MB`,
    yamlUnavailable: (name: string) => `${name}: could not load the YAML parser — check the network connection`,
    syntaxError: (name: string, line: number, column: number, reason: string) =>
      `${name}: line ${line}, column ${column} — ${reason}`,
    tooManyAliases: (name: string) => `${name}: too many references to YAML anchors`,
    yamlReasons: {
      badIndent: 'wrong indentation',
      tabAsIndent: 'tab in indentation',
      duplicateKey: 'duplicate key',
      missingChar: 'missing closing character',
      multipleDocs: 'several documents in the file',
      badAlias: 'reference to an unknown anchor',
      multilineKey: 'key spans several lines',
      unexpectedToken: 'unexpected character',
      other: 'syntax error',
    },
  },
})

export const apiSpecMessages = defineMessages({
  ru: {
    hint: 'OpenAPI 3 или Swagger 2.0, AsyncAPI 2 или 3 — в YAML или JSON',
    parseFailed: 'Не удалось разобрать документы',
    title: 'Импорт OpenAPI / AsyncAPI',
    textLabel: 'OpenAPI или AsyncAPI',
    filesLabel: 'Файлы OpenAPI и AsyncAPI',
    modelsTitle: 'Схемы данных — таблицами с полем на свойство и связями по $ref',
    models: 'Модели таблицами',
    sourceFiles: (count: number) => `${count} файлов OpenAPI / AsyncAPI`,
    summary: (services: number, endpoints: number, topics: number, models: number, links: number, skipped: number) =>
      `Сервисов: ${services}, эндпоинтов: ${endpoints}, топиков: ${topics}, ` +
      `моделей: ${models}, связей: ${links}, пропущено ссылок: ${skipped}`,
    tooManyModels: (count: number, max: number) =>
      `Слишком много моделей: ${count}, за раз можно добавить не больше ${max} — ` +
      'снимите «Модели таблицами» или откройте меньше файлов',
    tooManyTopics: (count: number, max: number) =>
      `Слишком много топиков: ${count}, за раз можно добавить не больше ${max} — откройте меньше файлов`,
    unsupportedVersion: (name: string, format: string, version: string) =>
      `${name}: ${format} ${version} не поддерживается — CoDraw читает OpenAPI 3, Swagger 2.0 и AsyncAPI 2 и 3`,
    notApiSpec: (name: string) => `${name}: это не OpenAPI и не AsyncAPI — нет поля openapi, swagger или asyncapi`,
  },
  en: {
    hint: 'OpenAPI 3 or Swagger 2.0, AsyncAPI 2 or 3 — in YAML or JSON',
    parseFailed: 'Could not parse the documents',
    title: 'Import OpenAPI / AsyncAPI',
    textLabel: 'OpenAPI or AsyncAPI',
    filesLabel: 'OpenAPI and AsyncAPI files',
    modelsTitle: 'Data schemas as tables with a field per property and relationships by $ref',
    models: 'Models as tables',
    sourceFiles: (count: number) => `${count} OpenAPI / AsyncAPI files`,
    summary: (services: number, endpoints: number, topics: number, models: number, links: number, skipped: number) =>
      `Services: ${services}, endpoints: ${endpoints}, topics: ${topics}, ` +
      `models: ${models}, connectors: ${links}, references skipped: ${skipped}`,
    tooManyModels: (count: number, max: number) =>
      `Too many models: ${count}, at most ${max} can be added at once — ` +
      'clear “Models as tables” or open fewer files',
    tooManyTopics: (count: number, max: number) =>
      `Too many topics: ${count}, at most ${max} can be added at once — open fewer files`,
    unsupportedVersion: (name: string, format: string, version: string) =>
      `${name}: ${format} ${version} is not supported — CoDraw reads OpenAPI 3, Swagger 2.0 and AsyncAPI 2 and 3`,
    notApiSpec: (name: string) => `${name}: this is neither OpenAPI nor AsyncAPI — there is no openapi, swagger or asyncapi field`,
  },
})
