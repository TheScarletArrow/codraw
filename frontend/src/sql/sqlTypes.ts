/**
 * Types of columns as fields of tables write them, compared: whether two writings are one type, and whether a change of
 * type keeps every value (widens) or may lose or reject some, so that a migration warns of it.
 */

/** A type taken apart: its name with synonyms brought to one, and the numbers in its parentheses. */
interface TypeParts {
  name: string
  /** Lengths, precision and scale; `Infinity` for `max`. Empty without parentheses. */
  args: number[]
}

/** Names that mean the same type, as PostgreSQL, MySQL, Oracle and SQL Server write them. */
const SYNONYMS: Record<string, string> = {
  int: 'integer',
  int4: 'integer',
  int2: 'smallint',
  int8: 'bigint',
  serial4: 'serial',
  serial2: 'smallserial',
  serial8: 'bigserial',
  bool: 'boolean',
  float4: 'real',
  float8: 'double precision',
  double: 'double precision',
  'character varying': 'varchar',
  character: 'char',
  'national character varying': 'nvarchar',
  'national character': 'nchar',
  decimal: 'numeric',
  dec: 'numeric',
  number: 'numeric',
  timestamptz: 'timestamp with time zone',
  'timestamp without time zone': 'timestamp',
  timetz: 'time with time zone',
  'time without time zone': 'time',
  varbit: 'bit varying',
}

/** Integers by their size in bytes. */
const INTEGERS: Record<string, number> = {
  tinyint: 1,
  smallint: 2,
  smallserial: 2,
  mediumint: 3,
  integer: 4,
  serial: 4,
  bigint: 8,
  bigserial: 8,
}

/** Decimal digits that an integer of this size in bytes holds, for a change to `numeric(p, s)`. */
const INTEGER_DIGITS: Record<number, number> = { 1: 3, 2: 5, 3: 8, 4: 10, 8: 19 }

/** Floating-point types by their size in bytes. */
const FLOATS: Record<string, number> = {
  real: 4,
  binary_float: 4,
  float32: 4,
  'double precision': 8,
  binary_double: 8,
  float64: 8,
}

/** Types of text by how many characters they hold; those with a length in parentheses hold that many. */
const TEXTS: Record<string, number> = {
  char: 1,
  nchar: 1,
  varchar: Infinity,
  nvarchar: 1,
  varchar2: 1,
  nvarchar2: 1,
  tinytext: 255,
  text: 65_535,
  mediumtext: 16_777_215,
  longtext: Infinity,
  clob: Infinity,
  nclob: Infinity,
  citext: Infinity,
  string: Infinity,
}

/** Integers of ClickHouse, whose names in another case are other types (`Int8` is a byte, `int8` of PostgreSQL is not). */
const CLICKHOUSE_INTEGER = /^(U?)Int(\d+)$/

const normalize = (type: string) =>
  type
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*\(\s*/g, '(')
    .replace(/\s*\)/g, ')')
    .replace(/\s*,\s*/g, ',')

function parts(type: string): TypeParts {
  const text = normalize(type)
  if (CLICKHOUSE_INTEGER.test(text)) return { name: text, args: [] }
  const group = /^([^()]*)\(([^()]*)\)([^()]*)$/.exec(text)
  const args = group?.[2]!.split(',')
  if (group && args!.every((arg) => /^\d+$/.test(arg) || arg.toLowerCase() === 'max')) {
    const name = `${group[1]!}${group[3]!}`.trim().toLowerCase()
    return { name: SYNONYMS[name] ?? name, args: args!.map((arg) => (arg.toLowerCase() === 'max' ? Infinity : Number(arg))) }
  }
  const name = text.toLowerCase()
  return { name: SYNONYMS[name] ?? name, args: [] }
}

/** The type as one string to compare: the display width of an integer of MySQL (`int(11)`) is not a type of its own. */
function key({ name, args }: TypeParts): string {
  return name in INTEGERS || args.length === 0 ? name : `${name}(${args.join(',')})`
}

/** Whether two writings are one type: in any case, with any spaces and with synonyms, e.g. `INT` and `integer`. */
export function sameType(a: string, b: string): boolean {
  return key(parts(a)) === key(parts(b))
}

/** How many characters a type of text holds, or `null` for a type that is not text. */
function textLength({ name, args }: TypeParts): number | null {
  if (!(name in TEXTS)) return null
  return args.length > 0 ? args[0]! : TEXTS[name]!
}

/** The digits before and after the point of `numeric(p, s)`; `null` for `numeric` without precision, which has any. */
function decimalDigits({ args }: TypeParts): { whole: number; fraction: number } | null {
  if (args.length === 0) return null
  const [precision, scale = 0] = args
  return { whole: precision! - scale, fraction: scale }
}

/**
 * Whether changing a column from type `from` to type `to` keeps every value: a longer text or one without a limit, a
 * larger integer or floating-point type, more digits of a decimal, a larger precision of the same type, or a value made
 * nullable in ClickHouse. Any other change, e.g. `text` to `integer`, may reject or cut values.
 */
export function widensType(from: string, to: string): boolean {
  const [a, b] = [parts(from), parts(to)]
  if (key(a) === key(b)) return true
  if (b.name === `nullable(${normalize(from).toLowerCase()})`) return true

  const [chA, chB] = [CLICKHOUSE_INTEGER.exec(a.name), CLICKHOUSE_INTEGER.exec(b.name)]
  if (chA && chB) {
    const [unsignedA, bitsA, unsignedB, bitsB] = [chA[1] === 'U', Number(chA[2]), chB[1] === 'U', Number(chB[2])]
    return unsignedA === unsignedB ? bitsB >= bitsA : unsignedA && bitsB > bitsA
  }
  if (a.name in INTEGERS && b.name in INTEGERS) return INTEGERS[b.name]! >= INTEGERS[a.name]!
  if (a.name in INTEGERS && b.name === 'numeric') {
    const digits = decimalDigits(b)
    return digits === null || digits.whole >= INTEGER_DIGITS[INTEGERS[a.name]!]!
  }
  if (a.name in FLOATS && b.name in FLOATS) return FLOATS[b.name]! >= FLOATS[a.name]!

  const [lengthA, lengthB] = [textLength(a), textLength(b)]
  if (lengthA !== null && lengthB !== null) {
    // A fixed length pads values with spaces: only a fixed type of the same kind keeps them as they were.
    const fixed = (name: string) => name === 'char' || name === 'nchar'
    if (fixed(b.name) && a.name !== b.name) return false
    return lengthB >= lengthA
  }

  if (a.name === 'numeric' && b.name === 'numeric') {
    const [digitsA, digitsB] = [decimalDigits(a), decimalDigits(b)]
    if (digitsB === null) return true
    return digitsA !== null && digitsB.whole >= digitsA.whole && digitsB.fraction >= digitsA.fraction
  }
  // The same type with larger numbers in parentheses, e.g. `timestamp(3)` to `timestamp(6)`.
  return a.name === b.name && a.args.length === b.args.length && a.args.every((arg, index) => b.args[index]! >= arg)
}
