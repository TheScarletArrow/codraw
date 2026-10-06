import { describe, expect, it } from 'vitest'
import {
  defaultIndexName,
  indexColumnNames,
  indexText,
  renameIndex,
  renameIndexColumn,
  splitIndex,
  writtenName,
} from './tableIndex.ts'

describe('parts of an index', () => {
  it('reads the name, the columns as written, UNIQUE, the method and the rest', () => {
    expect(splitIndex('users_email_key (lower(email)) UNIQUE USING btree WHERE email IS NOT NULL')).toEqual({
      name: 'users_email_key',
      nameText: 'users_email_key',
      columns: 'lower(email)',
      unique: true,
      method: 'btree',
      rest: 'WHERE email IS NOT NULL',
    })
    expect(splitIndex('"Tags Index" USING gin (tags) INCLUDE (id)')).toEqual({
      name: 'Tags Index',
      nameText: '"Tags Index"',
      columns: 'tags',
      unique: false,
      method: 'gin',
      rest: 'INCLUDE (id)',
    })
    expect(splitIndex('users_org_idx (org_id, created_at DESC)')).toMatchObject({ columns: 'org_id, created_at DESC', rest: '' })
  })

  it('is not an index without a name or columns', () => {
    expect(splitIndex('')).toBeNull()
    expect(splitIndex('(email)')).toBeNull()
    expect(splitIndex('users_email_idx')).toBeNull()
  })

  it('writes the name, the columns, UNIQUE, the method and the rest in this order', () => {
    expect(indexText(splitIndex('idx UNIQUE USING gin (tags) WHERE active')!)).toBe('idx (tags) UNIQUE USING gin WHERE active')
    expect(indexText(splitIndex('idx  (a,\n b)')!)).toBe('idx (a, b)')
  })
})

describe('renaming an index', () => {
  it('replaces the name and keeps the rest of the index', () => {
    expect(renameIndex('users_org_idx (org_id, created_at)', 'users_org_created_idx')).toBe('users_org_created_idx (org_id, created_at)')
    expect(renameIndex('idx (a) WHERE active', '"Index A"')).toBe('"Index A" (a) WHERE active')
  })

  it('takes more than a name as the whole index', () => {
    expect(renameIndex('', 'users_org_idx (org_id) WHERE active')).toBe('users_org_idx (org_id) WHERE active')
    expect(renameIndex('idx (a)', 'idx2 (b)')).toBe('idx2 (b)')
    expect(renameIndex('', 'users_email_idx')).toBe('users_email_idx')
  })

  it('keeps the index when nothing or the same name is typed', () => {
    expect(renameIndex('idx  (a)', ' ')).toBe('idx  (a)')
    expect(renameIndex('idx  (a)', 'idx')).toBe('idx  (a)')
  })
})

describe('columns of an index', () => {
  it('names the columns, not the expressions', () => {
    expect(indexColumnNames('org_id, created_at DESC NULLS LAST, lower(email), "Full Name" text_pattern_ops, (a + b)')).toEqual([
      'org_id',
      'created_at',
      'Full Name',
    ])
    expect(indexColumnNames('')).toEqual([])
  })

  it('renames a column in any case and keeps the expressions', () => {
    expect(renameIndexColumn('org_id, ORG_ID DESC, lower(org_id)', 'org_id', 'team_id')).toBe('team_id, team_id DESC, lower(org_id)')
    expect(renameIndexColumn('a,b', 'c', 'd')).toBe('a,b')
  })

  it('writes names as SQL does and names an index as PostgreSQL does', () => {
    expect(writtenName('email')).toBe('email')
    expect(writtenName('Full Name')).toBe('"Full Name"')
    expect(defaultIndexName('users', 'org_id, email', 'key')).toBe('users_org_id_email_key')
    expect(defaultIndexName('users', 'lower(email)', 'idx')).toBe('users_expr_idx')
  })
})
