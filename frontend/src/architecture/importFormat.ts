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
import { architectureMessages as m } from './messages.ts'

/**
 * «Импорт архитектуры как кода» in the window of the imports of infrastructure: Structurizr DSL, C4-PlantUML and Mermaid
 * C4, each file in its format, all of them one model.
 */
export const ARCHITECTURE: InfraFormat<ImportedArchitecture> = {
  title: m.importTitle,
  source: m.importSource,
  textLabel: m.textLabel,
  placeholder: m.placeholder,
  filesLabel: m.filesLabel,
  accept: '.dsl,.puml,.plantuml,.iuml,.pu,.wsd,.mmd,.mermaid,.txt',
  hint: m.hint,
  options: [],
  maxSize: MAX_ARCHITECTURE_SIZE,
  limits: m.limits(MAX_ARCHITECTURE_SIZE / 1024 / 1024, MAX_ARCHITECTURE_NODES),
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
