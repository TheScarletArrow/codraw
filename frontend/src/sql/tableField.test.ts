import { describe, expect, it } from 'vitest'
import { fieldText, normalizeField, renameField, splitField } from './tableField.ts'

describe('parts of a field', () => {
  it('reads the name, the type as written, the keys and the rest', () => {
    expect(splitField('owner_id uuid FK NOT NULL')).toEqual({
      name: 'owner_id',
      nameText: 'owner_id',
      type: 'uuid',
      primaryKey: false,
      foreignKey: true,
      notNull: true,
      unique: false,
      rest: '',
    })
    expect(splitField('created_at timestamp with time zone NOT NULL DEFAULT now()')).toMatchObject({
      type: 'timestamp with time zone',
      notNull: true,
      rest: 'DEFAULT now()',
    })
    expect(splitField('price NUMBER(10, 2) CHECK (price > 0) UNIQUE')).toMatchObject({
      type: 'NUMBER(10, 2)',
      unique: true,
      rest: 'CHECK (price > 0)',
    })
    expect(splitField('"Full Name" VARCHAR2(255)')).toMatchObject({ name: 'Full Name', nameText: '"Full Name"', type: 'VARCHAR2(255)' })
    expect(splitField('id uuid PRIMARY KEY')).toMatchObject({ primaryKey: true, notNull: true })
    expect(splitField('<b>title</b>')).toMatchObject({ name: 'title', type: '', rest: '' })
    expect(splitField('   ')).toBeNull()
    expect(splitField('(x)')).toBeNull()
  })

  it('tells a bare NULL from NULL of the rest and keys inside parentheses from keys of the field', () => {
    expect(splitField('archived_at timestamptz NULL')).toMatchObject({ notNull: false, rest: '' })
    expect(splitField('note text DEFAULT NULL')).toMatchObject({ notNull: false, rest: 'DEFAULT NULL' })
    expect(splitField('a int CHECK (a IS NOT NULL)')).toMatchObject({ notNull: false, rest: 'CHECK (a IS NOT NULL)' })
    expect(splitField('user_id int REFERENCES users (id) ON DELETE SET NULL NOT NULL')).toMatchObject({
      foreignKey: true,
      notNull: true,
      rest: 'REFERENCES users (id) ON DELETE SET NULL',
    })
  })

  it('writes the parts back in the order of the import', () => {
    const field = splitField('created_at timestamp DEFAULT now() NOT NULL')!
    expect(fieldText(field)).toBe('created_at timestamp NOT NULL DEFAULT now()')
    expect(fieldText({ ...field, type: 'timestamptz', notNull: false })).toBe('created_at timestamptz DEFAULT now()')
    expect(fieldText({ ...splitField('id uuid')!, primaryKey: true, notNull: true })).toBe('id uuid PK')
    expect(fieldText(splitField('owner_id uuid FK UNIQUE')!)).toBe('owner_id uuid FK UNIQUE')
    expect(fieldText(splitField('owner_id uuid REFERENCES users')!)).toBe('owner_id uuid REFERENCES users')
  })
})

describe('renaming a field', () => {
  it('replaces the name and keeps the type, the keys and the rest', () => {
    expect(renameField('mail text NOT NULL DEFAULT \'\'', 'email')).toBe("email text NOT NULL DEFAULT ''")
    expect(renameField('id uuid PK', '"User Id"')).toBe('"User Id" uuid PK')
  })

  it('takes more than a name as the whole field, written as CoDraw writes fields', () => {
    expect(renameField('', 'email text NOT NULL')).toBe('email text NOT NULL')
    expect(renameField('mail text', 'email varchar(255)')).toBe('email varchar(255)')
    expect(renameField('', 'id uuid not null')).toBe('id uuid NOT NULL')
  })

  it('writes a typed field with its keys and the SQL words of its rest in upper case', () => {
    expect(normalizeField('id bigserial primary key')).toBe('id bigserial PK')
    expect(normalizeField('created_at timestamptz not null default now()')).toBe('created_at timestamptz NOT NULL DEFAULT now()')
    expect(normalizeField("email varchar(255) unique not null default ''")).toBe("email varchar(255) NOT NULL UNIQUE DEFAULT ''")
    expect(normalizeField('owner_id uuid references users(id) on delete cascade')).toBe(
      'owner_id uuid REFERENCES users(id) ON DELETE CASCADE',
    )
    expect(normalizeField("state text default 'set null' check (state in ('on', 'off'))")).toBe(
      "state text DEFAULT 'set null' CHECK (state in ('on', 'off'))",
    )
    expect(normalizeField('"User Id" UUID null')).toBe('"User Id" UUID')
    expect(normalizeField('  ')).toBeNull()
  })

  it('keeps the field when nothing or the same name is typed', () => {
    expect(renameField('id uuid PK', '  ')).toBe('id uuid PK')
    expect(renameField('id  uuid  PRIMARY KEY', 'id')).toBe('id  uuid  PRIMARY KEY')
    expect(renameField('', 'email')).toBe('email')
  })
})
