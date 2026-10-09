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
})
