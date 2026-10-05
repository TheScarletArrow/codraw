/** Style key of a table that names its database, e.g. `dbVendor=postgresql`. */
export const VENDOR_KEY = 'dbVendor'

export type DbVendorId = 'postgresql' | 'mysql' | 'oracle' | 'sqlserver' | 'sqlite' | 'clickhouse'

export interface DbVendor {
  id: DbVendorId
  label: string
  /** Short name on the badge in the header of a table. */
  badge: string
  /** Colors of the badge. */
  color: string
  textColor: string
  /** Types that the type list of a field offers, the usual ones first. */
  types: string[]
}

export const DB_VENDORS: readonly DbVendor[] = [
  {
    id: 'postgresql',
    label: 'PostgreSQL',
    badge: 'PG',
    color: '#336791',
    textColor: '#ffffff',
    types: [
      'uuid',
      'text',
      'varchar(255)',
      'integer',
      'bigint',
      'smallint',
      'serial',
      'bigserial',
      'numeric(10,2)',
      'real',
      'double precision',
      'boolean',
      'date',
      'time',
      'timestamp',
      'timestamptz',
      'interval',
      'jsonb',
      'json',
      'bytea',
      'inet',
      'text[]',
    ],
  },
  {
    id: 'mysql',
    label: 'MySQL / MariaDB',
    badge: 'MY',
    color: '#00758F',
    textColor: '#ffffff',
    types: [
      'int',
      'bigint',
      'smallint',
      'tinyint(1)',
      'decimal(10,2)',
      'float',
      'double',
      'varchar(255)',
      'char(36)',
      'text',
      'longtext',
      'boolean',
      'date',
      'datetime',
      'timestamp',
      'time',
      'json',
      'blob',
      'binary(16)',
    ],
  },
  {
    id: 'oracle',
    label: 'Oracle',
    badge: 'ORA',
    color: '#C74634',
    textColor: '#ffffff',
    types: [
      'NUMBER',
      'NUMBER(10)',
      'NUMBER(19)',
      'NUMBER(10,2)',
      'VARCHAR2(255)',
      'NVARCHAR2(255)',
      'CHAR(1)',
      'CLOB',
      'NCLOB',
      'BLOB',
      'DATE',
      'TIMESTAMP',
      'TIMESTAMP WITH TIME ZONE',
      'RAW(16)',
      'BINARY_DOUBLE',
      'FLOAT',
    ],
  },
  {
    id: 'sqlserver',
    label: 'SQL Server',
    badge: 'MS',
    color: '#A91D22',
    textColor: '#ffffff',
    types: [
      'int',
      'bigint',
      'smallint',
      'tinyint',
      'bit',
      'decimal(10,2)',
      'money',
      'float',
      'nvarchar(255)',
      'nvarchar(max)',
      'varchar(255)',
      'char(1)',
      'date',
      'datetime2',
      'datetimeoffset',
      'time',
      'uniqueidentifier',
      'varbinary(max)',
    ],
  },
  {
    id: 'sqlite',
    label: 'SQLite',
    badge: 'LITE',
    color: '#0F80CC',
    textColor: '#ffffff',
    types: ['INTEGER', 'TEXT', 'REAL', 'BLOB', 'NUMERIC'],
  },
  {
    id: 'clickhouse',
    label: 'ClickHouse',
    badge: 'CH',
    color: '#FAFF69',
    textColor: '#000000',
    types: [
      'UInt8',
      'UInt32',
      'UInt64',
      'Int32',
      'Int64',
      'Float64',
      'Decimal(18,2)',
      'String',
      'FixedString(16)',
      'UUID',
      'Bool',
      'Date',
      'DateTime',
      'DateTime64(3)',
      'LowCardinality(String)',
      'Nullable(String)',
      'Array(String)',
      'JSON',
    ],
  },
]

/** The database of a table from its style; `null` for a table without one or with one CoDraw does not know. */
export function vendorOf(style: object): DbVendor | null {
  return DB_VENDORS.find((vendor) => vendor.id === (style as Record<string, unknown>)[VENDOR_KEY]) ?? null
}

/** Types that the type list of a field of a table of this database offers; those of PostgreSQL without one. */
export function vendorTypes(vendor: DbVendor | null): string[] {
  return (vendor ?? DB_VENDORS[0]!).types
}
