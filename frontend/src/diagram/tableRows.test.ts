import { describe, expect, it } from 'vitest'
import { ICON_STEP, nameX, ROW_PADDING, tableRows, type RowField } from './tableRows.ts'

/** Each character is 10 pixels wide at size 10, so the expected positions are easy to count. */
const measure = (text: string, font: { fontSize?: unknown }) => text.length * Number(font.fontSize ?? 10)
/** Left edge of names in a table whose fields have one icon at most. */
const NAME_X = nameX(1)
const field = (text: string, reference: string | null = null, fontSize = 10): RowField => ({ text, font: { fontSize }, reference })

describe('rows of a table', () => {
  it('lines up the type, the nullability and the reference in columns as wide as their longest texts', () => {
    const [id, owner, title] = tableRows(
      [field('id uuid PK'), field('owner_id uuid NOT NULL', 'users.id'), field('title varchar(255)')],
      measure,
    )
    const typeX = NAME_X + 80 + 12
    const nullX = typeX + 120 + 12
    const extraX = nullX + 80 + 12
    expect(id!.columns).toEqual([
      { text: 'uuid', x: typeX },
      { text: 'NOT NULL', x: nullX },
    ])
    expect(owner!.columns).toEqual([
      { text: 'uuid', x: typeX },
      { text: 'NOT NULL', x: nullX },
      { text: '→ users.id', x: extraX },
    ])
    expect(title!.columns).toEqual([
      { text: 'varchar(255)', x: typeX },
      { text: 'NULL', x: nullX },
    ])
    expect(owner!.width).toBe(extraX + 100 + ROW_PADDING)
    expect(owner!.nameEnd).toBe(NAME_X + 80)
    expect(title!.width).toBe(nullX + 40 + ROW_PADDING)
  })

  it('marks a primary key with a key and a foreign key with a link', () => {
    const rows = tableRows(
      [field('id uuid PK'), field('user_id uuid PK', 'users.id'), field('team_id uuid FK'), field('board_id uuid', 'boards.id'), field('name text')],
      measure,
    )
    expect(rows.map((row) => row.icons)).toEqual([['key'], ['key'], ['link'], ['link'], []])
    expect(rows.every((row) => row.nameX === NAME_X)).toBe(true)
  })

  it('marks a unique field with a diamond after its key and makes room for two icons in the whole table', () => {
    const rows = tableRows([field('email text UNIQUE'), field('profile_id uuid UNIQUE', 'profiles.id'), field('name text')], measure)

    expect(rows.map((row) => row.icons)).toEqual([['unique'], ['link', 'unique'], []])
    expect(rows.map((row) => row.nameX)).toEqual([NAME_X + ICON_STEP, NAME_X + ICON_STEP, NAME_X + ICON_STEP])
    expect(rows[2]!.nameEnd).toBe(NAME_X + ICON_STEP + 100)
  })

  it('shows the rest of a field after its reference and leaves out an empty type', () => {
    const [row] = tableRows([field('created_at NOT NULL DEFAULT now()')], measure)
    expect(row!.columns).toEqual([
      { text: 'NOT NULL', x: NAME_X + 100 + 12 },
      { text: 'DEFAULT now()', x: NAME_X + 100 + 12 + 80 + 12 },
    ])
  })

  it('measures each text with the font of its field', () => {
    const [small, large] = tableRows([field('a int', null, 10), field('b int', null, 20)], measure)
    expect(small!.columns[0]!.x).toBe(NAME_X + 20 + 12)
    expect(large!.width).toBe(NAME_X + 20 + 12 + 60 + 12 + 80 + ROW_PADDING)
  })

  it('keeps a text that is not a field as it is', () => {
    expect(tableRows([field('')], measure)[0]).toEqual({ parts: null, icons: [], nameX: NAME_X, nameEnd: null, columns: [], width: 0 })
    expect(tableRows([field('(x)')], measure)[0]!.width).toBe(NAME_X + 30 + ROW_PADDING)
  })

  it('shows indexes after the fields: their names where the names of fields start, their columns lined up among them', () => {
    const [, , org, email, odd] = tableRows(
      [field('id uuid PK'), field('org_id uuid')],
      measure,
      [field('users_org_idx (org_id, created_at)'), field('email_key (lower(email)) UNIQUE USING btree'), field('broken')],
    )
    const nameEnd = NAME_X + 130
    const columnsX = nameEnd + 12
    const extraX = columnsX + 20 * 10 + 12
    expect(org).toMatchObject({ parts: null, icons: ['index'], nameX: NAME_X, nameEnd, columns: [{ text: '(org_id, created_at)', x: columnsX }] })
    expect(email).toMatchObject({
      icons: ['unique'],
      columns: [
        { text: '(lower(email))', x: columnsX },
        { text: 'UNIQUE USING btree', x: extraX },
      ],
      width: extraX + 180 + ROW_PADDING,
    })
    expect(odd).toEqual({ parts: null, icons: [], nameX: NAME_X, nameEnd: null, columns: [], width: NAME_X + 60 + ROW_PADDING })
  })

  it('marks the columns of indexes with the sign of an index after the other icons, but not those of expressions', () => {
    const rows = tableRows(
      [field('id uuid PK'), field('ORG_ID uuid UNIQUE'), field('email text'), field('name text')],
      measure,
      [field('a_idx (id, org_id DESC)'), field('b_idx (lower(email))')],
    )
    expect(rows.slice(0, 4).map((row) => row.icons)).toEqual([['key', 'index'], ['unique', 'index'], [], []])
    expect(rows[0]!.nameX).toBe(nameX(2))
  })
})
