import { describe, expect, it } from 'vitest'
import { DIALECTS } from './dialects.ts'
import { edge, migrate, plan, state, table } from './migrationTesting.ts'

/**
 * A version and the board after it: `users` renamed `accounts`, its field `mail` renamed `email` and made NOT NULL and
 * UNIQUE, `age` from text to integer, `legacy` removed, `nickname` added, its index renamed; `orders` got `total`;
 * `payments` is new, with an index and a reference to `orders`; `old_logs` is gone.
 */
const VERSION = state(
  table(
    'users',
    'users',
    { id: 'id uuid PK', mail: 'mail text', age: 'age text', legacy: 'legacy text' },
    { indexes: { mail: 'users_mail_idx (mail)' } },
  ),
  table('orders', 'orders', { id: 'id uuid PK', user: 'user_id uuid' }, { order: 'a1' }),
  table('logs', 'old_logs', { id: 'id uuid PK' }, { order: 'a2' }),
  [edge('e1', 'orders.user', 'users.id')],
)
const BOARD = state(
  table(
    'users',
    'accounts',
    { id: 'id uuid PK', mail: 'email text NOT NULL UNIQUE', age: 'age integer', nickname: 'nickname varchar(50)' },
    {
      indexes: { mail: 'accounts_email_idx (email)' },
    },
  ),
  table('orders', 'orders', { id: 'id uuid PK', user: 'user_id uuid', total: 'total numeric(10,2)' }, { order: 'a1' }),
  table(
    'payments',
    'payments',
    { id: 'id uuid PK', order: 'order_id uuid NOT NULL' },
    { order: 'a3', indexes: { order: 'payments_order_idx (order_id)' } },
  ),
  [edge('e1', 'orders.user', 'users.id'), edge('e2', 'payments.order', 'orders.id')],
)

const DROPS = [
  '-- ВНИМАНИЕ: столбец users.legacy удаляется вместе с данными',
  'ALTER TABLE users DROP COLUMN legacy;',
  '',
  '-- ВНИМАНИЕ: таблица old_logs удаляется вместе с данными',
  'DROP TABLE old_logs;',
  '',
]
const AGE_WARNING = '-- ВНИМАНИЕ: тип accounts.age меняется с text на integer: значения могут не преобразоваться или обрезаться'

describe('migrations for each database', () => {
  it('PostgreSQL', () => {
    expect(migrate(VERSION, BOARD, 'postgresql')).toBe(
      [
        ...DROPS,
        'ALTER TABLE users RENAME TO accounts;',
        'ALTER TABLE accounts RENAME COLUMN mail TO email;',
        'ALTER TABLE accounts RENAME CONSTRAINT users_pkey TO accounts_pkey;',
        'ALTER INDEX users_mail_idx RENAME TO accounts_email_idx;',
        '',
        'CREATE TABLE payments (\n    id uuid NOT NULL,\n    order_id uuid NOT NULL,\n    CONSTRAINT payments_pkey PRIMARY KEY (id)\n);',
        '',
        'ALTER TABLE accounts ADD COLUMN nickname varchar(50);',
        'ALTER TABLE orders ADD COLUMN total numeric(10,2);',
        '',
        'ALTER TABLE accounts ALTER COLUMN email SET NOT NULL;',
        '',
        AGE_WARNING,
        'ALTER TABLE accounts ALTER COLUMN age TYPE integer USING age::integer;',
        '',
        'ALTER TABLE accounts ADD CONSTRAINT accounts_email_key UNIQUE (email);',
        'CREATE INDEX payments_order_idx ON payments (order_id);',
        '',
        'ALTER TABLE payments ADD CONSTRAINT payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders (id);',
      ].join('\n'),
    )
  })

  it('MySQL / MariaDB', () => {
    const modify = '-- MODIFY COLUMN задаёт столбец заново: допишите DEFAULT, AUTO_INCREMENT и COMMENT, если они у него есть'
    expect(migrate(VERSION, BOARD, 'mysql')).toBe(
      [
        ...DROPS,
        'ALTER TABLE users RENAME TO accounts;',
        'ALTER TABLE accounts RENAME COLUMN mail TO email;',
        'ALTER TABLE accounts RENAME INDEX users_mail_idx TO accounts_email_idx;',
        '',
        'CREATE TABLE payments (\n    id uuid NOT NULL,\n    order_id uuid NOT NULL,\n    PRIMARY KEY (id)\n);',
        '',
        'ALTER TABLE accounts ADD COLUMN nickname varchar(50);',
        'ALTER TABLE orders ADD COLUMN total numeric(10,2);',
        '',
        modify,
        'ALTER TABLE accounts MODIFY COLUMN email text NOT NULL;',
        '',
        AGE_WARNING,
        modify,
        'ALTER TABLE accounts MODIFY COLUMN age integer;',
        '',
        'ALTER TABLE accounts ADD UNIQUE KEY accounts_email_key (email);',
        'CREATE INDEX payments_order_idx ON payments (order_id);',
        '',
        'ALTER TABLE payments ADD CONSTRAINT payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders (id);',
      ].join('\n'),
    )
  })

  it('Oracle', () => {
    expect(migrate(VERSION, BOARD, 'oracle')).toBe(
      [
        ...DROPS,
        'ALTER TABLE users RENAME TO accounts;',
        'ALTER TABLE accounts RENAME COLUMN mail TO email;',
        'ALTER TABLE accounts RENAME CONSTRAINT users_pkey TO accounts_pkey;',
        'ALTER INDEX users_mail_idx RENAME TO accounts_email_idx;',
        '',
        'CREATE TABLE payments (\n    id uuid NOT NULL,\n    order_id uuid NOT NULL,\n    CONSTRAINT payments_pkey PRIMARY KEY (id)\n);',
        '',
        'ALTER TABLE accounts ADD nickname varchar(50);',
        'ALTER TABLE orders ADD total numeric(10,2);',
        '',
        'ALTER TABLE accounts MODIFY email NOT NULL;',
        '',
        AGE_WARNING,
        'ALTER TABLE accounts MODIFY age integer;',
        '',
        'ALTER TABLE accounts ADD CONSTRAINT accounts_email_key UNIQUE (email);',
        'CREATE INDEX payments_order_idx ON payments (order_id);',
        '',
        'ALTER TABLE payments ADD CONSTRAINT payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders (id);',
      ].join('\n'),
    )
  })

  it('SQL Server', () => {
    expect(migrate(VERSION, BOARD, 'sqlserver')).toBe(
      [
        ...DROPS,
        "EXEC sp_rename N'users', N'accounts';",
        "EXEC sp_rename N'accounts.mail', N'email', N'COLUMN';",
        "EXEC sp_rename N'users_pkey', N'accounts_pkey', N'OBJECT';",
        "EXEC sp_rename N'accounts.users_mail_idx', N'accounts_email_idx', N'INDEX';",
        '',
        'CREATE TABLE payments (\n    id uuid NOT NULL,\n    order_id uuid NOT NULL,\n    CONSTRAINT payments_pkey PRIMARY KEY (id)\n);',
        '',
        'ALTER TABLE accounts ADD nickname varchar(50) NULL;',
        'ALTER TABLE orders ADD total numeric(10,2) NULL;',
        '',
        'ALTER TABLE accounts ALTER COLUMN email text NOT NULL;',
        '',
        AGE_WARNING,
        'ALTER TABLE accounts ALTER COLUMN age integer NULL;',
        '',
        'ALTER TABLE accounts ADD CONSTRAINT accounts_email_key UNIQUE (email);',
        'CREATE INDEX payments_order_idx ON payments (order_id);',
        '',
        'ALTER TABLE payments ADD CONSTRAINT payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders (id);',
      ].join('\n'),
    )
  })

  it('SQLite: keys in CREATE TABLE, unique columns as unique indexes, the rest as comments', () => {
    const rebuild = 'таблицу нужно пересоздать: новая таблица, перенос строк, DROP TABLE и RENAME'
    expect(migrate(VERSION, BOARD, 'sqlite')).toBe(
      [
        'DROP INDEX users_mail_idx;',
        '',
        ...DROPS,
        'ALTER TABLE users RENAME TO accounts;',
        'ALTER TABLE accounts RENAME COLUMN mail TO email;',
        '',
        'CREATE TABLE payments (\n    id uuid NOT NULL,\n    order_id uuid NOT NULL,\n    CONSTRAINT payments_pkey PRIMARY KEY (id),\n' +
          '    CONSTRAINT payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders (id)\n);',
        '',
        'ALTER TABLE accounts ADD COLUMN nickname varchar(50);',
        'ALTER TABLE orders ADD COLUMN total numeric(10,2);',
        '',
        `-- SQLite не меняет тип и NOT NULL столбца accounts.email: ${rebuild}`,
        '',
        AGE_WARNING,
        `-- SQLite не меняет тип и NOT NULL столбца accounts.age: ${rebuild}`,
        '',
        'CREATE UNIQUE INDEX accounts_email_key ON accounts (email);',
        'CREATE INDEX accounts_email_idx ON accounts (email);',
        'CREATE INDEX payments_order_idx ON payments (order_id);',
      ].join('\n'),
    )
    expect(plan(VERSION, BOARD, 'sqlite').statements.filter((statement) => statement.unsupported)).toHaveLength(2)
  })

  it('ClickHouse: MergeTree tables, nullability by type, and comments for keys and indexes', () => {
    expect(migrate(VERSION, BOARD, 'clickhouse')).toBe(
      [
        ...DROPS,
        'RENAME TABLE users TO accounts;',
        'ALTER TABLE accounts RENAME COLUMN mail TO email;',
        '',
        'CREATE TABLE payments (\n    id uuid,\n    order_id uuid\n)\nENGINE = MergeTree\nORDER BY (id);',
        '',
        'ALTER TABLE accounts ADD COLUMN nickname varchar(50);',
        'ALTER TABLE orders ADD COLUMN total numeric(10,2);',
        '',
        '-- ClickHouse задаёт NULL типом Nullable(…), а не NOT NULL: смените тип accounts.email',
        '',
        AGE_WARNING,
        'ALTER TABLE accounts MODIFY COLUMN age integer;',
        '',
        '-- В ClickHouse нет ограничений UNIQUE: accounts.email не станет уникальным',
        '-- Индексы ClickHouse задаются иначе (пропуск данных): payments_order_idx не создаётся',
        '',
        '-- В ClickHouse нет внешних ключей: payments.order_id → orders.id не создаётся',
      ].join('\n'),
    )
  })

  it('goes back by the same names: the migration back of each database undoes the renames', () => {
    for (const vendor of ['postgresql', 'oracle'] as const) {
      const back = migrate(BOARD, VERSION, vendor)
      expect(back).toContain('ALTER TABLE accounts RENAME TO users;')
      expect(back).toContain('ALTER TABLE users RENAME COLUMN email TO mail;')
      expect(back).toContain('ALTER TABLE users RENAME CONSTRAINT accounts_pkey TO users_pkey;')
      expect(back).toContain('ALTER TABLE accounts DROP CONSTRAINT accounts_email_key;')
      // The keys of a dropped table go with it.
      expect(back).toContain('DROP TABLE payments;')
      expect(back).not.toContain('payments_order_id_fkey')
      expect(back).toContain('CREATE TABLE old_logs (')
    }
  })
})

describe('names and statements of each database', () => {
  it('quotes names that are not plain or that the database reserves, as the database quotes them', () => {
    const names = ['users', 'Users', 'order', 'full name', 'a"b`c]d']
    expect(names.map(DIALECTS.postgresql.quote)).toEqual(['users', '"Users"', '"order"', '"full name"', '"a""b`c]d"'])
    expect(names.map(DIALECTS.mysql.quote)).toEqual(['users', 'Users', '`order`', '`full name`', '`a"b``c]d`'])
    // Quotes make a name case-sensitive in Oracle: plain names stay plain in any case.
    expect(names.map(DIALECTS.oracle.quote)).toEqual(['users', 'Users', '"order"', '"full name"', '"a""b`c]d"'])
    expect(names.map(DIALECTS.sqlserver.quote)).toEqual(['users', 'Users', '[order]', '[full name]', '[a"b`c]]d]'])
    expect(names.map(DIALECTS.sqlite.quote)).toEqual(['users', 'Users', '"order"', '"full name"', '"a""b`c]d"'])
    expect(names.map(DIALECTS.clickhouse.quote)).toEqual(['users', 'Users', '`order`', '`full name`', '`a"b\\`c]d`'])
    expect(DIALECTS.oracle.quote('name')).toBe('name')
    expect(DIALECTS.oracle.quote('number')).toBe('"number"')
  })

  it('writes quoted names into the strings of sp_rename of SQL Server', () => {
    const before = state(table('t', 'order items', { a: `"it's" text` }))
    const after = state(table('t', 'order lines', { a: 'its text' }))

    expect(migrate(before, after, 'sqlserver')).toBe(
      ["EXEC sp_rename N'[order items]', N'order lines';", "EXEC sp_rename N'[order lines].[it''s]', N'its', N'COLUMN';"].join(
        '\n',
      ),
    )
  })

  it('drops keys and indexes as each database does', () => {
    const before = state(
      table('users', 'users', { id: 'id int PK', mail: 'mail text UNIQUE' }, { indexes: { mail: 'users_mail_idx (mail)' } }),
      table('orders', 'orders', { id: 'id int PK', user: 'user_id int' }, { order: 'a1' }),
      [edge('e1', 'orders.user', 'users.id')],
    )
    const after = state(
      table('users', 'users', { id: 'id int', mail: 'mail text' }),
      table('orders', 'orders', { id: 'id int PK', user: 'user_id int' }, { order: 'a1' }),
    )
    const drops = (vendor: Parameters<typeof plan>[2]) =>
      plan(before, after, vendor).statements.flatMap((statement) => statement.sql)

    expect(drops('postgresql')).toEqual([
      'ALTER TABLE orders DROP CONSTRAINT orders_user_id_fkey;',
      'ALTER TABLE users DROP CONSTRAINT users_pkey;',
      'ALTER TABLE users DROP CONSTRAINT users_mail_key;',
      'DROP INDEX users_mail_idx;',
      'ALTER TABLE users ALTER COLUMN id DROP NOT NULL;',
    ])
    expect(drops('mysql')).toEqual([
      'ALTER TABLE orders DROP FOREIGN KEY orders_user_id_fkey;',
      'ALTER TABLE users DROP PRIMARY KEY;',
      'ALTER TABLE users DROP INDEX users_mail_key;',
      'DROP INDEX users_mail_idx ON users;',
      'ALTER TABLE users MODIFY COLUMN id int;',
    ])
    expect(drops('sqlserver')).toEqual([
      'ALTER TABLE orders DROP CONSTRAINT orders_user_id_fkey;',
      'ALTER TABLE users DROP CONSTRAINT users_pkey;',
      'ALTER TABLE users DROP CONSTRAINT users_mail_key;',
      'DROP INDEX users_mail_idx ON users;',
      'ALTER TABLE users ALTER COLUMN id int NULL;',
    ])
    expect(drops('sqlite')).toEqual(['DROP INDEX users_mail_key;', 'DROP INDEX users_mail_idx;'])
  })

  it('renames a foreign key in MySQL by dropping and adding it, around the rename of its column', () => {
    const before = state(
      table('users', 'users', { id: 'id int PK' }),
      table('boards', 'boards', { id: 'id int PK', owner: 'owner_id int' }, { order: 'a1' }),
      [edge('e1', 'boards.owner', 'users.id')],
    )
    const after = state(
      table('users', 'users', { id: 'id int PK' }),
      table('boards', 'boards', { id: 'id int PK', owner: 'author_id int' }, { order: 'a1' }),
      [edge('e1', 'boards.owner', 'users.id')],
    )

    expect(migrate(before, after, 'mysql')).toBe(
      [
        'ALTER TABLE boards DROP FOREIGN KEY boards_owner_id_fkey;',
        '',
        'ALTER TABLE boards RENAME COLUMN owner_id TO author_id;',
        '',
        'ALTER TABLE boards ADD CONSTRAINT boards_author_id_fkey FOREIGN KEY (author_id) REFERENCES users (id);',
      ].join('\n'),
    )
    expect(migrate(before, after, 'postgresql')).toBe(
      [
        'ALTER TABLE boards RENAME COLUMN owner_id TO author_id;',
        'ALTER TABLE boards RENAME CONSTRAINT boards_owner_id_fkey TO boards_author_id_fkey;',
      ].join('\n'),
    )
  })

  it('drops and creates again the keys and indexes of a column whose type SQL Server changes', () => {
    const before = state(
      table(
        'users',
        'users',
        { id: 'id int PK', code: 'code varchar(10) UNIQUE' },
        { indexes: { code: 'users_code_idx (code)' } },
      ),
    )
    const after = state(
      table(
        'users',
        'users',
        { id: 'id bigint PK', code: 'code varchar(20) UNIQUE' },
        { indexes: { code: 'users_code_idx (code)' } },
      ),
    )

    expect(plan(before, after, 'sqlserver').statements.flatMap((statement) => statement.sql)).toEqual([
      'ALTER TABLE users DROP CONSTRAINT users_pkey;',
      'ALTER TABLE users DROP CONSTRAINT users_code_key;',
      'DROP INDEX users_code_idx ON users;',
      'ALTER TABLE users ALTER COLUMN id bigint NOT NULL;',
      'ALTER TABLE users ALTER COLUMN code varchar(20) NULL;',
      'ALTER TABLE users ADD CONSTRAINT users_pkey PRIMARY KEY (id);',
      'ALTER TABLE users ADD CONSTRAINT users_code_key UNIQUE (code);',
      'CREATE INDEX users_code_idx ON users (code);',
    ])
    expect(plan(before, after, 'postgresql').statements.flatMap((statement) => statement.sql)).toEqual([
      'ALTER TABLE users ALTER COLUMN id TYPE bigint USING id::bigint;',
      'ALTER TABLE users ALTER COLUMN code TYPE varchar(20) USING code::varchar(20);',
    ])
  })

  it('writes the method of an index where the database has one, and skips it with a note elsewhere', () => {
    const after = state(
      table(
        'docs',
        'docs',
        { id: 'id int PK', tags: 'tags text' },
        { indexes: { tags: 'docs_tags_idx (tags) USING gin', hash: 'docs_hash_idx (tags) USING hash' } },
      ),
    )
    const indexes = (vendor: Parameters<typeof plan>[2]) =>
      plan(state(), after, vendor)
        .statements.filter((statement) => statement.sql.some((sql) => sql.includes('INDEX')))
        .map((statement) => [...statement.comments.map((comment) => `-- ${comment}`), ...statement.sql].join('\n'))

    expect(indexes('postgresql')).toEqual([
      'CREATE INDEX docs_tags_idx ON docs USING gin (tags);',
      'CREATE INDEX docs_hash_idx ON docs USING hash (tags);',
    ])
    expect(indexes('mysql')).toEqual([
      '-- Метод индекса gin пропущен: в MySQL его нет\nCREATE INDEX docs_tags_idx ON docs (tags);',
      'CREATE INDEX docs_hash_idx ON docs (tags) USING HASH;',
    ])
    expect(indexes('oracle')[0]).toBe(
      '-- Метод индекса gin пропущен: в Oracle его нет\nCREATE INDEX docs_tags_idx ON docs (tags);',
    )
  })

  it('quotes the columns of an index as the database does, and keeps expressions as written', () => {
    const after = state(table('t', 't', { a: '"Full Name" text' }, { indexes: { a: 't_idx ("Full Name", lower("Full Name"))' } }))

    expect(plan(state(), after, 'mysql').statements.at(-1)!.sql).toEqual([
      'CREATE INDEX t_idx ON t (`Full Name`, lower("Full Name"));',
    ])
    expect(plan(state(), after, 'sqlserver').statements.at(-1)!.sql).toEqual([
      'CREATE INDEX t_idx ON t ([Full Name], lower("Full Name"));',
    ])
  })

  it('makes a table of ClickHouse without a primary key ordered by nothing', () => {
    expect(
      migrate(
        state(),
        state(table('events', 'events', { at: 'at DateTime64(3)', name: 'name LowCardinality(String)' })),
        'clickhouse',
      ),
    ).toBe(
      'CREATE TABLE events (\n    at DateTime64(3),\n    name LowCardinality(String)\n)\nENGINE = MergeTree\nORDER BY tuple();',
    )
  })

  it('tells that SQLite and ClickHouse change no primary key and add no foreign key to a table that is there', () => {
    const before = state(
      table('users', 'users', { id: 'id int' }),
      table('orders', 'orders', { user: 'user_id int' }, { order: 'a1' }),
    )
    const after = state(
      table('users', 'users', { id: 'id int PK' }),
      table('orders', 'orders', { user: 'user_id int' }, { order: 'a1' }),
      [edge('e1', 'orders.user', 'users.id')],
    )
    const comments = (vendor: Parameters<typeof plan>[2]) =>
      plan(before, after, vendor)
        .statements.filter((statement) => statement.unsupported)
        .flatMap((statement) => statement.comments)

    expect(comments('sqlite')).toEqual([
      'SQLite не меняет тип и NOT NULL столбца users.id: таблицу нужно пересоздать: новая таблица, перенос строк, DROP TABLE и RENAME',
      'SQLite не меняет первичный ключ готовой таблицы users: таблицу нужно пересоздать: новая таблица, перенос строк, DROP TABLE и RENAME',
      'SQLite не добавляет внешний ключ orders_user_id_fkey в готовую таблицу orders: таблицу нужно пересоздать: новая таблица, перенос строк, DROP TABLE и RENAME',
    ])
    expect(comments('clickhouse')).toEqual([
      'ClickHouse задаёт NULL типом Nullable(…), а не NOT NULL: смените тип users.id',
      'ClickHouse не меняет первичный ключ (ORDER BY) готовой таблицы users: её нужно пересоздать',
      'В ClickHouse нет внешних ключей: orders.user_id → users.id не создаётся',
    ])
  })
})
