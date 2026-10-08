import { describe, expect, it } from 'vitest'
import mariadbDump from './fixtures/mariadb-dump-11.8-no-data.sql?raw'
import mysqlDump from './fixtures/mysqldump-8.4-no-data.sql?raw'
import pgDumpNoOwner from './fixtures/pg_dump-18-schema-only-no-owner-no-privileges.sql?raw'
import pgDump from './fixtures/pg_dump-18-schema-only.sql?raw'
import pgDumpWithData from './fixtures/pg_dump-18-with-data.sql?raw'
import mysqlSchema from './fixtures/shop.mysql.sql?raw'
import postgresSchema from './fixtures/shop.postgres.sql?raw'
import { parseSql, type SqlSchema } from './parseSql.ts'

// The dumps are the output of pg_dump 18.6, mysqldump 8.4 and mariadb-dump 11.8 for the schemas `shop.*.sql`; how
// they were made is written at the top of those files.

/** Tables as `name: column type flags`, for short expectations. */
const tables = (schema: SqlSchema) =>
  Object.fromEntries(
    schema.tables.map((table) => [
      table.name,
      table.columns.map((column) =>
        [column.name, column.type, column.primaryKey && 'PK', column.notNull && 'NN', column.unique && 'U'].filter(Boolean).join(' '),
      ),
    ]),
  )

const references = (schema: SqlSchema) =>
  schema.tables.flatMap((table) =>
    table.foreignKeys.map((key) => `${table.name}(${key.columns.join(', ')}) → ${key.table}(${key.references.join(', ')})`),
  )

/** Views as `name: column type`, for short expectations. */
const views = (schema: SqlSchema) =>
  Object.fromEntries(schema.views.map((view) => [view.name, view.columns.map((column) => [column.name, column.type].filter(Boolean).join(' '))]))

const indexes = (schema: SqlSchema) =>
  schema.tables.flatMap((table) => table.indexes.map((index) => `${table.name}: ${index.name} (${index.columns})${index.unique ? ' UNIQUE' : ''}`))

/**
 * What a diagram shows of a schema whatever the spelling of the types: tables, columns with their keys, references,
 * indexes and views with their columns and what they read, by name.
 */
const shape = (schema: SqlSchema) => ({
  tables: Object.fromEntries(
    Object.entries(tables(schema))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, columns]) => [name, columns.map((column) => column.split(' ').filter((word, index) => index === 0 || /^(PK|NN|U)$/.test(word)).join(' '))]),
  ),
  references: references(schema).sort(),
  indexes: indexes(schema)
    .map((index) => index.replace(/ \(.*\)/, ''))
    .sort(),
  views: schema.views.map((view) => ({ name: view.name, columns: view.columns.map((column) => column.name), reads: view.dependencies })),
})

describe('dumps of PostgreSQL', () => {
  const expected = {
    audit_log: ['id bigint PK NN', 'user_id bigint', 'action text NN', 'payload jsonb', 'at timestamp with time zone NN'],
    orders: [
      'id integer PK NN',
      'user_id bigint NN',
      'status order_status NN',
      'invoice_number integer',
      'created_at timestamp with time zone NN',
      'deleted_at timestamp with time zone',
    ],
    measurements: ['id bigint PK NN', 'taken_on date PK NN', 'value double precision'],
    order_items: ['order_id integer PK NN', 'product_id uuid PK NN', 'quantity integer NN'],
    products: ['id uuid PK NN', 'sku character varying(32) NN U', 'title text NN', 'price numeric(10, 2) NN', 'tags text[] NN'],
    users: ['id bigserial PK NN', 'email text NN U', 'name character varying(100)', 'created_at timestamp with time zone NN'],
  }

  it.each([
    ['--schema-only', pgDump],
    ['--schema-only --no-owner --no-privileges', pgDumpNoOwner],
    ['with data', pgDumpWithData],
  ])('reads the tables, keys and indexes of pg_dump %s', (_, dump) => {
    const schema = parseSql(dump)

    expect(tables(schema)).toEqual(expected)
    expect(references(schema)).toEqual([
      'audit_log(user_id) → users(id)',
      'orders(user_id) → users(id)',
      'order_items(order_id) → orders(id)',
      'order_items(product_id) → products(id)',
    ])
    expect(schema.tables.flatMap((table) => table.indexes.map((index) => ({ table: table.name, ...index })))).toEqual([
      { table: 'orders', name: 'orders_user_id_idx', columns: 'user_id', unique: false, method: 'btree', rest: 'WHERE (deleted_at IS NULL)' },
      { table: 'products', name: 'products_tags_idx', columns: 'tags', unique: false, method: 'gin', rest: '' },
      { table: 'users', name: 'users_email_lower_idx', columns: 'lower(email)', unique: true, method: 'btree', rest: '' },
    ])
    expect(views(schema)).toEqual({
      active_orders: [
        'id integer',
        'user_id bigint',
        'status order_status',
        'invoice_number integer',
        'created_at timestamp with time zone',
        'deleted_at timestamp with time zone',
      ],
    })
    expect(schema.views[0]!.query).toBe(
      'SELECT id,\n    user_id,\n    status,\n    invoice_number,\n    created_at,\n    deleted_at\n   FROM public.orders\n  WHERE (deleted_at IS NULL)',
    )
    expect(schema.views[0]!.dependencies).toEqual(['orders'])
    // The type, the function and the trigger; settings, owners, rights, comments, sequences, the partition and the data
    // are not counted.
    expect(schema.skipped).toBe(3)
  })

  it('draws the same diagram as the DDL the dump was made from', () => {
    expect(shape(parseSql(pgDump))).toEqual(shape(parseSql(postgresSchema)))
    expect(parseSql(postgresSchema).skipped).toBe(3)
  })
})

describe('dumps of MySQL and MariaDB', () => {
  it('reads the tables, keys and indexes of mysqldump with routines and triggers', () => {
    const schema = parseSql(mysqlDump)

    expect(tables(schema)).toEqual({
      order_items: ['order_id int unsigned PK NN', 'product_id bigint PK NN', 'quantity smallint NN'],
      orders: [
        'id int unsigned PK NN',
        'user_id int unsigned NN',
        "status enum('new', 'paid', 'shipped', 'cancelled') NN",
        'total decimal(12, 2) NN',
        'created_at timestamp NN',
      ],
      products: ['id bigint PK NN', 'sku varchar(32) NN U', 'title varchar(200) NN', 'price decimal(10, 2) unsigned NN', 'description text'],
      users: ['id int unsigned PK NN', 'email varchar(255) NN U', 'name varchar(100)', 'created_at datetime NN'],
    })
    expect(references(schema)).toEqual([
      'order_items(order_id) → orders(id)',
      'order_items(product_id) → products(id)',
      'orders(user_id) → users(id)',
    ])
    expect(indexes(schema)).toEqual([
      'order_items: order_items_product_idx (product_id)',
      'orders: orders_user_status_idx (user_id, status)',
      'products: products_title_idx (title)',
    ])
    // The final view of mysqldump replaces its stand-in with columns `1 AS id`.
    expect(views(schema)).toEqual({ paid_orders: ['id int unsigned', 'user_id int unsigned', 'total decimal(12, 2)'] })
    expect(schema.views[0]!.dependencies).toEqual(['orders'])
    // The trigger in comments /*! … */ and the procedure between DELIMITER ;; and DELIMITER ;.
    expect(schema.skipped).toBe(2)
  })

  it('reads mariadb-dump with the widths of its integers', () => {
    const schema = parseSql(mariadbDump)

    expect(tables(schema).orders).toEqual([
      'id int(10) unsigned PK NN',
      'user_id int(10) unsigned NN',
      "status enum('new', 'paid', 'shipped', 'cancelled') NN",
      'total decimal(12, 2) NN',
      'created_at timestamp NN',
    ])
    expect(shape(schema)).toEqual(shape(parseSql(mysqlDump)))
    expect(schema.skipped).toBe(2)
  })

  it('draws the same diagram as the DDL the dump was made from', () => {
    expect(shape(parseSql(mysqlDump))).toEqual(shape(parseSql(mysqlSchema)))
  })
})
