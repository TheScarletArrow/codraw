import { describe, expect, it } from 'vitest'
import { orderSqlFiles, parseSql, parseSqlFiles, type SqlSchema } from './parseSql.ts'

/** Columns of a table as `name type flags`, for short expectations. */
const columns = (schema: SqlSchema, table: string) =>
  schema.tables
    .find((candidate) => candidate.name === table)!
    .columns.map((column) =>
      [column.name, column.type, column.primaryKey && 'PK', column.notNull && 'NN', column.unique && 'U'].filter(Boolean).join(' '),
    )

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

  it('skips other statements, also functions with semicolons in their bodies, and counts them', () => {
    const schema = parseSql(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      CREATE TABLE notes (id serial PRIMARY KEY, body text);
      CREATE VIEW recent_notes AS SELECT * FROM notes;
      CREATE FUNCTION touch() RETURNS trigger AS $$ BEGIN NEW.body := 'x;y'; RETURN NEW; END; $$ LANGUAGE plpgsql;
      INSERT INTO notes (body) VALUES ('a; b');
      CREATE TABLE copy AS SELECT * FROM notes;
    `)

    expect(schema.tables.map((table) => table.name)).toEqual(['notes'])
    expect(schema.skipped).toBe(5)
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
