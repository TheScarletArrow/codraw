import { describe, expect, it } from 'vitest'
import { BASE_KEY, BASE_TABLE_KEY, INHERITED_KEY } from '../diagram/baseTables.ts'
import { snapshotDocument } from '../diagram/diff.ts'
import { mergedSnapshot } from '../diagram/merge.ts'
import { getCells, writeCell, type StyleValue } from '../diagram/model.ts'
import { boardWith, laterState } from '../diagram/testing.ts'
import { boardSchema, constraintName, defaultDialect, orderRenames } from './migration.ts'
import { boardOf, edge, migrate, plan, state, table } from './migrationTesting.ts'

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
