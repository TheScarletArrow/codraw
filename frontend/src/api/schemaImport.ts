import { HttpError, request } from './http.ts'

/** How the connection to the database uses SSL, as `sslmode` of libpq. */
export type SslMode = 'disable' | 'prefer' | 'require' | 'verify-full'

/** Where and as whom the server reads the schema of a PostgreSQL database. */
export interface DatabaseConnection {
  host: string
  port: number
  database: string
  user: string
  password: string
  schema: string
  sslMode: SslMode
}

/**
 * Whether this user may read schemas of databases through the server: the administrator allowed hosts of databases,
 * and the user signed in through GitHub or Google, not as a guest.
 */
export type SchemaImportAvailability = { kind: 'available'; maxTables: number } | { kind: 'sign-in' } | { kind: 'off' }

export async function fetchSchemaImport(): Promise<SchemaImportAvailability> {
  try {
    const { maxTables } = await request<{ maxTables: number }>('/api/schema-import')
    return { kind: 'available', maxTables }
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return { kind: 'off' }
    if (error instanceof HttpError && error.problem?.reason === 'sign-in-required') return { kind: 'sign-in' }
    throw error
  }
}

/** The schema as DDL of PostgreSQL, and the number of its tables. */
export interface ImportedSchema {
  ddl: string
  tables: number
}

/** Reads the schema; the server keeps nothing of the connection. */
export function importSchema(connection: DatabaseConnection): Promise<ImportedSchema> {
  return request('/api/schema-import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(connection),
  })
}
