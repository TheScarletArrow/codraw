import { describe, expect, it } from 'vitest'
import { DB_VENDORS, vendorOf, vendorTypes } from './dbVendors.ts'
import { splitField } from './tableField.ts'

describe('databases of tables', () => {
  it('reads the database from the style of a table', () => {
    expect(vendorOf({ dbVendor: 'oracle' })?.badge).toBe('ORA')
    expect(vendorOf({})).toBeNull()
    expect(vendorOf({ dbVendor: 'db2' })).toBeNull()
  })

  it('offers the types of the database, and those of PostgreSQL for a table without one', () => {
    expect(vendorTypes(vendorOf({ dbVendor: 'oracle' }))).toContain('VARCHAR2(255)')
    expect(vendorTypes(null)).toContain('timestamptz')
  })

  it('has types that a field reads back as its type', () => {
    for (const vendor of DB_VENDORS) {
      for (const type of vendor.types) expect(splitField(`f ${type} NOT NULL`)?.type).toBe(type)
    }
  })
})
