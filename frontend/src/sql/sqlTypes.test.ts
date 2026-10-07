import { describe, expect, it } from 'vitest'
import { sameType, widensType } from './sqlTypes.ts'

describe('one type in other writings', () => {
  it('takes case, spaces and synonyms as the same type', () => {
    expect(sameType('VARCHAR(255)', 'varchar(255)')).toBe(true)
    expect(sameType('numeric(10, 2)', 'NUMERIC(10,2)')).toBe(true)
    expect(sameType('int', 'integer')).toBe(true)
    expect(sameType('int4', 'INTEGER')).toBe(true)
    expect(sameType('bool', 'boolean')).toBe(true)
    expect(sameType('timestamptz', 'timestamp with time zone')).toBe(true)
    expect(sameType('character varying(20)', 'varchar(20)')).toBe(true)
    expect(sameType('decimal(12,2)', 'numeric(12,2)')).toBe(true)
    expect(sameType('float8', 'double precision')).toBe(true)
    // The display width of an integer of MySQL is not a type of its own.
    expect(sameType('int(11)', 'int')).toBe(true)
  })

  it('tells other types and lengths apart', () => {
    expect(sameType('varchar(100)', 'varchar(255)')).toBe(false)
    expect(sameType('varchar', 'varchar(255)')).toBe(false)
    expect(sameType('text', 'integer')).toBe(false)
    expect(sameType('timestamp', 'timestamptz')).toBe(false)
    // Int8 of ClickHouse is a byte, int8 of PostgreSQL is bigint.
    expect(sameType('Int8', 'int8')).toBe(false)
  })
})

describe('changes of type that keep every value', () => {
  it('widens texts to longer ones and to texts without a limit', () => {
    expect(widensType('varchar(100)', 'varchar(255)')).toBe(true)
    expect(widensType('varchar(100)', 'text')).toBe(true)
    expect(widensType('varchar(100)', 'varchar')).toBe(true)
    expect(widensType('char(10)', 'varchar(10)')).toBe(true)
    expect(widensType('nvarchar(255)', 'nvarchar(max)')).toBe(true)
    expect(widensType('VARCHAR2(100)', 'CLOB')).toBe(true)
    expect(widensType('text', 'mediumtext')).toBe(true)
    expect(widensType('String', 'Nullable(String)')).toBe(true)
  })

  it('widens integers and floating-point numbers to larger ones, and integers to decimals that hold them', () => {
    expect(widensType('smallint', 'integer')).toBe(true)
    expect(widensType('integer', 'bigint')).toBe(true)
    expect(widensType('serial', 'bigint')).toBe(true)
    expect(widensType('real', 'double precision')).toBe(true)
    expect(widensType('Int32', 'Int64')).toBe(true)
    expect(widensType('UInt32', 'Int64')).toBe(true)
    expect(widensType('integer', 'numeric(12,0)')).toBe(true)
    expect(widensType('integer', 'numeric')).toBe(true)
  })

  it('widens decimals and precisions to more digits', () => {
    expect(widensType('numeric(10,2)', 'numeric(12,2)')).toBe(true)
    expect(widensType('numeric(10,2)', 'numeric(12,4)')).toBe(true)
    expect(widensType('NUMBER(10)', 'NUMBER(19)')).toBe(true)
    expect(widensType('numeric(10,2)', 'numeric')).toBe(true)
    expect(widensType('timestamp(3)', 'timestamp(6)')).toBe(true)
  })

  it('narrows anything else: shorter, smaller, fewer digits, another kind or a fixed length', () => {
    expect(widensType('varchar(255)', 'varchar(100)')).toBe(false)
    expect(widensType('text', 'varchar(255)')).toBe(false)
    expect(widensType('varchar(10)', 'char(10)')).toBe(false)
    expect(widensType('bigint', 'integer')).toBe(false)
    expect(widensType('Int64', 'UInt64')).toBe(false)
    expect(widensType('double precision', 'real')).toBe(false)
    expect(widensType('numeric(12,2)', 'numeric(12,4)')).toBe(false)
    expect(widensType('numeric', 'numeric(10,2)')).toBe(false)
    expect(widensType('bigint', 'numeric(10,0)')).toBe(false)
    expect(widensType('text', 'integer')).toBe(false)
    expect(widensType('timestamptz', 'date')).toBe(false)
    expect(widensType('Nullable(String)', 'String')).toBe(false)
  })
})
