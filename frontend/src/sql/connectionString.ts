import type { SslMode } from '../api/schemaImport.ts'

/** What a connection string says of a connection; what it does not say is left out. */
export interface ConnectionParts {
  host?: string
  port?: number
  database?: string
  user?: string
  password?: string
  schema?: string
  sslMode?: SslMode
}

/** `sslmode` of libpq and PgJDBC as CoDraw connects: `allow` as `prefer`, `verify-ca` checks the host too. */
const SSL_MODES: Record<string, SslMode> = {
  disable: 'disable',
  allow: 'prefer',
  prefer: 'prefer',
  require: 'require',
  'verify-ca': 'verify-full',
  'verify-full': 'verify-full',
}

const URI = /^(?:jdbc:)?postgres(?:ql)?:\/\/([^/?#]*)(?:\/([^?#]*))?(?:\?([^#]*))?(?:#.*)?$/i

/** Percent-decoding that leaves broken escapes as they are. */
function decode(text: string): string {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

/** The first host of a list, e.g. `db1:5432,db2:5432`, and its port: `[::1]:5433`, `db`, `db:6432`. */
function firstHost(hosts: string): Pick<ConnectionParts, 'host' | 'port'> {
  const first = hosts.split(',')[0]!.trim()
  const match = /^(\[[^\]]*\]|[^:]*)(?::(\d+))?$/.exec(first)
  if (!match) return {}
  const host = decode(match[1]!).replace(/^\[(.*)\]$/, '$1')
  return { ...(host && { host }), ...(match[2] && { port: Number(match[2]) }) }
}

/** The parts that the parameters of a connection string give, whatever spelling of the key; other parameters are dropped. */
function parameters(entries: [string, string][]): ConnectionParts {
  const parts: ConnectionParts = {}
  let ssl = false
  for (const [key, value] of entries) {
    switch (key.toLowerCase()) {
      case 'user':
        parts.user = value
        break
      case 'password':
        parts.password = value
        break
      case 'dbname':
        parts.database = value
        break
      case 'host':
        // The first of the hosts; a port is the keyword `port`, so an address of IPv6 stays whole.
        if (value.split(',')[0]!.trim()) parts.host = value.split(',')[0]!.trim()
        break
      case 'port':
        if (/^\d+$/.test(value)) parts.port = Number(value)
        break
      case 'sslmode':
        if (SSL_MODES[value.toLowerCase()]) parts.sslMode = SSL_MODES[value.toLowerCase()]
        break
      case 'ssl':
        ssl = value === '' || value.toLowerCase() === 'true'
        break
      case 'currentschema':
        // The first schema of the path of PgJDBC.
        if (value.split(',')[0]!.trim()) parts.schema = value.split(',')[0]!.trim()
        break
    }
  }
  if (ssl && !parts.sslMode) parts.sslMode = 'require'
  return parts
}

/** `host=db port=5432 dbname='my db' user=reader`: keywords of libpq, values perhaps in single quotes. */
function keywordValues(text: string): ConnectionParts | null {
  const pattern = /\s*([A-Za-z_]+)\s*=\s*(?:'((?:[^'\\]|\\.)*)'|(\S*))/y
  const entries: [string, string][] = []
  let end = 0
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    entries.push([match[1]!, match[2] !== undefined ? match[2].replace(/\\(.)/g, '$1') : match[3]!])
    end = pattern.lastIndex
    if (end === text.length) break
  }
  if (entries.length === 0 || text.slice(end).trim() !== '') return null
  const parts = parameters(entries)
  return parts.host || parts.database ? parts : null
}

/**
 * The parts of a connection string of PostgreSQL: `jdbc:postgresql://host:port/database?user=…&password=…`,
 * `postgresql://user:password@host:port/database?sslmode=…` (`postgres://` too) or keywords of libpq
 * (`host=… port=… dbname=… user=…`). Only the host, the port, the database, the user, the password, `sslmode` (and
 * `ssl=true`) and `currentSchema` are taken, so that nothing else a string holds reaches the server; `null` for text
 * that is not a connection string.
 */
export function parseConnectionString(text: string): ConnectionParts | null {
  const trimmed = text.trim()
  const uri = URI.exec(trimmed)
  if (!uri) return keywordValues(trimmed)
  const [, authority, path, query] = uri
  // A password may hold `@` unencoded: the hosts follow the last one.
  const at = authority!.lastIndexOf('@')
  const userInfo = at === -1 ? undefined : authority!.slice(0, at)
  const parts: ConnectionParts = { ...firstHost(authority!.slice(at + 1)) }
  if (path) parts.database = decode(path)
  if (userInfo !== undefined) {
    const colon = userInfo.indexOf(':')
    const user = decode(colon === -1 ? userInfo : userInfo.slice(0, colon))
    if (user) parts.user = user
    if (colon !== -1) parts.password = decode(userInfo.slice(colon + 1))
  }
  const entries = (query ?? '')
    .split('&')
    .filter(Boolean)
    .map((entry): [string, string] => {
      const equals = entry.indexOf('=')
      return equals === -1 ? [decode(entry), ''] : [decode(entry.slice(0, equals)), decode(entry.slice(equals + 1).replace(/\+/g, ' '))]
    })
  return { ...parts, ...parameters(entries) }
}
