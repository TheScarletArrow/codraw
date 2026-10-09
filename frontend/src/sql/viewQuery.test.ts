import { describe, expect, it } from 'vitest'
import { tokenize } from './parseSql.ts'
import { readViewQuery, type ViewColumn } from './viewQuery.ts'

const RELATIONS: Record<string, ViewColumn[]> = {
  users: [
    { name: 'id', type: 'bigserial' },
    { name: 'email', type: 'text' },
    { name: 'created_at', type: 'timestamp with time zone' },
  ],
  orders: [
    { name: 'id', type: 'integer' },
    { name: 'user_id', type: 'bigint' },
    { name: 'total', type: 'numeric(10, 2)' },
  ],
}

const read = (query: string) => readViewQuery(tokenize(query), (name) => RELATIONS[name] ?? null)

/** Columns as `name type`, or the name alone without a type. */
const columns = (query: string) => read(query).columns.map((column) => [column.name, column.type].filter(Boolean).join(' '))

describe('the query of a view', () => {
  it('names columns by their aliases, with AS or without, by the columns they are and by the functions they call', () => {
    expect(columns('SELECT u.id, u.email mail, count(*) total, max(o.total) AS biggest, lower(u.email), u.id + 1 FROM users u, orders o')).toEqual([
      'id bigint',
      'mail text',
      'total bigint',
      'biggest numeric(10, 2)',
      'lower',
      '?column?',
    ])
  })

  it('types columns by casts of types of several words, CAST, literals and the columns of joined sources', () => {
    expect(
      columns(`
        SELECT o.id::text, o.total::double precision AS amount, CAST(o.user_id AS character varying(20)) AS who,
          created_at::timestamp(3) with time zone, 'paid' AS status, 1 AS one, 1.5 AS half, true AS ok,
          coalesce(u.email, 'none') AS email, CASE WHEN o.total > 0 THEN 'yes' END
        FROM orders AS o JOIN users AS u ON u.id = o.user_id
      `),
    ).toEqual([
      'id text',
      'amount double precision',
      'who character varying(20)',
      'created_at timestamp(3) with time zone',
      'status text',
      'one integer',
      'half numeric',
      'ok boolean',
      'email text',
      'case',
    ])
  })

  it('reads the joins in parentheses that pg_get_viewdef writes and their qualified columns', () => {
    const view = read(`
       SELECT u.id,
          u.email,
          count(o.id) AS orders
         FROM (shop.users u
           LEFT JOIN shop.orders o ON ((o.user_id = u.id)))
        GROUP BY u.id
    `)

    expect(view.columns).toEqual([
      { name: 'id', type: 'bigint' },
      { name: 'email', type: 'text' },
      { name: 'orders', type: 'bigint' },
    ])
    expect(view.dependencies).toEqual(['users', 'orders'])
  })

  it('expands * and t.* into the columns of the sources, integers for serials', () => {
    expect(columns('SELECT * FROM users')).toEqual(['id bigint', 'email text', 'created_at timestamp with time zone'])
    expect(columns('SELECT o.*, u.email FROM orders o JOIN users u USING (id)')).toEqual(['id integer', 'user_id bigint', 'total numeric(10, 2)', 'email text'])
    expect(columns('SELECT * FROM missing')).toEqual([])
  })

  it('reads the first select after WITH, DISTINCT ON and parentheses, up to a set operation', () => {
    expect(
      columns(`
        WITH recent AS (SELECT * FROM orders WHERE total > 0), big(id) AS MATERIALIZED (SELECT id FROM recent)
        (SELECT DISTINCT ON (r.user_id) r.user_id, r.total FROM recent r ORDER BY r.user_id)
        UNION ALL SELECT id, total FROM orders
      `),
    ).toEqual(['user_id', 'total'])
    expect(columns('SELECT DISTINCT email FROM users')).toEqual(['email text'])
  })

  it('reads what the query reads at any depth, without the queries of WITH and the functions of FROM', () => {
    const view = read(`
      WITH paid AS (SELECT * FROM payments)
      SELECT EXTRACT(year FROM o.created_at) AS year, (SELECT count(*) FROM refunds r WHERE r.order_id = o.id) AS refunds
      FROM orders o, paid p, generate_series(1, 3) AS g, LATERAL (SELECT 1 FROM coupons) c
      WHERE EXISTS (SELECT 1 FROM users WHERE users.id = o.user_id)
    `)

    expect(view.dependencies).toEqual(['payments', 'created_at', 'refunds', 'orders', 'coupons', 'users'])
    expect(view.columns.map((column) => column.name)).toEqual(['year', 'refunds'])
  })

  it('gives the columns of a relation for TABLE and none for VALUES', () => {
    expect(read('TABLE orders')).toEqual({ columns: RELATIONS.orders, dependencies: ['orders'] })
    expect(read("VALUES (1, 'a')")).toEqual({ columns: [], dependencies: [] })
  })

  it('does not take the end of an expression for an alias', () => {
    expect(columns('SELECT email IS NOT NULL, created_at AT TIME ZONE \'UTC\', email COLLATE "C", now() - interval \'1\' day FROM users')).toEqual([
      '?column?',
      '?column?',
      '?column?',
      '?column?',
    ])
  })
})
