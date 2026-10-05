import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { createDiagramEditor, type DiagramEditor } from '../diagram/editor.ts'
import { initializeDocument, LAYER_CELL_ID, type CellData } from '../diagram/model.ts'
import { TABLE_HEADER_HEIGHT } from '../diagram/shapes.ts'
import { DiagramBuilder } from './builder.ts'
import { BOARD_TEMPLATES, templatePage, type TemplateId } from './templates.ts'

const template = (id: TemplateId) => BOARD_TEMPLATES.find((candidate) => candidate.id === id)!

describe('templates', () => {
  it('builds shapes of the palette, tables with fields and edges, ordered as they were added', () => {
    const diagram = new DiagramBuilder()
    const service = diagram.shape('service', 10, 20, { value: 'API' })
    const table = diagram.table('users', 200, 20, ['id uuid PK', 'email text'])
    diagram.edge(service, table.fields[0]!, { style: { endArrow: 'ERmandOne' } })

    const cells = diagram.build()

    const [api, users, id, email, edge] = cells as [CellData, CellData, CellData, CellData, CellData]
    expect(api).toMatchObject({ value: 'API', parent: LAYER_CELL_ID, geometry: { x: 10, y: 20, width: 120, height: 60 } })
    expect(api.style).toMatchObject({ rounded: true, codrawShape: 'service' })
    expect(users.style).toMatchObject({ codrawShape: 'table', childLayout: 'stackLayout' })
    expect(users.geometry!.height).toBe(TABLE_HEADER_HEIGHT + 2 * id.geometry!.height)
    expect([id.parent, email.parent]).toEqual([users.id, users.id])
    expect(id.order < email.order).toBe(true)
    expect(edge).toMatchObject({ kind: 'edge', source: api.id, target: id.id, style: { endArrow: 'ERmandOne' } })
  })

  it('gives every build new ids', () => {
    const ids = (cells: CellData[]) => new Set(cells.map((cell) => cell.id))
    const first = ids(template('er').build())
    const second = ids(template('er').build())

    expect([...first].some((id) => second.has(id))).toBe(false)
  })

  it('connects only cells of the template', () => {
    for (const board of BOARD_TEMPLATES) {
      const cells = board.build()
      const ids = new Set(cells.map((cell) => cell.id))
      for (const cell of cells) {
        if (cell.kind === 'edge') expect([ids.has(cell.source!), ids.has(cell.target!)]).toEqual([true, true])
        if (cell.parent !== LAYER_CELL_ID) expect(ids.has(cell.parent!)).toBe(true)
      }
    }
  })

  it('connects the field owner_id of boards with the field id of users in the ER diagram', () => {
    const cells = template('er').build()
    const byId = new Map(cells.map((cell) => [cell.id, cell]))
    const field = (table: string, name: string) =>
      cells.find((cell) => cell.value.startsWith(name) && byId.get(cell.parent!)?.value === table)!

    expect(cells.filter((cell) => cell.style.codrawShape === 'table').map((cell) => cell.value)).toEqual([
      'users',
      'boards',
      'board_members',
    ])
    expect(cells).toContainEqual(
      expect.objectContaining({ kind: 'edge', source: field('boards', 'owner_id').id, target: field('users', 'id').id }),
    )
  })

  it('makes the template the only page of a new board, named after it', () => {
    const page = templatePage(template('microservices'))

    expect(page).toMatchObject({ id: null, name: 'Микросервисы' })
    expect(page.cells.length).toBeGreaterThan(10)
  })
})

describe('inserting a template', () => {
  const editors: DiagramEditor[] = []
  afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))

  it('adds every template as one undo step and selects it', () => {
    for (const board of BOARD_TEMPLATES) {
      const doc = new Y.Doc()
      initializeDocument(doc)
      const container = document.createElement('div')
      document.body.append(container)
      const editor = createDiagramEditor(container, doc)
      editors.push(editor)
      const cells = board.build()

      editor.insertCells(cells)

      const layer = editor.graph.getDefaultParent()
      expect(layer.getChildCount()).toBe(cells.filter((cell) => cell.parent === LAYER_CELL_ID).length)
      expect(layer.getChildren().filter((cell) => cell.isEdge()).every((edge) => edge.getTerminal(true) && edge.getTerminal(false))).toBe(
        true,
      )
      expect(editor.graph.getSelectionCount()).toBe(layer.getChildCount())
      expect(editor.getState().hasCells).toBe(true)
      editor.undo()
      expect(layer.getChildCount()).toBe(0)
    }
  })
})
