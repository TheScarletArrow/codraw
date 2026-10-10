import { defineMessages } from '../i18n/i18n.ts'

export const mermaidMessages = defineMessages({
  ru: {
    flowchartSummary: (nodes: number, edges: number, frames: number, skipped: number) =>
      `Узлов: ${nodes}, связей: ${edges}, рамок: ${frames}, пропущено строк: ${skipped}`,
    sequenceSummary: (participants: number, messages: number, frames: number, notes: number, skipped: number) =>
      `Участников: ${participants}, сообщений: ${messages}, рамок: ${frames}, заметок: ${notes}, пропущено строк: ${skipped}`,
    erSummary: (tables: number, relations: number, skipped: number) =>
      `Таблиц: ${tables}, связей: ${relations}, пропущено строк: ${skipped}`,
    unsupportedKind:
      'CoDraw рисует из Mermaid блок-схемы (flowchart, graph), ER-диаграммы (erDiagram) и диаграммы последовательности (sequenceDiagram)',
  },
  en: {
    flowchartSummary: (nodes: number, edges: number, frames: number, skipped: number) =>
      `Nodes: ${nodes}, connectors: ${edges}, frames: ${frames}, lines skipped: ${skipped}`,
    sequenceSummary: (participants: number, messages: number, frames: number, notes: number, skipped: number) =>
      `Participants: ${participants}, messages: ${messages}, frames: ${frames}, notes: ${notes}, lines skipped: ${skipped}`,
    erSummary: (tables: number, relations: number, skipped: number) =>
      `Tables: ${tables}, relationships: ${relations}, lines skipped: ${skipped}`,
    unsupportedKind:
      'CoDraw draws flowcharts (flowchart, graph), ER diagrams (erDiagram) and sequence diagrams (sequenceDiagram) from Mermaid',
  },
})
