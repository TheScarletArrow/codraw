import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { architectureGraph } from '../architecture/importModel.ts'
import { parseArchitectureFiles } from '../architecture/parseArchitecture.ts'
import { SHOP_DSL } from '../architecture/testArchitecture.ts'
import { DEFAULT_PAGE_ID, getCells, initializeDocument, readCell, writeCell } from '../diagram/model.ts'
import { infraCells } from '../infra/infraCells.ts'
import { parseTerraform } from '../infra/parseTerraform.ts'
import { terraformGraph } from '../infra/terraformGraph.ts'
import { SHOP_STATE } from '../infra/testTerraform.ts'
import { DiagramBuilder } from '../templates/builder.ts'
import { parseSql } from '../sql/parseSql.ts'
import { schemaCells } from '../sql/erDiagram.ts'
import { applySchemaUpdate } from './schemaImportUpdate.ts'

const cellsOf = (doc: Y.Doc) => Array.from(getCells(doc, DEFAULT_PAGE_ID).entries(), ([id, cell]) => readCell(id, cell))

describe('schema import update', () => {
  it('updates a matched table in place and puts a new related table beside it', async () => {
    const doc = new Y.Doc()
    initializeDocument(doc)
    const builder = new DiagramBuilder()
    const users = builder.table('users', 100, 80, ['id uuid PK', 'name text'])
    doc.transact(() => builder.build().forEach((cell) => writeCell(getCells(doc, DEFAULT_PAGE_ID), cell)))

    const imported = await schemaCells(
      parseSql('CREATE TABLE users (id uuid PRIMARY KEY, email text NOT NULL); CREATE TABLE orders (id uuid PRIMARY KEY, user_id uuid REFERENCES users(id));'),
      { x: 700, y: 80 },
      undefined,
      [],
      'sql',
    )
    const summary = applySchemaUpdate(doc, DEFAULT_PAGE_ID, imported, { id: 'alice', name: 'Алиса' })
    const cells = cellsOf(doc)
    const updatedUsers = cells.find((cell) => cell.value === 'users')!
    const orders = cells.find((cell) => cell.value === 'orders')!

    expect(summary).toMatchObject({ added: 1, removed: 0, changed: 1, matchedByName: ['users'] })
    expect(updatedUsers.id).toBe(users.id)
    expect(updatedUsers.geometry).toMatchObject({ x: 100, y: 80 })
    expect(cells.find((cell) => cell.parent === users.id && cell.value === 'email text NOT NULL')).toBeDefined()
    expect(cells.find((cell) => cell.parent === users.id && cell.value === 'name text')).toBeUndefined()
    expect(orders.geometry!.x).toBeGreaterThanOrEqual(40)
    expect(Math.abs(orders.geometry!.x - updatedUsers.geometry!.x)).toBeLessThan(500)
    expect(orders.geometry!.x).toBeLessThan(700)
  })

  it('updates the query of a view imported before and keeps its place', async () => {
    const doc = new Y.Doc()
    initializeDocument(doc)
    const ddl = (where: string) =>
      `CREATE TABLE users (id uuid PRIMARY KEY, deleted_at timestamptz); CREATE VIEW active_users AS SELECT id FROM users WHERE ${where};`
    const before = await schemaCells(parseSql(ddl('deleted_at IS NULL')), { x: 100, y: 80 }, undefined, [], 'sql')
    doc.transact(() => before.forEach((cell) => writeCell(getCells(doc, DEFAULT_PAGE_ID), cell)))
    const view = before.find((cell) => cell.value === 'active_users')!

    const after = await schemaCells(parseSql(ddl('deleted_at IS NULL AND id IS NOT NULL')), { x: 700, y: 80 }, undefined, [], 'sql')
    const summary = applySchemaUpdate(doc, DEFAULT_PAGE_ID, after)
    const updated = cellsOf(doc).find((cell) => cell.value === 'active_users')!

    expect(summary).toMatchObject({ added: 0, removed: 0, changed: 2 })
    expect(updated.id).toBe(view.id)
    expect(updated.geometry).toEqual(view.geometry)
    expect(updated.style.codrawViewQuery).toBe('SELECT id FROM users WHERE deleted_at IS NULL AND id IS NOT NULL')
  })

  it('updates a table of another layer in its layer', async () => {
    const doc = new Y.Doc()
    initializeDocument(doc)
    const builder = new DiagramBuilder()
    const users = builder.table('users', 100, 80, ['id uuid PK'])
    doc.transact(() => {
      const cells = getCells(doc, DEFAULT_PAGE_ID)
      writeCell(cells, { id: 'db', kind: 'layer', parent: '0', order: 'a1', value: 'БД', geometry: null, source: null, target: null, style: {} })
      builder.build().forEach((cell) => writeCell(cells, cell.id === users.id ? { ...cell, parent: 'db' } : cell))
    })

    const imported = await schemaCells(parseSql('CREATE TABLE users (id uuid PRIMARY KEY, email text);'), { x: 0, y: 0 }, undefined, [], 'sql')
    const summary = applySchemaUpdate(doc, DEFAULT_PAGE_ID, imported, null)

    expect(summary).toMatchObject({ added: 0, removed: 0, changed: 1 })
    expect(cellsOf(doc).find((cell) => cell.id === users.id)).toMatchObject({ parent: 'db', geometry: { x: 100, y: 80 } })
  })

  it('matches resources of Terraform by their addresses: a moved server keeps its place and gets its new details', async () => {
    const doc = new Y.Doc()
    initializeDocument(doc)
    const terraformCells = async (text: string, origin: { x: number; y: number }) =>
      infraCells(terraformGraph([await parseTerraform({ name: 'state.json', text })], { environment: true, c4: false }), origin, undefined, 'terraform')
    const before = await terraformCells(SHOP_STATE, { x: 100, y: 80 })
    const server = before.find((cell) => cell.value === 'aws_instance.web\nt3.micro, ×2')!
    doc.transact(() =>
      before.forEach((cell) => writeCell(getCells(doc, DEFAULT_PAGE_ID), cell.id === server.id ? { ...cell, geometry: { ...cell.geometry!, x: 2000, y: 1500 } } : cell)),
    )

    type Resource = { address: string; type: string; name: string; values: Record<string, unknown> }
    const state = JSON.parse(SHOP_STATE) as { values: { root_module: { resources: Resource[] } } }
    const resources = state.values.root_module.resources
    for (const resource of resources) if (resource.address.startsWith('aws_instance.web')) resource.values.instance_type = 't3.large'
    const vpc = resources.find((resource) => resource.address === 'aws_vpc.main')!
    resources.push({ ...vpc, address: 'aws_lb.web', type: 'aws_lb', name: 'web', values: { load_balancer_type: 'application' } })
    const summary = applySchemaUpdate(doc, DEFAULT_PAGE_ID, await terraformCells(JSON.stringify(state), { x: 900, y: 80 }))
    const cells = cellsOf(doc)
    const updated = cells.find((cell) => cell.id === server.id)!

    expect(summary).toMatchObject({ added: 1, removed: 0, changed: 8, matchedByName: [] })
    expect(updated.value).toBe('aws_instance.web\nt3.large, ×2')
    expect(updated.geometry).toMatchObject({ x: 2000, y: 1500 })
    expect(updated.style.codrawDescription).toContain('instance_type = t3.large')
    expect(cells.find((cell) => cell.value === 'aws_lb.web\napplication')!.style).toMatchObject({
      codrawShape: 'load-balancer',
      codrawSource: 'terraform:node:aws_lb.web',
    })
  })

  it('matches elements of architecture as code by their identifiers: a moved container keeps its place and gets its new technology', async () => {
    const doc = new Y.Doc()
    initializeDocument(doc)
    const architectureCells = (text: string, origin: { x: number; y: number }) =>
      infraCells(architectureGraph(parseArchitectureFiles([{ name: 'workspace.dsl', text }]).model), origin, undefined, 'architecture')
    const before = await architectureCells(SHOP_DSL, { x: 100, y: 80 })
    const api = before.find((cell) => cell.style.codrawSource === 'architecture:node:api')!
    doc.transact(() =>
      before.forEach((cell) => writeCell(getCells(doc, DEFAULT_PAGE_ID), cell.id === api.id ? { ...cell, geometry: { ...cell.geometry!, x: 2000, y: 1500 } } : cell)),
    )

    const changed = SHOP_DSL.replace('"Заказы" "Spring Boot"', '"Заказы" "Ktor"').replace(
      '            api = container',
      '            worker = container "worker" "" "Go"\n            api = container',
    )
    const summary = applySchemaUpdate(doc, DEFAULT_PAGE_ID, await architectureCells(changed, { x: 900, y: 80 }))
    const cells = cellsOf(doc)
    const updated = cells.find((cell) => cell.id === api.id)!

    expect(summary).toMatchObject({ added: 1, removed: 0, matchedByName: [] })
    expect(updated.value).toBe('API\n[Container: Ktor]\nЗаказы')
    expect(updated.style.codrawTechnology).toBe('Ktor')
    expect(updated.geometry).toMatchObject({ x: 2000, y: 1500 })
    expect(cells.find((cell) => cell.style.codrawSource === 'architecture:node:worker')).toMatchObject({ value: 'worker\n[Container: Go]' })
  })
})
