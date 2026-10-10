import { describe, expect, it } from 'vitest'
import type { CellData } from '../diagram/model.ts'
import { infraCells } from '../infra/infraCells.ts'
import { DiagramBuilder } from '../templates/builder.ts'
import { architectureGraph, type ImportedArchitecture } from './importModel.ts'
import { mermaidC4 } from './mermaid.ts'
import { architectureModel, modelBoundaries, modelElements, type ArchModel } from './model.ts'
import { parseArchitectureFiles } from './parseArchitecture.ts'
import { plantUml } from './plantuml.ts'
import { structurizrDsl } from './structurizr.ts'
import { c4Page, composePage } from './testPages.ts'

/**
 * A page of every kind of element and frame the export writes: a system with a group and a container of components, a
 * component outside any container, a queue, an external system, a person, and relations with and without technologies.
 */
function nestedPage(): CellData[] {
  const builder = new DiagramBuilder()
  builder.shape('c4-boundary', 0, 0, { element: { name: 'Магазин', kind: 'c4-system' }, width: 1400, height: 700 })
  builder.shape('boundary', 20, 60, { value: 'Ядро', width: 900, height: 600 })
  builder.shape('c4-boundary', 40, 120, { element: { name: 'API', kind: 'c4-container', technology: 'Kotlin' }, width: 600, height: 300 })
  const orders = builder.shape('c4-component', 60, 180, { element: { name: 'Заказы', technology: 'Spring Bean', description: 'Оформляет заказы' } })
  const stock = builder.shape('uml-component', 360, 180, { value: 'Склад\nKotlin' })
  const events = builder.shape('queue', 960, 120, { element: { name: 'События', technology: 'Kafka' }, showTechnology: true })
  const db = builder.shape('c4-database', 960, 400, { element: { name: 'База', technology: 'PostgreSQL', description: 'Заказы и остатки' } })
  const customer = builder.shape('c4-person', 0, 800, { element: { name: 'Покупатель', description: 'Выбирает товары' } })
  const payments = builder.shape('c4-external-system', 600, 800, { element: { name: 'Платежи "Быстро"' } })
  builder.edge(customer, orders, { value: 'Оформляет\n[HTTPS]', technology: 'HTTPS' })
  builder.edge(orders, stock, { value: 'Резервирует' })
  builder.edge(orders, events, { value: 'Публикует', technology: 'Kafka' })
  builder.edge(stock, db, { value: 'Читает и пишет\n[JDBC]' })
  builder.edge(orders, payments, { value: 'Проводит оплату' })
  return builder.build()
}

const FORMATS = [
  ['Structurizr DSL', 'workspace.dsl', structurizrDsl],
  ['C4-PlantUML', 'workspace.puml', plantUml],
  ['Mermaid C4', 'workspace.mmd', mermaidC4],
] as const

const PAGES = [
  ['шаблон «C4: контейнеры»', c4Page],
  ['схема docker-compose', composePage],
  ['вложенные границы и компоненты', nestedPage],
] as const

/** What a model means, without the cells it was made of: elements in their frames and relations by identifiers. */
function meaning(model: ArchModel) {
  return {
    elements: modelElements(model).map(({ id, kind, variant, external, name, technology, description }) => ({ id, kind, variant, external, name, technology, description })),
    boundaries: modelBoundaries(model).map(({ id, kind, name, children }) => ({ id, kind, name, children: children.map((child) => child.id) })),
    relations: model.relations.map(({ source, target, description, technology }) => [source.id, target.id, description, technology]),
  }
}

async function imported(text: string, name: string): Promise<{ model: ImportedArchitecture; cells: CellData[] }> {
  const { model, errors } = parseArchitectureFiles([{ name, text }])
  expect(errors).toEqual([])
  expect(model.warnings).toEqual([])
  return { model, cells: await infraCells(architectureGraph(model), { x: 0, y: 0 }, undefined, 'architecture') }
}

describe('export and import of architecture as code', () => {
  for (const [format, file, write] of FORMATS) {
    for (const [title, page] of PAGES) {
      it(`gives the same ${format} after an import of the export: ${title}`, async () => {
        const before = architectureModel(page(), 'Магазин')
        const text = write(before)
        const { cells } = await imported(text, file)
        const after = architectureModel(cells, 'Магазин')

        expect(write(after)).toBe(text)
        expect(after.skipped).toBe(0)
      })
    }
  }

  for (const [format, file, write] of FORMATS) {
    it(`keeps the meaning of the model of a page in ${format}: elements, frames and relations`, async () => {
      const before = architectureModel(nestedPage(), 'Магазин')
      const { cells } = await imported(write(before), file)
      // The macros of C4 know no escapes: the export writes double quotes as single ones.
      const quotes = (model: ArchModel) =>
        write === structurizrDsl ? meaning(model) : JSON.parse(JSON.stringify(meaning(model)).replace(/\\"/g, "'")) as ReturnType<typeof meaning>

      expect(meaning(architectureModel(cells, 'Магазин'))).toEqual(quotes(before))
    })
  }

  it('puts the containers that Structurizr declares in the system of the board into a frame of that system', async () => {
    const { cells } = await imported(structurizrDsl(architectureModel(composePage(), 'Магазин')), 'workspace.dsl')

    const system = cells.find((cell) => cell.style.codrawShape === 'c4-boundary')!
    expect(system.value).toBe('Магазин\n[Software System]')
    expect(system.style.codrawSource).toBe('architecture:frame:magazin')
  })
})
