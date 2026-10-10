import type { InfraFormat } from '../infra/formats.ts'
import {
  architectureGraph,
  architectureGraphError,
  architectureImportSummary,
  architectureWarnings,
  MAX_ARCHITECTURE_NODES,
  type ImportedArchitecture,
} from './importModel.ts'
import { MAX_ARCHITECTURE_SIZE, parseArchitectureFiles } from './parseArchitecture.ts'

/**
 * «Импорт архитектуры как кода» in the window of the imports of infrastructure: Structurizr DSL, C4-PlantUML and Mermaid
 * C4, each file in its format, all of them one model.
 */
export const ARCHITECTURE: InfraFormat<ImportedArchitecture> = {
  title: 'Импорт архитектуры как кода',
  textLabel: 'Архитектура как код',
  placeholder: 'workspace {\n  model {\n    user = person "Покупатель"\n    shop = softwareSystem "Магазин"\n    user -> shop "Покупает"\n  }\n}',
  filesLabel: 'Файлы архитектуры',
  accept: '.dsl,.puml,.plantuml,.iuml,.pu,.wsd,.mmd,.mermaid,.txt',
  hint: 'Structurizr DSL (workspace), C4-PlantUML (@startuml с макросами C4) или Mermaid C4 (C4Context, C4Container, C4Component); несколько файлов — одна модель',
  options: [],
  maxSize: MAX_ARCHITECTURE_SIZE,
  limits: [
    'Читаются люди, системы, контейнеры и компоненты, их имена, технологии, описания, теги и ссылки, группы и границы, узлы развёртывания C4-PlantUML и отношения с описанием и технологией.',
    'Система с контейнерами и контейнер с компонентами становятся «Границей системы» C4 с частями внутри; связь с ними не рисуется, если её уже показывают связи частей.',
    'Элемент, повторённый в нескольких файлах (контекст и контейнеры) или объявлениях, — одна фигура: повтор узнаётся по идентификатору, а в другом файле — по уровню, имени и границе.',
    'Не переносятся развёртывание Structurizr, представления и стили (страница раскладывается автоматически, представления строит «Новое представление»), element, archetypes, !docs, !adrs и заметки; внешние люди, контейнеры и компоненты становятся обычными.',
    '!include, !script, !plugin, workspace extends и препроцессор PlantUML не выполняются и ничего не загружают: включённые файлы откройте вместе с остальными. Файлы разбираются в браузере и никуда не отправляются.',
    `Файл — до ${MAX_ARCHITECTURE_SIZE / 1024 / 1024} МБ, за раз — до ${MAX_ARCHITECTURE_NODES} элементов и границ.`,
  ],
  parse: async (sources) => {
    const { model, errors } = parseArchitectureFiles(sources)
    return { parsed: model, errors }
  },
  isEmpty: (model) => model.nodes.size === 0,
  graph: (model) => architectureGraph(model),
  summary: (_, graph) => architectureImportSummary(graph),
  error: architectureGraphError,
  warnings: (model) => architectureWarnings(model),
}
