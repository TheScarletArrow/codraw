import type { Token } from './parseSql.ts'

/**
 * First words of statements that describe no table: settings of the session and of the client, transactions and locks,
 * rights, comments, upkeep and data.
 */
const SERVICE_WORDS = new Set([
  'SET',
  'RESET',
  'USE',
  'BEGIN',
  'START',
  'COMMIT',
  'ROLLBACK',
  'END',
  'SAVEPOINT',
  'RELEASE',
  'LOCK',
  'UNLOCK',
  'GRANT',
  'REVOKE',
  'COMMENT',
  'ANALYZE',
  'VACUUM',
  'CHECKPOINT',
  'DISCARD',
  'INSERT',
  'COPY',
  'UPDATE',
  'DELETE',
  'REPLACE',
  'TRUNCATE',
])

/** Objects whose `CREATE` and `ALTER` describe no table: schemas, databases, extensions, sequences and roles. */
const SERVICE_OBJECTS = new Set(['SCHEMA', 'DATABASE', 'EXTENSION', 'SEQUENCE', 'ROLE', 'USER', 'GROUP'])

/** Functions that dumps call to set up the session or sequences: `SELECT pg_catalog.set_config(…)`, `setval(…)`. */
const SERVICE_FUNCTIONS = new Set(['SET_CONFIG', 'SETVAL'])

const isWord = (token: Token | undefined, ...values: string[]) => token?.kind === 'word' && values.includes(token.value)

/**
 * Whether a statement is one that dumps and migrations are full of but that describes no table, so that it is not
 * counted as skipped: `SET`, `SELECT pg_catalog.set_config(…)`, transactions and locks, `… OWNER TO …`, `GRANT`,
 * `REVOKE`, `ALTER DEFAULT PRIVILEGES`, `COMMENT ON`, schemas, databases, extensions, sequences and roles, dropping
 * objects other than tables and indexes, and data (`INSERT`, `COPY`, `UPDATE`, `DELETE`, `REPLACE`, `TRUNCATE`).
 */
export function isServiceStatement(tokens: Token[]): boolean {
  const [first, second, third] = tokens
  if (first?.kind !== 'word') return false
  if (SERVICE_WORDS.has(first.value)) return true
  // `ALTER TABLE users OWNER TO app`, `ALTER VIEW … OWNER TO …`: the owner of anything.
  if (isWord(tokens.at(-3), 'OWNER') && isWord(tokens.at(-2), 'TO')) return true
  if (first.value === 'SELECT') {
    // Other queries are not expected in DDL and count as skipped.
    // The function, perhaps qualified: `pg_catalog.set_config(`.
    const name = tokens[2]?.kind === 'symbol' && tokens[2].value === '.' ? tokens[3] : second
    return name?.kind === 'word' && SERVICE_FUNCTIONS.has(name.value)
  }
  if (first.value === 'CREATE') {
    const object = isWord(second, 'OR') && isWord(third, 'REPLACE') ? tokens[3] : second
    return isWord(object, ...SERVICE_OBJECTS)
  }
  if (first.value === 'ALTER') return isWord(second, ...SERVICE_OBJECTS) || (isWord(second, 'DEFAULT') && isWord(third, 'PRIVILEGES'))
  // Dropping a view, a function or a trigger changes no table; dropping a table or an index does.
  if (first.value === 'DROP') return second?.kind === 'word' && second.value !== 'TABLE' && second.value !== 'INDEX'
  return false
}
