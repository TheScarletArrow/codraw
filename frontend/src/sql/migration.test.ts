import { describe, expect, it } from 'vitest'
import { BASE_KEY, BASE_TABLE_KEY, INHERITED_KEY } from '../diagram/baseTables.ts'
import { snapshotDocument } from '../diagram/diff.ts'
import { mergedSnapshot } from '../diagram/merge.ts'
import { getCells, writeCell, type StyleValue } from '../diagram/model.ts'
import { boardWith, laterState } from '../diagram/testing.ts'
import { VIEW_KEY, VIEW_QUERY_KEY } from '../diagram/views.ts'
import { boardSchema, constraintName, defaultDialect, orderRenames } from './migration.ts'
import { flywayFiles, liquibaseChangelog, migrationSql, migrationSummary } from './migrationFiles.ts'
import { boardOf, edge, migrate, plan, state, table, view } from './migrationTesting.ts'

const USERS = { id: 'id uuid PK', mail: 'mail text' }

describe('the schema of a state of a board', () => {
  it('reads the tables of all pages in their order, with keys of their page and elements', () => {
    const board = boardOf(
      {
        id: 'p2',
        name: 'Заказы',
        order: 'a1',
        cells: [
          ...table('orders', 'orders', { id: 'id uuid PK', user: 'user_id uuid FK' }),
          edge('e1', 'orders.user', 'users.id'),
        ],
      },
      {
        id: 'p1',
        name: 'Пользователи',
        order: 'a0',
        cells: table('users', 'users', USERS, { indexes: { mail: 'users_mail_idx (mail)' } }),
      },
    )

    const schema = boardSchema(board)

    expect(schema.tables.map((entry) => [entry.key, entry.name])).toEqual([
      ['p1/users', 'users'],
      ['p2/orders', 'orders'],
    ])
    expect(schema.tables[0]).toMatchObject({
      vendor: 'postgresql',
      columns: [
        { key: 'p1/users.id', name: 'id', type: 'uuid', primaryKey: true, notNull: true, unique: false },
        { key: 'p1/users.mail', name: 'mail', type: 'text', primaryKey: false, notNull: false },
      ],
      indexes: [{ key: 'p1/users#mail', name: 'users_mail_idx', columns: 'mail', unique: false }],
    })
    // An edge to another page is no reference: edges join elements of their own page.
    expect(schema.tables[1]!.references).toEqual([])
  })

  it('takes references from the edges between fields, once for two edges between the same fields', () => {
    const board = state(
      table('users', 'users', USERS),
      table('orders', 'orders', { id: 'id uuid PK', user: 'user_id uuid' }, { order: 'a1' }),
      [edge('e1', 'users.id', 'orders.user'), edge('e2', 'orders.user', 'users.id')],
    )

    expect(boardSchema(board).tables[1]!.references).toEqual([
      { column: 'page-1/orders.user', referencedTable: 'page-1/users', referencedColumn: 'page-1/users.id' },
    ])
  })

  it('leaves base tables out and has the copies of their fields as columns of the tables that inherit them', () => {
    const board = state(
      table('base', 'BaseEntity', { id: 'id uuid PK' }, { style: { [BASE_KEY]: true } }),
      table(
        'users',
        'users',
        { 'base.id': 'id uuid PK', mail: 'mail text' },
        {
          order: 'a1',
          style: { [BASE_TABLE_KEY]: 'base' },
          rowStyle: { 'users.base.id': { [INHERITED_KEY]: 'base.id' } },
        },
      ),
    )

    const schema = boardSchema(board)

    expect(schema.tables.map((entry) => entry.name)).toEqual(['users'])
    expect(schema.tables[0]!.columns.map((column) => column.name)).toEqual(['id', 'mail'])
  })

  it('reads views apart from tables, with keys of their page and elements and the indexes of materialized ones', () => {
    const board = state(
      table('users', 'users', { id: 'id uuid PK', mail: 'email text' }),
      view('active', 'active_users', 'SELECT id, email FROM users WHERE active', { id: 'id uuid', mail: 'email text' }, { order: 'a1' }),
      view('stats', 'user_stats', 'SELECT count(*) AS total FROM active_users', { total: 'total bigint' }, {
        order: 'a2',
        materialized: true,
        indexes: { total: 'user_stats_total_idx (total)' },
      }),
    )

    const schema = boardSchema(board)

    expect(schema.tables.map((entry) => entry.name)).toEqual(['users'])
    expect(schema.views).toMatchObject([
      {
        key: 'page-1/active',
        name: 'active_users',
        materialized: false,
        query: 'SELECT id, email FROM users WHERE active',
        columns: [{ name: 'id', type: 'uuid' }, { name: 'email', type: 'text' }],
        indexes: [],
        dependencies: ['users'],
      },
      {
        key: 'page-1/stats',
        materialized: true,
        indexes: [{ key: 'page-1/stats#total', name: 'user_stats_total_idx', columns: 'total' }],
        dependencies: ['active_users'],
      },
    ])
  })

  it('leaves out a view named as a table or an earlier view, and says so at the top of the file', () => {
    const board = boardOf(
      {
        id: 'p1',
        name: 'Схема',
        order: 'a0',
        cells: [...view('v1', 'users', 'SELECT 1 AS id', { id: 'id integer' }), ...view('v2', 'report', 'SELECT 1 AS n', { n: 'n integer' })],
      },
      {
        id: 'p2',
        name: 'Отчёты',
        order: 'a1',
        cells: [...table('users', 'users', { id: 'id uuid PK' }), ...view('v3', 'report', 'SELECT 2 AS n', { n: 'n integer' }, { order: 'a1' })],
      },
    )

    const schema = boardSchema(board)

    expect(schema.tables.map((entry) => entry.name)).toEqual(['users'])
    expect(schema.views.map((entry) => entry.key)).toEqual(['p1/v2'])
    expect(schema.repeatedViews).toEqual(['users', 'report'])
    expect(migrationSql(plan(state(), board), { from: 'версия', to: 'доска' })).toContain(
      '-- Представление report нарисовано несколько раз или названо как таблица: миграция берёт таблицу или первое\n',
    )
  })

  it('takes the first of tables, fields and indexes of one name, and names the tables drawn more than once', () => {
    const board = boardOf(
      {
        id: 'p1',
        name: 'Схема',
        order: 'a0',
        cells: table('users', 'users', { id: 'id uuid PK', id2: 'id bigint', mail: 'mail text' }),
      },
      { id: 'p2', name: 'Копия', order: 'a1', cells: table('users', 'users', { id: 'id bigint PK' }) },
    )

    const schema = boardSchema(board)

    expect(schema.tables).toHaveLength(1)
    expect(schema.tables[0]!.columns.map((column) => `${column.name} ${column.type}`)).toEqual(['id uuid', 'mail text'])
    expect(schema.repeated).toEqual(['users'])
  })

  it('keeps the type as the field writes it, e.g. of ClickHouse', () => {
    const board = state(table('events', 'events', { id: 'id UInt64', name: 'name LowCardinality(String)' }))

    expect(boardSchema(board).tables[0]!.columns.map((column) => column.type)).toEqual(['UInt64', 'LowCardinality(String)'])
  })

  it('offers the database of the tables when they have one, PostgreSQL otherwise', () => {
    const oracle = { style: { dbVendor: 'oracle' } }
    const tables = (style: Record<string, StyleValue>) =>
      boardSchema(state(table('a', 'a', {}, { style }), table('b', 'b', {}, { order: 'a1', style })))

    expect(defaultDialect(tables(oracle.style), tables(oracle.style))).toBe('oracle')
    expect(defaultDialect(tables({ dbVendor: 'oracle' }), tables({ dbVendor: 'mysql' }))).toBe('postgresql')
    expect(defaultDialect(tables({ dbVendor: '' }))).toBe('postgresql')
    expect(defaultDialect(boardSchema(state()))).toBe('postgresql')
  })
})

describe('a migration of PostgreSQL', () => {
  it('is empty when the tables only moved or changed their colors', () => {
    const before = state(table('users', 'users', USERS, { indexes: { mail: 'users_mail_idx (mail)' } }))
    const after = state(
      table('users', 'users', USERS, { indexes: { mail: 'users_mail_idx (mail)' }, style: { fillColor: '#ffcc00' } }),
    )

    expect(plan(before, after).statements).toEqual([])
    expect(plan(state(), state()).statements).toEqual([])
  })

  it('creates a new table with its keys and indexes, and drops a removed one with a warning', () => {
    const after = state(
      table(
        'users',
        'users',
        { id: 'id uuid PK', email: 'email text NOT NULL UNIQUE', org: 'org_id uuid' },
        {
          indexes: {
            org: 'users_org_idx (org_id) WHERE org_id IS NOT NULL',
            lower: '"Users Lower" (lower(email)) UNIQUE USING btree',
          },
        },
      ),
    )

    expect(migrate(state(), after)).toBe(
      [
        'CREATE TABLE users (\n    id uuid NOT NULL,\n    email text NOT NULL,\n    org_id uuid,\n    CONSTRAINT users_pkey PRIMARY KEY (id),\n' +
          '    CONSTRAINT users_email_key UNIQUE (email)\n);',
        '',
        'CREATE INDEX users_org_idx ON users (org_id) WHERE org_id IS NOT NULL;',
        'CREATE UNIQUE INDEX "Users Lower" ON users USING btree (lower(email));',
      ].join('\n'),
    )
    expect(migrate(after, state())).toBe('-- ВНИМАНИЕ: таблица users удаляется вместе с данными\nDROP TABLE users;')
    expect(plan(after, state()).statements[0]).toMatchObject({ dangerous: true, unsupported: false })
  })

  it('renames a field of the same element instead of dropping and adding it', () => {
    const before = state(table('users', 'users', USERS))
    const after = state(table('users', 'users', { id: 'id uuid PK', mail: 'email text' }))

    expect(migrate(before, after)).toBe('ALTER TABLE users RENAME COLUMN mail TO email;')
    expect(migrate(after, before)).toBe('ALTER TABLE users RENAME COLUMN email TO mail;')
  })

  it('adds and drops columns, the dropped ones with a warning', () => {
    const before = state(table('users', 'users', { ...USERS, legacy: 'legacy text' }))
    const after = state(table('users', 'users', { ...USERS, name: 'name text NOT NULL', bio: 'bio text' }))

    expect(migrate(before, after)).toBe(
      [
        '-- ВНИМАНИЕ: столбец users.legacy удаляется вместе с данными',
        'ALTER TABLE users DROP COLUMN legacy;',
        '',
        '-- Столбец users.name NOT NULL без DEFAULT не добавится в таблицу со строками: допишите DEFAULT или заполните его отдельно',
        'ALTER TABLE users ADD COLUMN name text NOT NULL;',
        '',
        'ALTER TABLE users ADD COLUMN bio text;',
      ].join('\n'),
    )
  })

  it('changes types, with a warning when the new one may not hold the values, and NOT NULL', () => {
    const before = state(
      table('users', 'users', { id: 'id uuid PK', name: 'name varchar(100)', age: 'age text', bio: 'bio text NOT NULL' }),
    )
    const after = state(
      table('users', 'users', { id: 'id uuid PK', name: 'name varchar(255) NOT NULL', age: 'age integer', bio: 'bio TEXT' }),
    )

    expect(migrate(before, after)).toBe(
      [
        'ALTER TABLE users ALTER COLUMN name TYPE varchar(255) USING name::varchar(255);',
        'ALTER TABLE users ALTER COLUMN name SET NOT NULL;',
        '',
        '-- ВНИМАНИЕ: тип users.age меняется с text на integer: значения могут не преобразоваться или обрезаться',
        'ALTER TABLE users ALTER COLUMN age TYPE integer USING age::integer;',
        '',
        'ALTER TABLE users ALTER COLUMN bio DROP NOT NULL;',
      ].join('\n'),
    )
    expect(plan(before, after).statements.map((statement) => statement.dangerous)).toEqual([false, true, false])
    // Back, the longer text becomes shorter.
    expect(plan(after, before).statements.filter((statement) => statement.dangerous)).toHaveLength(2)
  })

  it('adds and drops UNIQUE of a column, but not of the only column of the primary key', () => {
    const before = state(table('users', 'users', { id: 'id uuid PK', mail: 'mail text UNIQUE', name: 'name text' }))
    const after = state(table('users', 'users', { id: 'id uuid PK UNIQUE', mail: 'mail text', name: 'name text UNIQUE' }))

    expect(migrate(before, after)).toBe(
      [
        'ALTER TABLE users DROP CONSTRAINT users_mail_key;',
        '',
        'ALTER TABLE users ADD CONSTRAINT users_name_key UNIQUE (name);',
      ].join('\n'),
    )
  })

  it('drops and adds the primary key when its columns change', () => {
    const before = state(
      table('members', 'members', { board: 'board_id uuid PK', user: 'user_id uuid NOT NULL', role: 'role text PK' }),
    )
    const after = state(table('members', 'members', { board: 'board_id uuid PK', user: 'user_id uuid PK', role: 'role text' }))

    expect(migrate(before, after)).toBe(
      [
        'ALTER TABLE members DROP CONSTRAINT members_pkey;',
        '',
        'ALTER TABLE members ALTER COLUMN role DROP NOT NULL;',
        '',
        'ALTER TABLE members ADD CONSTRAINT members_pkey PRIMARY KEY (board_id, user_id);',
      ].join('\n'),
    )
    expect(migrate(state(table('t', 't', { a: 'a int' })), state(table('t', 't', { a: 'a int PK' })))).toBe(
      ['ALTER TABLE t ALTER COLUMN a SET NOT NULL;', '', 'ALTER TABLE t ADD CONSTRAINT t_pkey PRIMARY KEY (a);'].join('\n'),
    )
  })

  it('creates, drops, recreates and renames indexes', () => {
    const before = state(
      table(
        'users',
        'users',
        { id: 'id uuid PK', mail: 'mail text', org: 'org_id uuid' },
        {
          indexes: { mail: 'users_mail_idx (mail)', org: 'users_org_idx (org_id)', gone: 'users_gone_idx (org_id, mail)' },
        },
      ),
    )
    const after = state(
      table(
        'users',
        'users',
        { id: 'id uuid PK', mail: 'mail text', org: 'org_id uuid' },
        {
          indexes: {
            mail: 'users_mail_key (mail)',
            org: 'users_org_idx (org_id) UNIQUE',
            created: 'users_lower_idx (lower(mail))',
          },
        },
      ),
    )

    expect(migrate(before, after)).toBe(
      [
        'DROP INDEX users_gone_idx;',
        'DROP INDEX users_org_idx;',
        '',
        'ALTER INDEX users_mail_idx RENAME TO users_mail_key;',
        '',
        'CREATE UNIQUE INDEX users_org_idx ON users (org_id);',
        'CREATE INDEX users_lower_idx ON users (lower(mail));',
      ].join('\n'),
    )
  })

  it('leaves an index alone when a column of it is renamed, as the database renames it there too', () => {
    const before = state(table('users', 'users', USERS, { indexes: { mail: 'users_mail_idx (mail, "Created At" DESC)' } }))
    const after = state(
      table(
        'users',
        'users',
        { id: 'id uuid PK', mail: 'Email text' },
        { indexes: { mail: 'users_mail_idx (Email, "Created At" DESC)' } },
      ),
    )

    expect(migrate(before, after)).toBe('ALTER TABLE users RENAME COLUMN mail TO "Email";')
  })

  it('adds a foreign key for a new edge between fields, after the tables and columns it needs', () => {
    const users = table('users', 'users', USERS)
    const before = state(users, table('orders', 'orders', { id: 'id uuid PK' }, { order: 'a1' }))
    const after = state(users, table('orders', 'orders', { id: 'id uuid PK', user: 'user_id uuid NOT NULL' }, { order: 'a1' }), [
      edge('e1', 'orders.user', 'users.id'),
    ])

    expect(migrate(before, after)).toBe(
      [
        '-- Столбец orders.user_id NOT NULL без DEFAULT не добавится в таблицу со строками: допишите DEFAULT или заполните его отдельно',
        'ALTER TABLE orders ADD COLUMN user_id uuid NOT NULL;',
        '',
        'ALTER TABLE orders ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id);',
      ].join('\n'),
    )
    expect(migrate(after, before)).toBe(
      [
        'ALTER TABLE orders DROP CONSTRAINT orders_user_id_fkey;',
        '',
        '-- ВНИМАНИЕ: столбец orders.user_id удаляется вместе с данными',
        'ALTER TABLE orders DROP COLUMN user_id;',
      ].join('\n'),
    )
  })

  it('creates new tables before the foreign keys between them, whatever their order', () => {
    const after = state(
      table('orders', 'orders', { id: 'id uuid PK', user: 'user_id uuid' }),
      table('users', 'users', { id: 'id uuid PK' }, { order: 'a1' }),
      [edge('e1', 'orders.user', 'users.id')],
    )

    const statements = plan(state(), after).statements.flatMap((statement) => statement.sql)

    expect(statements.map((sql) => sql.split('\n')[0])).toEqual([
      'CREATE TABLE orders (',
      'CREATE TABLE users (',
      'ALTER TABLE orders ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id);',
    ])
  })

  it('drops a referring table before the table it refers to, and the keys of a cycle first', () => {
    const chain = state(
      table('users', 'users', { id: 'id uuid PK' }),
      table('orders', 'orders', { id: 'id uuid PK', user: 'user_id uuid' }, { order: 'a1' }),
      [edge('e1', 'orders.user', 'users.id')],
    )
    expect(plan(chain, state()).statements.flatMap((statement) => statement.sql)).toEqual([
      'DROP TABLE orders;',
      'DROP TABLE users;',
    ])

    const cycle = state(
      table('a', 'a', { id: 'id uuid PK', b: 'b_id uuid' }),
      table('b', 'b', { id: 'id uuid PK', a: 'a_id uuid' }, { order: 'a1' }),
      [edge('e1', 'a.b', 'b.id'), edge('e2', 'b.a', 'a.id')],
    )
    expect(plan(cycle, state()).statements.flatMap((statement) => statement.sql)).toEqual([
      'ALTER TABLE a DROP CONSTRAINT a_b_id_fkey;',
      'DROP TABLE b;',
      'DROP TABLE a;',
    ])
  })

  it('drops a foreign key whose edge is gone, and recreates one whose columns change their type', () => {
    const before = state(
      table('users', 'users', { id: 'id integer PK' }),
      table('orders', 'orders', { id: 'id uuid PK', user: 'user_id integer', author: 'author_id integer' }, { order: 'a1' }),
      [edge('e1', 'orders.user', 'users.id'), edge('e2', 'orders.author', 'users.id')],
    )
    const after = state(
      table('users', 'users', { id: 'id bigint PK' }),
      table('orders', 'orders', { id: 'id uuid PK', user: 'user_id bigint', author: 'author_id integer' }, { order: 'a1' }),
      [edge('e1', 'orders.user', 'users.id')],
    )

    expect(migrate(before, after)).toBe(
      [
        'ALTER TABLE orders DROP CONSTRAINT orders_user_id_fkey;',
        'ALTER TABLE orders DROP CONSTRAINT orders_author_id_fkey;',
        '',
        'ALTER TABLE users ALTER COLUMN id TYPE bigint USING id::bigint;',
        'ALTER TABLE orders ALTER COLUMN user_id TYPE bigint USING user_id::bigint;',
        '',
        'ALTER TABLE orders ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id);',
      ].join('\n'),
    )
  })

  it('recreates a foreign key that refers to a key being dropped', () => {
    const before = state(
      table('users', 'users', { id: 'id uuid PK', org: 'org_id uuid' }),
      table('orders', 'orders', { id: 'id uuid PK', user: 'user_id uuid' }, { order: 'a1' }),
      [edge('e1', 'orders.user', 'users.id')],
    )
    const after = state(
      table('users', 'users', { id: 'id uuid PK', org: 'org_id uuid PK' }),
      table('orders', 'orders', { id: 'id uuid PK', user: 'user_id uuid' }, { order: 'a1' }),
      [edge('e1', 'orders.user', 'users.id')],
    )

    expect(migrate(before, after)).toBe(
      [
        'ALTER TABLE orders DROP CONSTRAINT orders_user_id_fkey;',
        '',
        'ALTER TABLE users DROP CONSTRAINT users_pkey;',
        '',
        'ALTER TABLE users ALTER COLUMN org_id SET NOT NULL;',
        '',
        'ALTER TABLE users ADD CONSTRAINT users_pkey PRIMARY KEY (id, org_id);',
        '',
        'ALTER TABLE orders ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id);',
      ].join('\n'),
    )
  })

  it('renames a table with the constraints named after it, and keeps the keys that refer to it', () => {
    const before = state(
      table('users', 'users', { id: 'id uuid PK', mail: 'mail text UNIQUE' }),
      table('orders', 'orders', { id: 'id uuid PK', user: 'user_id uuid' }, { order: 'a1' }),
      [edge('e1', 'orders.user', 'users.id'), edge('e2', 'users.mail', 'orders.id')],
    )
    const after = state(
      table('users', 'accounts', { id: 'id uuid PK', mail: 'email text UNIQUE' }),
      table('orders', 'orders', { id: 'id uuid PK', user: 'user_id uuid' }, { order: 'a1' }),
      [edge('e1', 'orders.user', 'users.id'), edge('e2', 'users.mail', 'orders.id')],
    )

    expect(migrate(before, after)).toBe(
      [
        'ALTER TABLE users RENAME TO accounts;',
        'ALTER TABLE accounts RENAME COLUMN mail TO email;',
        'ALTER TABLE accounts RENAME CONSTRAINT users_pkey TO accounts_pkey;',
        'ALTER TABLE accounts RENAME CONSTRAINT users_mail_key TO accounts_email_key;',
        'ALTER TABLE accounts RENAME CONSTRAINT users_mail_fkey TO accounts_email_fkey;',
      ].join('\n'),
    )
  })

  it('drops a column before another one takes its name', () => {
    const before = state(table('users', 'users', { id: 'id uuid PK', email: 'email text', mail: 'mail text' }))
    const after = state(table('users', 'users', { id: 'id uuid PK', mail: 'email text' }))

    expect(migrate(before, after)).toBe(
      [
        '-- ВНИМАНИЕ: столбец users.email удаляется вместе с данными',
        'ALTER TABLE users DROP COLUMN email;',
        '',
        'ALTER TABLE users RENAME COLUMN mail TO email;',
      ].join('\n'),
    )
  })

  it('renames in an order that frees each name first, and through a temporary name in a cycle', () => {
    const before = state(table('people', 'people', { first: 'first_name text', last: 'last_name text', a: 'a int', b: 'b int' }))
    const after = state(table('people', 'people', { first: 'last_name text', last: 'first_name text', a: 'b int', b: 'c int' }))

    expect(migrate(before, after)).toBe(
      [
        'ALTER TABLE people RENAME COLUMN b TO c;',
        'ALTER TABLE people RENAME COLUMN a TO b;',
        'ALTER TABLE people RENAME COLUMN first_name TO first_name_tmp;',
        'ALTER TABLE people RENAME COLUMN last_name TO first_name;',
        'ALTER TABLE people RENAME COLUMN first_name_tmp TO last_name;',
      ].join('\n'),
    )
  })

  it('swaps the names of two tables through a temporary name, with their primary keys', () => {
    const before = state(table('a', 'a', { id: 'id int PK' }), table('b', 'b', { id: 'id int PK' }, { order: 'a1' }))
    const after = state(table('a', 'b', { id: 'id int PK' }), table('b', 'a', { id: 'id int PK' }, { order: 'a1' }))

    expect(migrate(before, after)).toBe(
      [
        'ALTER TABLE a RENAME TO a_tmp;',
        'ALTER TABLE b RENAME TO a;',
        'ALTER TABLE a_tmp RENAME TO b;',
        'ALTER TABLE b RENAME CONSTRAINT a_pkey TO a_pkey_tmp;',
        'ALTER TABLE a RENAME CONSTRAINT b_pkey TO a_pkey;',
        'ALTER TABLE b RENAME CONSTRAINT a_pkey_tmp TO b_pkey;',
      ].join('\n'),
    )
  })

  it('changes the fields of every table that inherits a changed base table, and never the base table', () => {
    const base = (field: string) =>
      table('base', 'BaseEntity', { id: 'id uuid PK', created: field }, { style: { [BASE_KEY]: true } })
    const heir = (id: string, order: string, field: string) =>
      table(
        id,
        id,
        { 'base.id': 'id uuid PK', 'base.created': field, own: 'name text' },
        {
          order,
          style: { [BASE_TABLE_KEY]: 'base' },
          rowStyle: {
            [`${id}.base.id`]: { [INHERITED_KEY]: 'base.id' },
            [`${id}.base.created`]: { [INHERITED_KEY]: 'base.created' },
          },
        },
      )
    const before = state(
      base('created_at timestamp'),
      heir('users', 'a1', 'created_at timestamp'),
      heir('boards', 'a2', 'created_at timestamp'),
    )
    const after = state(
      base('created timestamptz'),
      heir('users', 'a1', 'created timestamptz'),
      heir('boards', 'a2', 'created timestamptz'),
    )

    expect(migrate(before, after)).toBe(
      [
        'ALTER TABLE users RENAME COLUMN created_at TO created;',
        'ALTER TABLE boards RENAME COLUMN created_at TO created;',
        '',
        '-- ВНИМАНИЕ: тип users.created меняется с timestamp на timestamptz: значения могут не преобразоваться или обрезаться',
        'ALTER TABLE users ALTER COLUMN created TYPE timestamptz USING created::timestamptz;',
        '',
        '-- ВНИМАНИЕ: тип boards.created меняется с timestamp на timestamptz: значения могут не преобразоваться или обрезаться',
        'ALTER TABLE boards ALTER COLUMN created TYPE timestamptz USING created::timestamptz;',
      ].join('\n'),
    )
  })

  it('reads the tables of all pages: a table added on another page is created', () => {
    const users = { id: 'p1', name: 'Схема', order: 'a0', cells: table('users', 'users', USERS) }
    const before = boardOf(users, { id: 'p2', name: 'Заказы', order: 'a1', cells: [] })
    const after = boardOf(users, {
      id: 'p2',
      name: 'Заказы',
      order: 'a1',
      cells: table('payments', 'payments', { id: 'id uuid PK' }),
    })

    expect(migrate(before, after)).toBe(
      'CREATE TABLE payments (\n    id uuid NOT NULL,\n    CONSTRAINT payments_pkey PRIMARY KEY (id)\n);',
    )
  })

  it('takes a table on a copy of its page for the same table when the original is gone', () => {
    const before = boardOf({ id: 'p1', name: 'Схема', order: 'a0', cells: table('users', 'users', USERS) })
    const after = boardOf({
      id: 'p2',
      name: 'Схема (копия)',
      order: 'a1',
      cells: table('users-copy', 'users', { id: 'id uuid PK', mail: 'mail text' }),
    })

    expect(plan(before, after).statements).toEqual([])
  })

  it('goes from the board to the board with a proposal accepted: only what the proposal changes', () => {
    const base = boardWith(...table('users', 'users', USERS))
    // Meanwhile the board renamed `mail`, and the draft added `phone`.
    const board = laterState(base, (doc) =>
      writeCell(getCells(doc), { ...table('users', 'users', USERS)[2]!, value: 'email text' }),
    )
    const draft = laterState(base, (doc) =>
      writeCell(getCells(doc), table('users', 'users', { ...USERS, phone: 'phone text' })[3]!),
    )

    const accepted = mergedSnapshot(board, snapshotDocument(base), snapshotDocument(draft))

    expect(migrate(snapshotDocument(board), accepted)).toBe('ALTER TABLE users ADD COLUMN phone text;')
  })

  it('names constraints as PostgreSQL does, cutting the longer part of a long name to its limit in bytes', () => {
    expect(constraintName('users', null, 'pkey', 63)).toBe('users_pkey')
    expect(constraintName('users', 'email', 'key', 63)).toBe('users_email_key')
    const long = constraintName('a'.repeat(40), 'b'.repeat(40), 'fkey', 63)
    expect(long).toBe(`${'a'.repeat(29)}_${'b'.repeat(28)}_fkey`)
    expect(new TextEncoder().encode(long).length).toBe(63)
    // Two bytes a letter: the cut never splits a letter.
    const cyrillic = constraintName('пользователи_с_очень_длинным_именем', 'адрес', 'key', 63)
    expect(new TextEncoder().encode(cyrillic).length).toBeLessThanOrEqual(63)
    expect(cyrillic.endsWith('_адрес_key')).toBe(true)
    expect(constraintName('t', 'c', 'fkey', Infinity)).toBe('t_c_fkey')
  })

  it('orders renames: each waits for its new name to be free, and a cycle goes through a free temporary name', () => {
    expect(
      orderRenames(
        [
          { from: 'a', to: 'b' },
          { from: 'b', to: 'c' },
          { from: 'x', to: 'x' },
        ],
        new Set(['a', 'b', 'c']),
      ),
    ).toEqual([
      { from: 'b', to: 'c' },
      { from: 'a', to: 'b' },
    ])
    expect(
      orderRenames(
        [
          { from: 'a', to: 'b' },
          { from: 'b', to: 'a' },
        ],
        new Set(['a', 'b', 'a_tmp']),
      ),
    ).toEqual([
      { from: 'a', to: 'a_tmp2' },
      { from: 'b', to: 'a' },
      { from: 'a_tmp2', to: 'b' },
    ])
  })
})

const USERS_TABLE = table('users', 'users', { id: 'id uuid PK', mail: 'email text', active: 'active boolean' })
const ACTIVE = 'SELECT id, email FROM users WHERE active'
const active = (name = 'active_users', query = ACTIVE, fields: Record<string, string> = { id: 'id uuid', mail: 'email text' }) =>
  view('active', name, query, fields, { order: 'a1' })
const STATS = 'SELECT user_id, count(*) AS total FROM orders GROUP BY user_id'
const STATS_FIELDS = { user: 'user_id uuid', total: 'total bigint' }
const ORDERS = table('orders', 'orders', { id: 'id uuid PK', user: 'user_id uuid', total: 'total integer' })
const stats = (options: Parameters<typeof view>[4] = {}, name = 'user_stats') =>
  view('stats', name, STATS, STATS_FIELDS, { order: 'a1', ...options })

describe('a migration of views', () => {
  it('creates a new view, and drops a removed one without a warning', () => {
    const before = state(USERS_TABLE)
    const after = state(USERS_TABLE, active())

    expect(migrate(before, after)).toBe('CREATE VIEW active_users AS SELECT id, email FROM users WHERE active;')
    expect(migrate(after, before)).toBe('DROP VIEW active_users;')
    expect(plan(after, before).statements[0]).toMatchObject({ dangerous: false, unsupported: false })
  })

  it('creates a materialized view with its indexes, and drops a removed one with a warning about its data', () => {
    const before = state(ORDERS)
    const after = state(ORDERS, stats({ materialized: true, indexes: { total: 'user_stats_total_idx (total) USING btree' } }))

    expect(migrate(before, after)).toBe(
      [
        `CREATE MATERIALIZED VIEW user_stats AS ${STATS};`,
        'CREATE INDEX user_stats_total_idx ON user_stats USING btree (total);',
      ].join('\n'),
    )
    expect(migrate(after, before)).toBe(
      '-- ВНИМАНИЕ: материализованное представление user_stats удаляется вместе с данными\nDROP MATERIALIZED VIEW user_stats;',
    )
    expect(migrationSummary(plan(after, before))).toEqual({ changes: 1, dangerous: 1, unsupported: 0 })
  })

  it('renames a view of the same element instead of dropping and creating it', () => {
    expect(migrate(state(USERS_TABLE, active()), state(USERS_TABLE, active('active_accounts')))).toBe(
      'ALTER VIEW active_users RENAME TO active_accounts;',
    )
    expect(migrate(state(ORDERS, stats({ materialized: true })), state(ORDERS, stats({ materialized: true }, 'stats_by_user')))).toBe(
      'ALTER MATERIALIZED VIEW user_stats RENAME TO stats_by_user;',
    )
  })

  it('replaces the query in place when the fields only grow, and drops and creates the view otherwise', () => {
    const before = state(USERS_TABLE, active())
    const grown = state(
      USERS_TABLE,
      active('active_users', 'SELECT id, email, active FROM users', { id: 'id uuid', mail: 'email text', active: 'active boolean' }),
    )
    const shrunk = state(USERS_TABLE, active('active_users', 'SELECT id FROM users WHERE active', { id: 'id uuid' }))
    const retyped = state(
      USERS_TABLE,
      active('active_users', 'SELECT id, email::varchar(100) AS email FROM users', { id: 'id uuid', mail: 'email varchar(100)' }),
    )

    expect(migrate(before, grown)).toBe('CREATE OR REPLACE VIEW active_users AS SELECT id, email, active FROM users;')
    expect(migrate(grown, before)).toBe(`DROP VIEW active_users;\n\nCREATE VIEW active_users AS ${ACTIVE};`)
    expect(migrate(before, shrunk)).toBe('DROP VIEW active_users;\n\nCREATE VIEW active_users AS SELECT id FROM users WHERE active;')
    expect(migrate(before, retyped)).toBe(
      'DROP VIEW active_users;\n\nCREATE VIEW active_users AS SELECT id, email::varchar(100) AS email FROM users;',
    )
    // Renamed and grown: renamed in place, then replaced under the new name.
    const renamedGrown = state(
      USERS_TABLE,
      active('active_accounts', 'SELECT id, email, active FROM users', { id: 'id uuid', mail: 'email text', active: 'active boolean' }),
    )
    expect(migrate(before, renamedGrown)).toBe(
      'ALTER VIEW active_users RENAME TO active_accounts;\n\nCREATE OR REPLACE VIEW active_accounts AS SELECT id, email, active FROM users;',
    )
  })

  it('is empty when only the spaces of a query, the fields of a view or its look change', () => {
    const before = state(USERS_TABLE, active())

    expect(migrate(before, state(USERS_TABLE, active('active_users', 'SELECT id,  email\nFROM users   WHERE active')))).toBe('')
    expect(migrate(before, state(USERS_TABLE, active('active_users', ACTIVE, { id: 'id uuid', mail: 'mail text' })))).toBe('')
  })

  it('drops and creates a view that becomes materialized or plain, with the indexes of a materialized one', () => {
    const plain = state(ORDERS, stats())
    const materialized = state(ORDERS, stats({ materialized: true, indexes: { total: 'user_stats_total_idx (total)' } }))

    expect(migrate(plain, materialized)).toBe(
      [
        'DROP VIEW user_stats;',
        '',
        `CREATE MATERIALIZED VIEW user_stats AS ${STATS};`,
        'CREATE INDEX user_stats_total_idx ON user_stats (total);',
      ].join('\n'),
    )
    expect(migrate(materialized, plain)).toBe(`DROP MATERIALIZED VIEW user_stats;\n\nCREATE VIEW user_stats AS ${STATS};`)
    // Its data are counted again by the query: no warning.
    expect(plan(materialized, plain).statements.some((statement) => statement.dangerous)).toBe(false)
  })

  it('creates, drops, recreates and renames the indexes of a materialized view as those of a table', () => {
    const before = state(
      ORDERS,
      stats({
        materialized: true,
        indexes: { total: 'user_stats_total_idx (total)', user: 'user_stats_user_idx (user_id)', old: 'user_stats_old_idx (user_id, total)' },
      }),
    )
    const after = state(
      ORDERS,
      stats({
        materialized: true,
        indexes: {
          total: 'user_stats_sum_idx (total)',
          user: 'user_stats_user_idx (user_id) UNIQUE',
          big: 'user_stats_big_idx (total) WHERE total > 100',
        },
      }),
    )

    expect(migrate(before, after)).toBe(
      [
        'DROP INDEX user_stats_old_idx;',
        'DROP INDEX user_stats_user_idx;',
        '',
        'ALTER INDEX user_stats_total_idx RENAME TO user_stats_sum_idx;',
        '',
        'CREATE UNIQUE INDEX user_stats_user_idx ON user_stats (user_id);',
        'CREATE INDEX user_stats_big_idx ON user_stats (total) WHERE total > 100;',
      ].join('\n'),
    )
  })

  it('does not create a view without a query, and does not drop one for its own changes', () => {
    const before = state(USERS_TABLE)
    const drafts = state(USERS_TABLE, view('drafts', 'drafts', '', { id: 'id uuid' }, { order: 'a1' }))
    const note = '-- Запрос представления drafts не задан: представление не создаётся — задайте его кнопкой «Запрос…»'

    expect(migrate(before, drafts)).toBe(note)
    expect(migrationSummary(plan(before, drafts))).toEqual({ changes: 1, dangerous: 0, unsupported: 1 })
    // Its query taken away and made materialized: the view the database has stays.
    const withQuery = state(USERS_TABLE, view('drafts', 'drafts', 'SELECT id FROM users', { id: 'id uuid' }, { order: 'a1' }))
    const emptied = state(USERS_TABLE, view('drafts', 'drafts', '', { id: 'id uuid' }, { order: 'a1', materialized: true }))
    expect(migrate(withQuery, emptied)).toBe(note)
    // A view whose table changes is dropped all the same, as the database needs it.
    const legacy = table('users', 'users', { id: 'id uuid PK', legacy: 'legacy text' })
    expect(
      migrate(
        state(legacy, view('drafts', 'drafts', 'SELECT id, legacy FROM users', { id: 'id uuid', legacy: 'legacy text' }, { order: 'a1' })),
        state(table('users', 'users', { id: 'id uuid PK' }), view('drafts', 'drafts', '', { id: 'id uuid' }, { order: 'a1' })),
      ),
    ).toBe(
      [
        'DROP VIEW drafts;',
        '',
        '-- ВНИМАНИЕ: столбец users.legacy удаляется вместе с данными',
        'ALTER TABLE users DROP COLUMN legacy;',
        '',
        note,
      ].join('\n'),
    )
  })

  it('drops views before a column they read is retyped, readers first, and creates them after in the order they read', () => {
    const totals = 'SELECT user_id, sum(total) AS total FROM orders GROUP BY user_id'
    const top = 'SELECT user_id FROM order_totals WHERE total > 1000'
    const views = [
      view('top', 'top_customers', top, { user: 'user_id uuid' }, { order: 'a1' }),
      view('totals', 'order_totals', totals, { user: 'user_id uuid', total: 'total bigint' }, { order: 'a2' }),
    ]
    const before = state(ORDERS, ...views)
    const after = state(table('orders', 'orders', { id: 'id uuid PK', user: 'user_id uuid', total: 'total bigint' }), ...views)

    expect(migrate(before, after)).toBe(
      [
        'DROP VIEW top_customers;',
        'DROP VIEW order_totals;',
        '',
        'ALTER TABLE orders ALTER COLUMN total TYPE bigint USING total::bigint;',
        '',
        `CREATE VIEW order_totals AS ${totals};`,
        `CREATE VIEW top_customers AS ${top};`,
      ].join('\n'),
    )
  })

  it('drops a view that reads a dropped table, but leaves one alone when what it reads is renamed or grows', () => {
    const legacy = table('legacy', 'legacy', { id: 'id uuid PK' }, { order: 'a2' })
    const both = 'SELECT u.id FROM users u JOIN legacy l ON l.id = u.id'
    const before = state(USERS_TABLE, legacy, active('active_users', both, { id: 'id uuid' }))
    const after = state(USERS_TABLE, active('active_users', 'SELECT id FROM users', { id: 'id uuid' }))

    expect(migrate(before, after)).toBe(
      [
        'DROP VIEW active_users;',
        '',
        '-- ВНИМАНИЕ: таблица legacy удаляется вместе с данными',
        'DROP TABLE legacy;',
        '',
        'CREATE VIEW active_users AS SELECT id FROM users;',
      ].join('\n'),
    )
    const renamed = state(
      table('users', 'accounts', { id: 'id uuid PK', mail: 'mail text', active: 'active boolean', bio: 'bio text' }),
      active(),
    )
    expect(migrate(state(USERS_TABLE, active()), renamed)).toBe(
      [
        'ALTER TABLE users RENAME TO accounts;',
        'ALTER TABLE accounts RENAME COLUMN email TO mail;',
        'ALTER TABLE accounts RENAME CONSTRAINT users_pkey TO accounts_pkey;',
        '',
        'ALTER TABLE accounts ADD COLUMN bio text;',
      ].join('\n'),
    )
  })

  it('creates a view after the new table it reads, and drops one that a table of its element replaces', () => {
    const payments = table('payments', 'payments', { id: 'id uuid PK' }, { order: 'a1' })
    const paid = view('paid', 'paid_orders', 'SELECT id FROM payments', { id: 'id uuid' })

    expect(migrate(state(), state(paid, payments))).toBe(
      'CREATE TABLE payments (\n    id uuid NOT NULL,\n    CONSTRAINT payments_pkey PRIMARY KEY (id)\n);\n\nCREATE VIEW paid_orders AS SELECT id FROM payments;',
    )
    const stats = table('stats', 'stats', { total: 'total bigint' })
    const statsView = table('stats', 'stats', { total: 'total bigint' }, { style: { [VIEW_KEY]: true, [VIEW_QUERY_KEY]: 'SELECT 1 AS total' } })
    expect(migrate(state(stats), state(statsView))).toBe(
      '-- ВНИМАНИЕ: таблица stats удаляется вместе с данными\nDROP TABLE stats;\n\nCREATE VIEW stats AS SELECT 1 AS total;',
    )
    expect(migrate(state(statsView), state(stats))).toBe('DROP VIEW stats;\n\nCREATE TABLE stats (\n    total bigint\n);')
  })

  it('renames tables and views in one order, as they share their names', () => {
    const before = state(table('report', 'report_new', { id: 'id uuid' }), view('old', 'report', 'SELECT 1 AS id', { id: 'id integer' }))
    const after = state(table('report', 'report', { id: 'id uuid' }), view('old', 'report_old', 'SELECT 1 AS id', { id: 'id integer' }))

    expect(migrate(before, after)).toBe('ALTER VIEW report RENAME TO report_old;\nALTER TABLE report_new RENAME TO report;')
  })

  it('goes back by the same generator in Flyway and Liquibase', () => {
    const forward = plan(state(USERS_TABLE), state(USERS_TABLE, active()))
    const backward = plan(state(USERS_TABLE, active()), state(USERS_TABLE))
    const states = { from: 'версия', to: 'доска' }

    const [up, down] = flywayFiles(forward, backward, { version: '3', description: 'active users' }, states)

    expect(up!.text).toContain(`CREATE VIEW active_users AS ${ACTIVE};`)
    expect(down!.text).toContain('DROP VIEW active_users;')
    expect(liquibaseChangelog(forward, backward, { author: 'alice', id: '7' }, states)).toContain(
      `CREATE VIEW active_users AS ${ACTIVE};\n--rollback DROP VIEW active_users;\n`,
    )
  })
})

describe('views in the databases of migrations', () => {
  const renamed = [state(USERS_TABLE, active()), state(USERS_TABLE, active('active_accounts'))] as const

  it('renames a view as the database does, or drops it and creates it under the new name', () => {
    expect(migrate(...renamed, 'mysql')).toBe('RENAME TABLE active_users TO active_accounts;')
    expect(migrate(...renamed, 'oracle')).toBe('RENAME active_users TO active_accounts;')
    expect(migrate(...renamed, 'clickhouse')).toBe('RENAME TABLE active_users TO active_accounts;')
    expect(migrate(...renamed, 'sqlite')).toBe(`DROP VIEW active_users;\n\nCREATE VIEW active_accounts AS ${ACTIVE};`)
    expect(migrate(...renamed, 'sqlserver')).toBe(`DROP VIEW active_users;\n\nEXEC(N'CREATE VIEW active_accounts AS ${ACTIVE}');`)
    // RENAME of Oracle does not take a materialized view.
    const materialized = [
      state(ORDERS, stats({ materialized: true, indexes: { total: 'user_stats_total_idx (total)' } })),
      state(ORDERS, stats({ materialized: true, indexes: { total: 'user_stats_total_idx (total)' } }, 'stats_by_user')),
    ] as const
    expect(migrate(...materialized, 'oracle')).toBe(
      [
        'DROP MATERIALIZED VIEW user_stats;',
        '',
        `CREATE MATERIALIZED VIEW stats_by_user AS ${STATS};`,
        'CREATE INDEX user_stats_total_idx ON stats_by_user (total);',
      ].join('\n'),
    )
    expect(migrate(...materialized, 'clickhouse')).toBe('RENAME TABLE user_stats TO stats_by_user;')
  })

  it('replaces a query as the database does: OR REPLACE, OR ALTER of SQL Server, or a drop and a create in SQLite', () => {
    const query = "SELECT id, email, active FROM users WHERE email <> ''"
    const grown = [
      state(USERS_TABLE, active()),
      state(USERS_TABLE, active('active_users', query, { id: 'id uuid', mail: 'email text', active: 'active boolean' })),
    ] as const

    expect(migrate(...grown, 'mysql')).toBe(`CREATE OR REPLACE VIEW active_users AS ${query};`)
    expect(migrate(...grown, 'oracle')).toBe(`CREATE OR REPLACE VIEW active_users AS ${query};`)
    expect(migrate(...grown, 'clickhouse')).toBe(`CREATE OR REPLACE VIEW active_users AS ${query};`)
    expect(migrate(...grown, 'sqlserver')).toBe(
      "EXEC(N'CREATE OR ALTER VIEW active_users AS SELECT id, email, active FROM users WHERE email <> ''''');",
    )
    expect(migrate(...grown, 'sqlite')).toBe(`DROP VIEW active_users;\n\nCREATE VIEW active_users AS ${query};`)
  })

  it('writes a comment for a materialized view where the database has none, without its indexes', () => {
    const before = state(ORDERS)
    const after = state(ORDERS, stats({ materialized: true, indexes: { total: 'user_stats_total_idx (total)' } }))

    for (const [vendor, label] of [
      ['mysql', 'MySQL'],
      ['sqlserver', 'SQL Server'],
      ['sqlite', 'SQLite'],
    ] as const) {
      expect(migrate(before, after, vendor)).toBe(`-- В ${label} нет материализованных представлений: user_stats не создаётся`)
      expect(migrationSummary(plan(before, after, vendor))).toEqual({ changes: 1, dangerous: 0, unsupported: 1 })
      expect(migrate(after, before, vendor)).toBe(`-- В ${label} нет материализованных представлений: user_stats не удаляется`)
      expect(plan(after, before, vendor).statements[0]!.dangerous).toBe(false)
    }
  })

  it('creates a materialized view of ClickHouse with an engine and POPULATE, and drops it as a view', () => {
    const before = state(ORDERS)
    const after = state(ORDERS, stats({ materialized: true }))

    expect(migrate(before, after, 'clickhouse')).toBe(
      [
        '-- ENGINE и ORDER BY материализованного представления — заготовка: подберите их под запрос; POPULATE заполняет ' +
          'его строками, что уже есть, а вставленные во время заполнения в него не попадут',
        'CREATE MATERIALIZED VIEW user_stats',
        'ENGINE = MergeTree',
        'ORDER BY tuple()',
        `POPULATE AS ${STATS};`,
      ].join('\n'),
    )
    expect(migrate(after, before, 'clickhouse')).toBe(
      '-- ВНИМАНИЕ: материализованное представление user_stats удаляется вместе с данными\nDROP VIEW user_stats;',
    )
  })

  it('quotes the names of views as the database does', () => {
    const before = state(USERS_TABLE)
    const after = state(USERS_TABLE, view('order', 'order', 'SELECT 1 AS id', { id: 'id integer' }, { order: 'a1' }))

    expect(migrate(before, after, 'mysql')).toBe('CREATE VIEW `order` AS SELECT 1 AS id;')
    expect(migrate(before, after, 'sqlserver')).toBe("EXEC(N'CREATE VIEW [order] AS SELECT 1 AS id');")
    expect(migrate(after, before)).toBe('DROP VIEW "order";')
  })
})
