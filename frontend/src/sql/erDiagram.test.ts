import { describe, expect, it } from 'vitest'
import { BASE_KEY, INHERITED_KEY } from '../diagram/baseTables.ts'
import { LAYER_CELL_ID, type CellData } from '../diagram/model.ts'
import { DiagramBuilder } from '../templates/builder.ts'
import {
  diagramSchema,
  diagramTables,
  fieldLabel,
  parseFieldLabel,
  placeBeside,
  quoteName,
  schemaCells,
  schemaMermaid,
  schemaSql,
} from './erDiagram.ts'
import { parseSql } from './parseSql.ts'

const DDL = `
  CREATE TABLE users (id uuid PRIMARY KEY, email text NOT NULL UNIQUE, "Full Name" text);
  CREATE TABLE boards (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL REFERENCES users (id),
    reviewer_id uuid REFERENCES users
  );
  CREATE TABLE board_members (board_id uuid REFERENCES boards, user_id uuid REFERENCES users, PRIMARY KEY (board_id, user_id));
`

const tables = (cells: CellData[]) => cells.filter((cell) => cell.kind === 'vertex' && cell.parent === LAYER_CELL_ID)
const fields = (cells: CellData[], table: CellData) => cells.filter((cell) => cell.parent === table.id).map((cell) => cell.value)
const byValue = (cells: CellData[], value: string) => cells.find((cell) => cell.value === value)!

describe('fields of tables', () => {
  it('writes a column as name, type and its keys', () => {
    expect(fieldLabel({ name: 'id', type: 'uuid', primaryKey: true, notNull: true, unique: false }, false)).toBe('id uuid PK')
    expect(fieldLabel({ name: 'owner_id', type: 'uuid', primaryKey: false, notNull: true, unique: false }, true)).toBe(
      'owner_id uuid FK NOT NULL',
    )
    expect(fieldLabel({ name: 'Full Name', type: 'text', primaryKey: false, notNull: false, unique: true }, false)).toBe(
      '"Full Name" text UNIQUE',
    )
  })

  it('reads a field as written by the import and as people type it', () => {
    expect(parseFieldLabel('owner_id uuid FK NOT NULL')).toMatchObject({ name: 'owner_id', type: 'uuid', foreignKey: true, notNull: true })
    expect(parseFieldLabel('"Full Name" varchar(100) UNIQUE')).toMatchObject({ name: 'Full Name', type: 'varchar(100)', unique: true })
    expect(parseFieldLabel('created_at timestamptz NOT NULL DEFAULT now()')).toMatchObject({ type: 'timestamptz', notNull: true })
    expect(parseFieldLabel('id uuid PK')).toMatchObject({ primaryKey: true, notNull: true })
    expect(parseFieldLabel('title')).toMatchObject({ name: 'title', type: 'text' })
    expect(parseFieldLabel('<b>price</b> numeric(10, 2)')).toMatchObject({ name: 'price', type: 'numeric(10, 2)' })
    expect(parseFieldLabel('   ')).toBeNull()
  })

  it('quotes names that are not plain identifiers or that PostgreSQL reserves', () => {
    expect(quoteName('users')).toBe('users')
    expect(quoteName('User')).toBe('"User"')
    expect(quoteName('order')).toBe('"order"')
    expect(quoteName('a"b')).toBe('"a""b"')
  })
})

describe('tables of a schema as cells', () => {
  it('makes a table per table with a field per column, and an edge from each referencing field to the referenced one', async () => {
    const cells = await schemaCells(parseSql(DDL), { x: 500, y: 100 })

    expect(tables(cells).map((cell) => cell.value)).toEqual(['users', 'boards', 'board_members'])
    expect(fields(cells, byValue(cells, 'boards'))).toEqual(['id uuid PK', 'owner_id uuid FK NOT NULL', 'reviewer_id uuid FK'])
    const edges = cells.filter((cell) => cell.kind === 'edge')
    expect(edges).toHaveLength(4)
    const owner = edges.find((edge) => edge.source === byValue(cells, 'owner_id uuid FK NOT NULL').id)!
    expect(owner.target).toBe(cells.find((cell) => cell.value === 'id uuid PK' && cell.parent === byValue(cells, 'users').id)!.id)
    expect(owner.style).toMatchObject({ startArrow: 'ERzeroToMany', endArrow: 'ERmandOne' })
    const reviewer = edges.find((edge) => edge.source === byValue(cells, 'reviewer_id uuid FK').id)!
    expect(reviewer.style).toMatchObject({ endArrow: 'ERzeroToOne' })
  })

  it('makes tables of PostgreSQL with auto width, wide enough for the references of their fields', async () => {
    const cells = await schemaCells(parseSql(DDL), { x: 500, y: 100 })
    const boards = byValue(cells, 'boards')
    const plain = await schemaCells(parseSql('CREATE TABLE boards (id uuid PRIMARY KEY, owner_id uuid NOT NULL, reviewer_id uuid);'), {
      x: 0,
      y: 0,
    })

    expect(boards.style).toMatchObject({ dbVendor: 'postgresql', autosize: true })
    expect(boards.geometry!.width).toBeGreaterThan(byValue(plain, 'boards').geometry!.width)
  })

  it('lays the tables out from the referencing to the referenced, from the given corner, without overlaps', async () => {
    const cells = await schemaCells(parseSql(DDL), { x: 500, y: 100 })
    const [users, boards, members] = ['users', 'boards', 'board_members'].map((name) => byValue(cells, name).geometry!)

    expect(Math.min(users!.x, boards!.x, members!.x)).toBe(500)
    expect(Math.min(users!.y, boards!.y, members!.y)).toBe(100)
    expect(members!.x + members!.width).toBeLessThanOrEqual(boards!.x)
    expect(boards!.x + boards!.width).toBeLessThanOrEqual(users!.x)
  })

  it('puts new cells to the right of the shapes of the page, or near the corner of an empty page', () => {
    const builder = new DiagramBuilder()
    builder.shape('rectangle', 100, 50, { width: 200, height: 60 })
    builder.shape('rectangle', 400, 300, { width: 100, height: 60 })

    expect(placeBeside(builder.build())).toEqual({ x: 580, y: 50 })
    expect(placeBeside([])).toEqual({ x: 40, y: 40 })
    // Shapes of every layer of the page.
    const layer = { id: 'infra', kind: 'layer', parent: '0', order: 'a1', value: '', geometry: null, source: null, target: null, style: {} } as const
    const cells = builder.build().map((cell) => (cell.geometry?.x === 400 ? { ...cell, parent: layer.id } : cell))
    expect(placeBeside([layer, ...cells])).toEqual({ x: 580, y: 50 })
  })
})

describe('the schema of a diagram', () => {
  it('goes from DDL to cells and back to the same tables, keys and references', async () => {
    const schema = diagramSchema(await schemaCells(parseSql(DDL), { x: 0, y: 0 }))

    expect(schemaSql(schema)).toBe(
      [
        'CREATE TABLE users (\n    id uuid PRIMARY KEY,\n    email text NOT NULL UNIQUE,\n    "Full Name" text\n);',
        'CREATE TABLE boards (\n    id uuid PRIMARY KEY,\n    owner_id uuid NOT NULL,\n    reviewer_id uuid\n);',
        'CREATE TABLE board_members (\n    board_id uuid,\n    user_id uuid,\n    PRIMARY KEY (board_id, user_id)\n);',
        [
          'ALTER TABLE boards ADD FOREIGN KEY (owner_id) REFERENCES users (id);',
          'ALTER TABLE boards ADD FOREIGN KEY (reviewer_id) REFERENCES users (id);',
          'ALTER TABLE board_members ADD FOREIGN KEY (board_id) REFERENCES boards (id);',
          'ALTER TABLE board_members ADD FOREIGN KEY (user_id) REFERENCES users (id);',
        ].join('\n'),
      ].join('\n\n') + '\n',
    )
  })

  it('finds the referencing end of an edge drawn by hand, whichever way it goes', () => {
    const builder = new DiagramBuilder()
    const users = builder.table('users', 0, 0, ['id uuid PK'])
    const boards = builder.table('boards', 400, 0, ['id uuid PK', 'owner_id uuid'])
    // From the primary key to the column that refers to it.
    builder.edge(users.fields[0]!, boards.fields[1]!)

    expect(diagramSchema(builder.build()).tables[1]!.foreignKeys).toEqual([
      { name: null, columns: ['owner_id'], table: 'users', references: ['id'] },
    ])
  })

  it('names the cells of the tables, fields, indexes and references it reads, and the types as the fields write them', () => {
    const builder = new DiagramBuilder()
    const users = builder.table('users', 0, 0, ['id NUMBER(19) PK', 'email VARCHAR2(255)'], 220, ['users_email_idx (email)'])
    const boards = builder.table('boards', 400, 0, ['id NUMBER(19) PK', 'owner_id NUMBER(19)'])
    const reference = builder.edge(users.fields[0]!, boards.fields[1]!)
    const cells = builder.build()
    const index = cells.find((cell) => cell.value === 'users_email_idx (email)')!

    const [first, second] = diagramTables(cells)

    expect(first).toMatchObject({ id: users.id, style: { dbVendor: 'postgresql' } })
    expect(first!.fields.map((field) => [field.id, field.column.type, field.writtenType])).toEqual([
      [users.fields[0], 'number(19)', 'NUMBER(19)'],
      [users.fields[1], 'varchar2(255)', 'VARCHAR2(255)'],
    ])
    expect(first!.indexes).toEqual([{ id: index.id, index: first!.table.indexes[0] }])
    expect(second!.references).toEqual([
      { id: reference, field: boards.fields[1], referencedTable: users.id, referencedField: users.fields[0] },
    ])
    expect(second!.table.foreignKeys).toEqual([{ name: null, columns: ['owner_id'], table: 'users', references: ['id'] }])
  })

  it('leaves base tables and their edges out, and writes inherited fields as columns of their tables', () => {
    const builder = new DiagramBuilder()
    const base = builder.table('BaseEntity', 0, 0, ['id uuid PK'])
    const users = builder.table('users', 0, 300, ['id uuid PK', 'email text'])
    const audit = builder.table('audit', 400, 0, ['user_id uuid'])
    builder.edge(audit.fields[0]!, base.fields[0]!)
    builder.edge(audit.fields[0]!, users.fields[0]!)
    const cells = builder.build()
    cells.find((cell) => cell.id === base.id)!.style[BASE_KEY] = true
    cells.find((cell) => cell.id === users.fields[0])!.style[INHERITED_KEY] = base.fields[0]!

    const schema = diagramSchema(cells)

    expect(schema.tables.map((table) => table.name)).toEqual(['users', 'audit'])
    expect(schema.tables[0]!.columns.map((column) => column.name)).toEqual(['id', 'email'])
    expect(schema.tables[1]!.foreignKeys).toEqual([{ name: null, columns: ['user_id'], table: 'users', references: ['id'] }])
    expect(schemaSql(schema)).not.toContain('BaseEntity')
  })

  it('makes rows of indexes under the fields and writes them back as CREATE INDEX, but not as columns or to Mermaid', async () => {
    const ddl = `
      CREATE TABLE users (id uuid PRIMARY KEY, org_id uuid, email text, "Created At" timestamptz, UNIQUE (org_id, email));
      CREATE INDEX users_org_idx ON users (org_id, "Created At" DESC) WHERE email IS NOT NULL;
      CREATE UNIQUE INDEX "Email Key" ON users USING btree (lower(email));
    `
    const cells = await schemaCells(parseSql(ddl), { x: 0, y: 0 })
    const users = tables(cells)[0]!
    const rows = cells.filter((cell) => cell.parent === users.id)

    expect(rows.filter((cell) => cell.style.codrawIndex).map((cell) => cell.value)).toEqual([
      'users_org_id_email_key (org_id, email) UNIQUE',
      'users_org_idx (org_id, "Created At" DESC) WHERE email IS NOT NULL',
      '"Email Key" (lower(email)) UNIQUE USING btree',
    ])
    // The rows of indexes are under the fields, past the room for the caption of their block.
    expect(rows.map((cell) => cell.geometry!.y)).toEqual([30, 56, 82, 108, 154, 180, 206])
    expect(users.geometry!.height).toBe(232)
    expect(users.geometry!.width).toBeGreaterThan(7.5 * 'users_org_idx'.length + 7.5 * '(org_id, "Created At" DESC)'.length)

    const schema = diagramSchema(cells)
    expect(schema.tables[0]!.columns.map((column) => column.name)).toEqual(['id', 'org_id', 'email', 'Created At'])
    expect(schemaSql(schema)).toBe(
      [
        'CREATE TABLE users (\n    id uuid PRIMARY KEY,\n    org_id uuid,\n    email text,\n    "Created At" timestamptz\n);',
        [
          'CREATE UNIQUE INDEX users_org_id_email_key ON users (org_id, email);',
          'CREATE INDEX users_org_idx ON users (org_id, "Created At" DESC) WHERE email IS NOT NULL;',
          'CREATE UNIQUE INDEX "Email Key" ON users USING btree (lower(email));',
        ].join('\n'),
      ].join('\n\n') + '\n',
    )
    expect(schemaMermaid(schema)).not.toContain('idx')
  })

  it('writes an erDiagram of Mermaid with keys and relations', async () => {
    const mermaid = schemaMermaid(diagramSchema(await schemaCells(parseSql(DDL), { x: 0, y: 0 })))

    expect(mermaid).toContain('erDiagram\n    users {\n        uuid id PK\n        text email UK\n        text Full_Name\n    }')
    expect(mermaid).toContain('    users ||--o{ boards : "owner_id"')
    expect(mermaid).toContain('    users |o--o{ boards : "reviewer_id"')
    expect(mermaid).toContain('    boards ||--o{ board_members : "board_id"')
    expect(mermaid).toContain('        uuid board_id PK, FK')
  })
})
