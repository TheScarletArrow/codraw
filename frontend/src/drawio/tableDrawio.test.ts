import { describe, expect, it } from 'vitest'
import { isTableIndexStyle, isTableStyle, TABLE_FIELD_HEIGHT, TABLE_HEADER_HEIGHT } from '../diagram/shapes.ts'
import { tableCommentOf } from '../diagram/tableComments.ts'
import { splitField } from '../sql/tableField.ts'
import { parseDrawio, type DrawioCell } from './parse.ts'

const ROW = 'shape=tableRow;horizontal=0;startSize=0;swimlaneHead=0;swimlaneBody=0;fillColor=#FFFFFF;collapsible=0;dropTarget=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;top=0;left=0;right=0;bottom=1;'
const PART = 'shape=partialRectangle;connectable=0;fillColor=none;top=0;left=0;bottom=0;right=0;overflow=hidden;whiteSpace=wrap;html=1;fontFamily=Arial;'

const part = (id: string, parent: string, value: string, x: number, width: number) =>
  `<mxCell id="${id}" value="${value}" vertex="1" parent="${parent}" style="${PART}"><mxGeometry as="geometry" x="${x}" y="0" width="${width}" height="30" /></mxCell>`

/** A row of a table as an ER diagram drawn for draw.io has it: the marker, the name, the type with its note. */
const row = (table: string, id: string, y: number, marker: string, name: string, type: string) =>
  `<mxCell id="${id}" value="" vertex="1" parent="${table}" style="${ROW}"><mxGeometry as="geometry" x="0" y="${y}" width="620" height="30" /></mxCell>` +
  part(`${id}_0`, id, marker, 0, 66) +
  part(`${id}_1`, id, name, 66, 242) +
  part(`${id}_2`, id, type, 308, 312)

const table = (id: string, value: string, x: number, rows: string) =>
  `<mxCell id="${id}" value="${value}" vertex="1" parent="1" style="shape=table;startSize=68;container=1;collapsible=0;childLayout=tableLayout;fixedRows=1;rowLines=0;fontStyle=1;align=center;verticalAlign=middle;resizeLast=1;html=1;whiteSpace=wrap;fillColor=#DBEAFE;strokeColor=#60A5FA;fontSize=18;fontFamily=Arial;"><mxGeometry as="geometry" x="${x}" y="140" width="620" height="400" /></mxCell>` +
  rows

const edge = (id: string, source: string, target: string) =>
  `<mxCell id="${id}" value="" edge="1" parent="1" source="${source}" target="${target}" style="edgeStyle=orthogonalEdgeStyle;endArrow=ERmandOne;startArrow=ERzeroToMany;"><mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="710" y="283" /></Array></mxGeometry></mxCell>`

const file = (cells: string) =>
  `<mxfile host="app.diagrams.net"><diagram id="er" name="ER"><mxGraphModel><root><mxCell id="0" /><mxCell id="1" parent="0" />${cells}</root></mxGraphModel></diagram></mxfile>`

/** A part of egrul-radar-er.drawio: two tables, keys, indexes, a numbered unique key and edges between rows. */
const ER = file(
  table(
    't_organization',
    'organization&lt;br&gt;&lt;span style=&quot;font-weight:normal;font-size:12px;&quot;&gt;ЮЛ / ИП · одна строка на ОГРН&lt;/span&gt;',
    40,
    row('t_organization', 'r_id', 68, 'PK', 'id', 'uuid') +
      row('t_organization', 'r_ogrn', 98, 'UQ', 'ogrn', 'varchar(15) · ОГРН / ОГРНИП') +
      row('t_organization', 'r_inn', 128, 'IDX', 'inn', 'varchar(12)') +
      row('t_organization', 'r_kpp', 158, '', 'kpp', "varchar(9) · NULL у ИП, it's empty") +
      row('t_organization', 'r_load_file_id', 188, 'FK', 'load_file_id', 'uuid'),
  ) +
    table(
      't_load_file',
      'load_file',
      800,
      row('t_load_file', 'f_id', 68, 'PK', 'id', 'uuid') +
        row('t_load_file', 'f_path', 98, 'UQ¹', 'archive_path', 'varchar(512)') +
        row('t_load_file', 'f_name', 128, 'UQ¹', 'file_name', 'varchar(128)') +
        row('t_load_file', 'f_ref', 158, 'REF*', 'snapshot_id', 'uuid · стабильная ссылка'),
    ) +
    edge('e_source', 'r_load_file_id', 'f_id') +
    edge('e_part', 'r_load_file_id_1', 'f_id_1'),
)

const byId = (cells: DrawioCell[]) => new Map(cells.map((cell) => [cell.id, cell]))
const childrenOf = (cells: DrawioCell[], parent: string) =>
  cells.filter((cell) => cell.parent === parent).sort((a, b) => (a.order < b.order ? -1 : 1))

describe('tables of draw.io', () => {
  it('become tables of CoDraw with the name in the header and the second line of the label as the comment', async () => {
    const [page] = await parseDrawio(ER)
    const organization = byId(page!.cells).get('t_organization')!
    expect(isTableStyle(organization.style)).toBe(true)
    expect(organization.value).toBe('organization')
    expect(tableCommentOf(organization.style)).toBe('ЮЛ / ИП · одна строка на ОГРН')
    // The look of the file stays; the rows painted the body of the table.
    expect(organization.style).toMatchObject({ codrawShape: 'table', fillColor: '#DBEAFE', strokeColor: '#60A5FA', swimlaneFillColor: '#FFFFFF' })
    expect(organization.style).not.toHaveProperty('shape', 'table')
    expect(organization.geometry).toMatchObject({ x: 40, y: 140, width: 620 })
  })

  it('makes a field of each row with its keys, type and note, and indexes of the markers of indexes', async () => {
    const [page] = await parseDrawio(ER)
    const rows = childrenOf(page!.cells, 't_organization')
    expect(rows.map((cell) => cell.value)).toEqual([
      'id uuid PK',
      "ogrn varchar(15) UNIQUE COMMENT 'ОГРН / ОГРНИП'",
      'inn varchar(12)',
      "kpp varchar(9) COMMENT 'NULL у ИП, it''s empty'",
      'load_file_id uuid FK',
      'organization_inn_idx (inn)',
    ])
    // The fields keep the ids of the rows; the cells of the rows are gone.
    expect(rows.slice(0, 5).map((cell) => cell.id)).toEqual(['r_id', 'r_ogrn', 'r_inn', 'r_kpp', 'r_load_file_id'])
    expect(page!.cells.some((cell) => cell.id === 'r_id_0')).toBe(false)
    expect(isTableIndexStyle(rows[5]!.style)).toBe(true)
    expect(splitField(rows[3]!.value)).toMatchObject({ name: 'kpp', type: 'varchar(9)', notNull: false })
    // Fields are stacked under the header, as the table of the palette has them.
    expect(rows[0]!.geometry).toMatchObject({ x: 0, width: 620, height: TABLE_FIELD_HEIGHT })
    expect(rows[1]!.geometry!.y - rows[0]!.geometry!.y).toBe(TABLE_FIELD_HEIGHT)
    expect(rows[0]!.geometry!.y).toBeGreaterThan(TABLE_HEADER_HEIGHT)
  })

  it('makes one unique index of a numbered unique key and keeps markers it does not know in the comment', async () => {
    const [page] = await parseDrawio(ER)
    const rows = childrenOf(page!.cells, 't_load_file')
    expect(rows.map((cell) => cell.value)).toEqual([
      'id uuid PK',
      'archive_path varchar(512)',
      'file_name varchar(128)',
      "snapshot_id uuid COMMENT 'REF* · стабильная ссылка'",
      'load_file_archive_path_file_name_key (archive_path, file_name) UNIQUE',
    ])
  })

  it('connects the fields with the edges of their rows and of their cells, routed anew', async () => {
    const [page] = await parseDrawio(ER)
    const cells = byId(page!.cells)
    expect(cells.get('e_source')).toMatchObject({ source: 'r_load_file_id', target: 'f_id' })
    expect(cells.get('e_part')).toMatchObject({ source: 'r_load_file_id', target: 'f_id' })
    expect(cells.get('e_source')!.geometry).not.toHaveProperty('points')
  })

  it('reads the tables of the ER shapes of draw.io: a field per cell, keys in their own column', async () => {
    const [page] = await parseDrawio(
      file(
        `<mxCell id="t" value="Users" vertex="1" parent="1" style="shape=table;startSize=30;container=1;collapsible=1;childLayout=tableLayout;fixedRows=1;rowLines=0;fontStyle=1;align=center;resizeLast=1;html=1;"><mxGeometry x="0" y="0" width="180" height="90" as="geometry" /></mxCell>` +
          `<mxCell id="a" value="" vertex="1" parent="t" style="${ROW.replace('fillColor=#FFFFFF', 'fillColor=none')}"><mxGeometry y="30" width="180" height="30" as="geometry" /></mxCell>` +
          part('a0', 'a', 'PK,FK', 0, 30) +
          part('a1', 'a', 'UserID int', 30, 150) +
          `<mxCell id="b" value="" vertex="1" parent="t" style="${ROW}"><mxGeometry y="60" width="180" height="30" as="geometry" /></mxCell>` +
          part('b0', 'b', '', 0, 30) +
          part('b1', 'b', 'Full name', 30, 150),
      ),
    )
    expect(childrenOf(page!.cells, 't').map((cell) => cell.value)).toEqual(['UserID int PK FK', 'Full name'])
  })

  it('reads a field of a table without keys from its name and type, and a name like a marker as a name', async () => {
    const [page] = await parseDrawio(file(table('t', 'plain', 0, row('t', 'a', 68, '', 'id', 'uuid') + row('t', 'b', 98, 'ID', 'code', 'text'))))
    expect(childrenOf(page!.cells, 't').map((cell) => cell.value)).toEqual(['id uuid', "ID code COMMENT 'text'"])
  })

  it('leaves a table that holds more than rows of cells as draw.io drew it', async () => {
    const [page] = await parseDrawio(
      file(table('t', 'odd', 0, row('t', 'a', 68, 'PK', 'id', 'uuid') + '<mxCell id="x" value="note" vertex="1" parent="t" style="text;"><mxGeometry as="geometry" /></mxCell>')),
    )
    const cells = byId(page!.cells)
    expect(cells.get('t')!.style.shape).toBe('table')
    expect(cells.get('a_1')!.value).toBe('id')
  })
})
