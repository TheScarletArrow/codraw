import { describe, expect, it } from 'vitest'
import { orderSqlFiles, parseSql, parseSqlFiles, tokenize, type SqlSchema } from './parseSql.ts'

/** Columns of a table as `name type flags`, for short expectations. */
const columns = (schema: SqlSchema, table: string) =>
  schema.tables
    .find((candidate) => candidate.name === table)!
    .columns.map((column) =>
      [column.name, column.type, column.primaryKey && 'PK', column.notNull && 'NN', column.unique && 'U'].filter(Boolean).join(' '),
    )

/** Columns of a view as `name type`, or the name alone without a type. */
const viewColumns = (schema: SqlSchema, view: string) =>
  schema.views.find((candidate) => candidate.name === view)!.columns.map((column) => [column.name, column.type].filter(Boolean).join(' '))

const keys = (schema: SqlSchema, table: string) =>
  schema.tables.find((candidate) => candidate.name === table)!.foreignKeys.map(({ columns, table, references }) => ({ columns, table, references }))

describe('parsing DDL', () => {
  it('reads tables with types of several words, arguments and arrays, and the constraints of columns', () => {
    const schema = parseSql(`
      -- Users of the service
      CREATE TABLE IF NOT EXISTS public.users (
        id uuid PRIMARY KEY DEFAULT uuidv7(),
        email varchar(255) NOT NULL UNIQUE,
        "Full Name" text,
        balance numeric(10, 2) DEFAULT 0 CHECK (balance >= 0),
        tags text[] NOT NULL DEFAULT '{}',
        created_at timestamp with time zone NOT NULL DEFAULT now() /* when */
      );
    `)

    expect(schema.tables.map((table) => table.name)).toEqual(['users'])
    expect(columns(schema, 'users')).toEqual([
      'id uuid PK NN',
      'email varchar(255) NN U',
      'Full Name text',
      'balance numeric(10, 2)',
      'tags text[] NN',
      'created_at timestamp with time zone NN',
    ])
  })

  it('reads foreign keys of columns and of tables, and composite primary keys', () => {
    const schema = parseSql(`
      CREATE TABLE users (id uuid PRIMARY KEY);
      CREATE TABLE boards (
        id bigserial,
        owner_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        CONSTRAINT boards_pk PRIMARY KEY (id)
      );
      CREATE TABLE board_members (
        board_id bigint, user_id uuid, role text,
        PRIMARY KEY (board_id, user_id),
        CONSTRAINT fk_board FOREIGN KEY (board_id) REFERENCES boards (id),
        FOREIGN KEY (user_id) REFERENCES users
      );
    `)

    expect(columns(schema, 'boards')).toEqual(['id bigserial PK NN', 'owner_id uuid NN'])
    expect(keys(schema, 'boards')).toEqual([{ columns: ['owner_id'], table: 'users', references: ['id'] }])
    expect(columns(schema, 'board_members')).toEqual(['board_id bigint PK NN', 'user_id uuid PK NN', 'role text'])
    expect(keys(schema, 'board_members')).toEqual([
      { columns: ['board_id'], table: 'boards', references: ['id'] },
      { columns: ['user_id'], table: 'users', references: [] },
    ])
  })

  it('applies ALTER TABLE: columns added, dropped, renamed and changed, constraints added and dropped', () => {
    const schema = parseSql(`
      CREATE TABLE users (id uuid PRIMARY KEY, mail text, legacy int);
      CREATE TABLE boards (id uuid, owner uuid, title text NOT NULL);
      ALTER TABLE users RENAME COLUMN mail TO email;
      ALTER TABLE users ADD COLUMN name text NOT NULL, DROP COLUMN legacy;
      ALTER TABLE ONLY boards ADD CONSTRAINT boards_pkey PRIMARY KEY (id);
      ALTER TABLE boards ADD CONSTRAINT boards_owner_fk FOREIGN KEY (owner) REFERENCES users (id);
      ALTER TABLE boards ALTER COLUMN title DROP NOT NULL, ALTER COLUMN title TYPE varchar(100) USING title::varchar;
      ALTER TABLE boards RENAME TO desks;
      ALTER TABLE users ALTER COLUMN email SET NOT NULL;
    `)

    expect(columns(schema, 'users')).toEqual(['id uuid PK NN', 'email text NN', 'name text NN'])
    expect(columns(schema, 'desks')).toEqual(['id uuid PK NN', 'owner uuid', 'title varchar(100)'])
    expect(keys(schema, 'desks')).toEqual([{ columns: ['owner'], table: 'users', references: ['id'] }])

    parseSql('ALTER TABLE desks DROP CONSTRAINT boards_owner_fk; ALTER TABLE users RENAME TO people;', schema)
    expect(keys(schema, 'desks')).toEqual([])
    expect(schema.tables.map((table) => table.name)).toEqual(['people', 'desks'])
  })

  it('follows renamed tables and columns in the keys that refer to them, and drops the keys of a dropped table', () => {
    const schema = parseSql(`
      CREATE TABLE users (uid uuid PRIMARY KEY);
      CREATE TABLE boards (id uuid PRIMARY KEY, owner_id uuid REFERENCES users (uid));
      ALTER TABLE users RENAME COLUMN uid TO id;
      ALTER TABLE users RENAME TO accounts;
    `)
    expect(keys(schema, 'boards')).toEqual([{ columns: ['owner_id'], table: 'accounts', references: ['id'] }])

    parseSql('DROP TABLE IF EXISTS accounts CASCADE;', schema)
    expect(schema.tables.map((table) => table.name)).toEqual(['boards'])
    expect(keys(schema, 'boards')).toEqual([])
  })

  it('skips what it does not draw, also functions with semicolons in their bodies, and counts them', () => {
    const schema = parseSql(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      CREATE TABLE notes (id serial PRIMARY KEY, body text);
      CREATE TYPE mood AS ENUM ('ok', 'sad');
      CREATE FUNCTION touch() RETURNS trigger AS $$ BEGIN NEW.body := 'x;y'; RETURN NEW; END; $$ LANGUAGE plpgsql;
      INSERT INTO notes (body) VALUES ('a; b');
      CREATE TABLE copy AS SELECT * FROM notes;
      ALTER TABLE missing ADD COLUMN x int;
    `)

    expect(schema.tables.map((table) => table.name)).toEqual(['notes'])
    // The type, the function, the copy of a query and the change of a table that is not there; the extension and the
    // data describe no table.
    expect(schema.skipped).toBe(4)
  })

  it('passes over statements that describe no table without counting them', () => {
    const schema = parseSql(`
      SET search_path = public;
      SELECT pg_catalog.set_config('search_path', '', false);
      CREATE EXTENSION pgcrypto;
      CREATE SCHEMA app;
      CREATE SEQUENCE notes_seq;
      CREATE TABLE notes (id serial PRIMARY KEY);
      COMMENT ON TABLE notes IS 'Заметки';
      ALTER TABLE notes OWNER TO app;
      ALTER SEQUENCE notes_seq OWNED BY notes.id;
      GRANT SELECT ON notes TO reporting;
      BEGIN;
      INSERT INTO notes DEFAULT VALUES;
      COMMIT;
      DROP VIEW IF EXISTS old_notes;
    `)

    expect(schema.tables.map((table) => table.name)).toEqual(['notes'])
    expect(schema.skipped).toBe(0)
  })

  it('leaves out lines of meta-commands of psql, which have no semicolon', () => {
    const schema = parseSql('\\restrict 4fGh7\n\nSET statement_timeout = 0;\nCREATE TABLE users (id int PRIMARY KEY);\n  \\connect shop\nCREATE TABLE boards (id int);\n\\unrestrict 4fGh7\n')

    expect(schema.tables.map((table) => table.name)).toEqual(['users', 'boards'])
    expect(schema.skipped).toBe(0)
  })

  it('ends statements at the delimiter that DELIMITER of the MySQL client sets', () => {
    const schema = parseSql(`
      CREATE TABLE orders (
        id int NOT NULL,
        delimiter varchar(8)
      );
      DELIMITER ;;
      CREATE PROCEDURE add_order(IN p_user INT)
      BEGIN
        INSERT INTO orders (id) VALUES (p_user);
        SELECT LAST_INSERT_ID();
      END ;;
      DELIMITER ;
      CREATE TABLE users (id int);
      DELIMITER //
      CREATE TRIGGER t BEFORE INSERT ON orders FOR EACH ROW BEGIN SET NEW.id = 1; END //
      delimiter $$
      CREATE FUNCTION f() RETURNS int RETURN 1; $$
      DELIMITER ;
      CREATE TABLE items (id int);
    `)

    expect(schema.tables.map((table) => table.name)).toEqual(['orders', 'users', 'items'])
    expect(columns(schema, 'orders')).toEqual(['id int NN', 'delimiter varchar(8)'])
    // The procedure, the trigger and the function.
    expect(schema.skipped).toBe(3)
  })

  it('leaves out the data of COPY FROM stdin up to the line \\.', () => {
    const schema = parseSql(
      [
        'CREATE TABLE users (id bigint NOT NULL, name text);',
        'COPY public.users (id, name) FROM stdin;',
        "1\tO'Brien; \"the\" builder",
        '2\t\\N',
        '\\.',
        '',
        'ALTER TABLE ONLY users ADD CONSTRAINT users_pkey PRIMARY KEY (id);',
      ].join('\n'),
    )

    expect(columns(schema, 'users')).toEqual(['id bigint PK NN', 'name text'])
    expect(schema.skipped).toBe(0)
  })

  it('makes an integer serial when ALTER TABLE gives it the next value of a sequence, as pg_dump writes serial', () => {
    const schema = parseSql(`
      CREATE TABLE users (id bigint NOT NULL, code integer DEFAULT nextval('codes'::regclass), rank smallint, note text);
      ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);
      ALTER TABLE ONLY public.users ALTER COLUMN rank SET DEFAULT nextval('public.users_rank_seq'::regclass);
      ALTER TABLE ONLY public.users ALTER COLUMN note SET DEFAULT nextval('public.users_note_seq'::regclass);
    `)

    expect(columns(schema, 'users')).toEqual(['id bigserial NN', 'code integer', 'rank smallserial', 'note text'])
  })

  it('does not draw partitions, and does not skip statements about them', () => {
    const schema = parseSql(`
      CREATE TABLE measurements (id bigint NOT NULL, taken_on date NOT NULL) PARTITION BY RANGE (taken_on);
      CREATE TABLE measurements_2025 PARTITION OF measurements FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
      CREATE TABLE public.measurements_2026 (id bigint NOT NULL, taken_on date NOT NULL);
      ALTER TABLE public.measurements_2026 OWNER TO app;
      ALTER TABLE ONLY public.measurements ATTACH PARTITION public.measurements_2026 FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
      ALTER TABLE ONLY public.measurements ADD CONSTRAINT measurements_pkey PRIMARY KEY (id, taken_on);
      ALTER TABLE ONLY public.measurements_2026 ADD CONSTRAINT measurements_2026_pkey PRIMARY KEY (id, taken_on);
      CREATE INDEX measurements_2026_taken_on_idx ON public.measurements_2026 (taken_on);
      ALTER INDEX public.measurements_pkey ATTACH PARTITION public.measurements_2026_pkey;
    `)

    expect(schema.tables.map((table) => table.name)).toEqual(['measurements'])
    expect(columns(schema, 'measurements')).toEqual(['id bigint PK NN', 'taken_on date PK NN'])
    expect(schema.skipped).toBe(0)
  })

  it('keeps partitions apart across files of migrations', () => {
    const schema = parseSqlFiles([
      { name: 'V1__events.sql', text: 'CREATE TABLE events (id int) PARTITION BY LIST (id); CREATE TABLE events_1 PARTITION OF events FOR VALUES IN (1);' },
      { name: 'V2__index.sql', text: 'CREATE INDEX events_1_id_idx ON events_1 (id);' },
    ])

    expect(schema.tables.map((table) => table.name)).toEqual(['events'])
    expect(schema.skipped).toBe(0)
  })

  it('writes types without their schema and without the character set of MySQL', () => {
    const schema = parseSql(`
      CREATE TABLE orders (status public.order_status NOT NULL, tags "app"."tag"[], name varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL, code char(2) CHARSET latin1, title character varying(20));
      ALTER TABLE orders ALTER COLUMN status TYPE app.order_state USING status::text::app.order_state;
    `)

    expect(columns(schema, 'orders')).toEqual(['status order_state NN', 'tags tag[]', 'name varchar(100)', 'code char(2)', 'title character varying(20)'])
  })

  it('reads the first name of each column of a key, without the prefix of a key of MySQL', () => {
    const schema = parseSql(`
      CREATE TABLE products (
        id int NOT NULL, title varchar(200), code varchar(10),
        PRIMARY KEY (id),
        KEY products_title_idx (title(50)),
        UNIQUE KEY products_code_title_key (code(4), title)
      );
    `)

    expect(schema.tables[0]!.indexes).toEqual([
      { name: 'products_title_idx', columns: 'title', unique: false, method: '', rest: '' },
      { name: 'products_code_title_key', columns: 'code, title', unique: true, method: '', rest: '' },
    ])
  })

  it('reads what clients of databases read only in scripts, not in the text of a field', () => {
    expect(tokenize('delimiter text').map((token) => token.value)).toEqual(['DELIMITER', 'TEXT'])
    expect(tokenize('\\x; y').map((token) => [token.kind, token.value])).toEqual([
      ['symbol', '\\'],
      ['word', 'X'],
      ['symbol', ';'],
      ['word', 'Y'],
    ])
    expect(tokenize('a; b', { script: true }).map((token) => token.kind)).toEqual(['word', 'end', 'word'])
  })

  it('keeps the keys of tables to tables that a dump of mysqldump drops before it creates them', () => {
    const schema = parseSql(`
      DROP TABLE IF EXISTS \`order_items\`;
      CREATE TABLE \`order_items\` (\`order_id\` int NOT NULL, CONSTRAINT \`order_items_order_fk\` FOREIGN KEY (\`order_id\`) REFERENCES \`orders\` (\`id\`));
      DROP TABLE IF EXISTS \`orders\`;
      CREATE TABLE \`orders\` (\`id\` int NOT NULL, PRIMARY KEY (\`id\`));
    `)

    expect(keys(schema, 'order_items')).toEqual([{ columns: ['order_id'], table: 'orders', references: ['id'] }])
  })

  it('reads the common part of MySQL: backticks, AUTO_INCREMENT and keys of the table', () => {
    const schema = parseSql(`
      CREATE TABLE \`orders\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`user_id\` INT NOT NULL,
        PRIMARY KEY (\`id\`),
        KEY \`user_idx\` (\`user_id\`),
        CONSTRAINT \`orders_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`)
      ) ENGINE=InnoDB;
    `)

    expect(columns(schema, 'orders')).toEqual(['id int PK NN', 'user_id int NN'])
    expect(keys(schema, 'orders')).toEqual([{ columns: ['user_id'], table: 'users', references: ['id'] }])
  })

  it('reads indexes: of CREATE INDEX with their columns and conditions as written, and composite unique constraints', () => {
    const schema = parseSql(`
      CREATE TABLE users (id uuid PRIMARY KEY, org_id uuid, email text UNIQUE, created_at timestamptz, UNIQUE (org_id, email));
      CREATE INDEX ON users (org_id);
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS users_email_key ON ONLY public.users USING btree (lower(email)) WHERE email IS NOT NULL;
      CREATE INDEX users_recent_idx ON users (created_at DESC) INCLUDE (email);
      ALTER TABLE users ADD CONSTRAINT users_pair UNIQUE (id, org_id);
      CREATE INDEX missing_idx ON missing (id);
    `)

    expect(schema.tables[0]!.indexes).toEqual([
      { name: 'users_org_id_email_key', columns: 'org_id, email', unique: true, method: '', rest: '' },
      { name: 'users_org_id_idx', columns: 'org_id', unique: false, method: '', rest: '' },
      { name: 'users_email_key', columns: 'lower(email)', unique: true, method: 'btree', rest: 'WHERE email IS NOT NULL' },
      { name: 'users_recent_idx', columns: 'created_at DESC', unique: false, method: '', rest: 'INCLUDE (email)' },
      { name: 'users_pair', columns: 'id, org_id', unique: true, method: '', rest: '' },
    ])
    expect(columns(schema, 'users')).toContain('email text U')
    expect(schema.skipped).toBe(1)
  })

  it('follows indexes through migrations: renamed and dropped columns, renamed and dropped indexes and constraints', () => {
    const schema = parseSql(`
      CREATE TABLE users (id uuid PRIMARY KEY, mail text, name text, org_id uuid);
      CREATE INDEX users_mail_idx ON users (mail, lower(mail));
      CREATE INDEX users_name_idx ON users (name);
      CREATE INDEX users_old_idx ON users (org_id);
      ALTER TABLE users ADD CONSTRAINT users_org_name UNIQUE (org_id, name);
      ALTER TABLE users RENAME COLUMN mail TO email;
      ALTER INDEX users_mail_idx RENAME TO users_email_idx;
      ALTER TABLE users DROP COLUMN name;
      DROP INDEX IF EXISTS users_old_idx, users_gone_idx;
    `)

    expect(schema.tables[0]!.indexes).toEqual([{ name: 'users_email_idx', columns: 'email, lower(mail)', unique: false, method: '', rest: '' }])
    expect(schema.skipped).toBe(0)

    parseSql('ALTER TABLE users ADD CONSTRAINT users_pair UNIQUE (id, email); ALTER TABLE users DROP CONSTRAINT users_pair', schema)
    expect(schema.tables[0]!.indexes.map((index) => index.name)).toEqual(['users_email_idx'])
  })

  it('reads the indexes of MySQL inside CREATE TABLE', () => {
    const schema = parseSql(`
      CREATE TABLE \`orders\` (
        \`id\` INT NOT NULL,
        \`user_id\` INT NOT NULL,
        \`code\` VARCHAR(20),
        KEY \`user_idx\` (\`user_id\`),
        INDEX (\`user_id\`, \`code\`),
        UNIQUE KEY \`code_key\` (\`code\`),
        UNIQUE INDEX \`pair_key\` (\`id\`, \`code\`)
      );
    `)

    expect(schema.tables[0]!.indexes).toEqual([
      { name: 'user_idx', columns: 'user_id', unique: false, method: '', rest: '' },
      { name: 'orders_user_id_code_idx', columns: 'user_id, code', unique: false, method: '', rest: '' },
      { name: 'pair_key', columns: 'id, code', unique: true, method: '', rest: '' },
    ])
    expect(columns(schema, 'orders')).toContain('code varchar(20) U')
  })

  it('orders migrations of Flyway by version, then repeatable ones, then other files, without undo migrations', () => {
    const order = orderSqlFiles(
      ['V10__c.sql', 'schema.sql', 'V2__b.sql', 'U2__b.sql', 'R__views.sql', 'V1_1__a.sql', 'V1__init.sql'].map((name) => ({
        name,
        text: '',
      })),
    )

    expect(order.map((file) => file.name)).toEqual(['V1__init.sql', 'V1_1__a.sql', 'V2__b.sql', 'V10__c.sql', 'R__views.sql', 'schema.sql'])
  })

  it('makes the schema of migrations in the order of their versions', () => {
    const schema = parseSqlFiles([
      { name: 'V2__boards.sql', text: 'CREATE TABLE boards (id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users (id));' },
      { name: 'V1__users.sql', text: 'CREATE TABLE users (id uuid PRIMARY KEY, email text NOT NULL);' },
      { name: 'V3__name.sql', text: 'ALTER TABLE users ADD COLUMN name text;' },
    ])

    expect(schema.tables.map((table) => table.name)).toEqual(['users', 'boards'])
    expect(columns(schema, 'users')).toEqual(['id uuid PK NN', 'email text NN', 'name text'])
  })
})

describe('parsing views', () => {
  it('reads a view with the columns of its select, typed by the tables it reads, and its query as written', () => {
    const schema = parseSql(`
      CREATE TABLE users (id uuid PRIMARY KEY, email text NOT NULL);
      CREATE TABLE orders (id bigint PRIMARY KEY, user_id uuid REFERENCES users);
      CREATE VIEW user_orders AS SELECT u.id, u.email, count(o.id) AS orders
        FROM users u LEFT JOIN orders o ON o.user_id = u.id GROUP BY u.id;
    `)

    expect(schema.tables.map((table) => table.name)).toEqual(['users', 'orders'])
    expect(schema.views).toEqual([
      {
        name: 'user_orders',
        columns: [
          { name: 'id', type: 'uuid', notNull: false, primaryKey: false, unique: false },
          { name: 'email', type: 'text', notNull: false, primaryKey: false, unique: false },
          { name: 'orders', type: 'bigint', notNull: false, primaryKey: false, unique: false },
        ],
        query: 'SELECT u.id, u.email, count(o.id) AS orders\n        FROM users u LEFT JOIN orders o ON o.user_id = u.id GROUP BY u.id',
        materialized: false,
        indexes: [],
        dependencies: ['users', 'orders'],
      },
    ])
    expect(schema.skipped).toBe(0)
  })

  it('reads materialized views with their indexes, names their columns by the list, and leaves WITH NO DATA out', () => {
    const schema = parseSql(`
      CREATE TABLE orders (id bigserial PRIMARY KEY, user_id uuid NOT NULL, amount numeric(12, 2));
      CREATE MATERIALIZED VIEW IF NOT EXISTS order_totals (user_id, total) AS
        SELECT user_id, sum(amount)::numeric(12, 2) FROM orders GROUP BY user_id
      WITH NO DATA;
      CREATE UNIQUE INDEX ON order_totals (user_id);
      CREATE INDEX order_totals_total_idx ON order_totals (total);
      ALTER INDEX order_totals_total_idx RENAME TO order_totals_sum_idx;
      REFRESH MATERIALIZED VIEW order_totals;
    `)

    const [view] = schema.views
    expect(view!.materialized).toBe(true)
    expect(view!.query).toBe('SELECT user_id, sum(amount)::numeric(12, 2) FROM orders GROUP BY user_id')
    expect(viewColumns(schema, 'order_totals')).toEqual(['user_id uuid', 'total numeric(12, 2)'])
    expect(view!.indexes.map((index) => `${index.name} (${index.columns})${index.unique ? ' UNIQUE' : ''}`)).toEqual([
      'order_totals_user_id_idx (user_id) UNIQUE',
      'order_totals_sum_idx (total)',
    ])
    expect(schema.skipped).toBe(0)
  })

  it('follows views through migrations: replaced, renamed, columns renamed, dropped, and tables renamed under them', () => {
    const schema = parseSql(`
      CREATE TABLE notes (id serial PRIMARY KEY, body text);
      CREATE VIEW recent AS SELECT * FROM notes;
      CREATE OR REPLACE VIEW recent AS SELECT *, length(body) AS size FROM notes;
      ALTER VIEW recent RENAME TO recent_notes;
      ALTER VIEW IF EXISTS recent_notes RENAME COLUMN size TO body_length;
      ALTER VIEW recent_notes ALTER COLUMN body SET DEFAULT '';
      CREATE VIEW old_notes AS SELECT id FROM notes;
      DROP VIEW IF EXISTS old_notes, gone_notes CASCADE;
      ALTER TABLE notes RENAME TO memos;
    `)

    expect(schema.views.map((view) => view.name)).toEqual(['recent_notes'])
    expect(viewColumns(schema, 'recent_notes')).toEqual(['id integer', 'body text', 'body_length'])
    expect(schema.views[0]!.dependencies).toEqual(['memos'])
    expect(schema.skipped).toBe(0)
  })

  it('counts changes of views that are not there and indexes of plain views as skipped', () => {
    const schema = parseSql(`
      CREATE TABLE notes (id int);
      CREATE VIEW all_notes AS SELECT * FROM notes;
      ALTER VIEW missing RENAME TO other;
      CREATE INDEX ON all_notes (id);
    `)

    expect(schema.views.map((view) => view.name)).toEqual(['all_notes'])
    expect(schema.skipped).toBe(2)
  })

  it('reads the views of MySQL with ALGORITHM, DEFINER and SQL SECURITY, and from executable comments of dumps', () => {
    const schema = parseSql(`
      CREATE TABLE \`orders\` (\`id\` int unsigned NOT NULL, \`total\` decimal(12,2) NOT NULL, PRIMARY KEY (\`id\`));
      /*!50001 CREATE VIEW \`paid\` AS SELECT 1 AS \`id\`, 1 AS \`total\`*/;
      /*!50001 CREATE ALGORITHM=UNDEFINED */
      /*!50013 DEFINER=\`root\`@\`localhost\` SQL SECURITY DEFINER */
      /*!50001 VIEW \`paid\` AS select \`orders\`.\`id\` AS \`id\`,\`orders\`.\`total\` AS \`total\` from \`orders\` */;
      /*M!999999\\- enable the sandbox mode */
      CREATE OR REPLACE DEFINER = CURRENT_USER SQL SECURITY INVOKER VIEW big AS SELECT id FROM orders WHERE total > 100;
    `)

    expect(schema.views.map((view) => view.name)).toEqual(['paid', 'big'])
    expect(viewColumns(schema, 'paid')).toEqual(['id int unsigned', 'total decimal(12, 2)'])
    expect(schema.views[0]!.query).toBe('select `orders`.`id` AS `id`,`orders`.`total` AS `total` from `orders`')
    expect(schema.skipped).toBe(0)
  })

  it('reads the views that the import from a live database writes, in the order of what they read', () => {
    const schema = parseSql(`-- Schema shop of PostgreSQL 18.1

CREATE TABLE orders (
    id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
    user_id bigint NOT NULL,
    total numeric(10,2),
    deleted_at timestamp with time zone
);

CREATE VIEW active_orders AS
 SELECT id,
    user_id,
    total,
    deleted_at
   FROM shop.orders
  WHERE (deleted_at IS NULL);

CREATE MATERIALIZED VIEW order_totals AS
 SELECT user_id,
    sum(total) AS total
   FROM shop.active_orders
  GROUP BY user_id
  WITH NO DATA;

CREATE VIEW big_spenders AS
 SELECT user_id
   FROM shop.order_totals
  WHERE (total > (100)::numeric);

ALTER TABLE ONLY orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX order_totals_user_id_idx ON shop.order_totals USING btree (user_id);
`)

    expect(schema.views.map((view) => [view.name, view.materialized, view.dependencies])).toEqual([
      ['active_orders', false, ['orders']],
      ['order_totals', true, ['active_orders']],
      ['big_spenders', false, ['order_totals']],
    ])
    expect(viewColumns(schema, 'order_totals')).toEqual(['user_id bigint', 'total'])
    expect(viewColumns(schema, 'big_spenders')).toEqual(['user_id bigint'])
    expect(schema.views[1]!.query).toBe('SELECT user_id,\n    sum(total) AS total\n   FROM shop.active_orders\n  GROUP BY user_id')
    expect(schema.views[1]!.indexes.map((index) => index.name)).toEqual(['order_totals_user_id_idx'])
    expect(schema.skipped).toBe(0)
  })

  it('reads executable comments of MySQL in files only, not in the text of a field', () => {
    expect(tokenize('/*!40101 SET NAMES utf8 */').map((token) => token.value)).toEqual([])
    expect(tokenize('/*!40101 SET NAMES utf8 */', { script: true }).map((token) => token.value)).toEqual(['SET', 'NAMES', 'UTF8'])
  })
})
