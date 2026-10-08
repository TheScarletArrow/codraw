import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { DEFAULT_PAGE_ID, getCells, initializeDocument, readCell, writeCell } from '../diagram/model.ts'
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
})
