import type { Cell } from '@maxgraph/core'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { DiagramBuilder } from '../../templates/builder.ts'
import { createDiagramEditor, type DiagramEditor } from '../editor.ts'
import { initializeDocument } from '../model.ts'
import { routingInput } from './routingInput.ts'

describe('input of the router', () => {
  const editors: DiagramEditor[] = []
  afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))

  function open(build: (builder: DiagramBuilder) => void) {
    const doc = new Y.Doc()
    initializeDocument(doc)
    const container = document.createElement('div')
    document.body.append(container)
    const editor = createDiagramEditor(container, doc, {})
    editors.push(editor)
    const builder = new DiagramBuilder()
    build(builder)
    editor.insertCells(builder.build())
    const page = editor.graph.getDefaultParent()
    const cell = (value: string): Cell => {
      const find = (parent: Cell): Cell | undefined =>
        parent.getChildren().find((child) => child.getValue() === value) ??
        parent.getChildren().reduce<Cell | undefined>((found, child) => found ?? find(child), undefined)
      return find(page)!
    }
    return { editor, page, cell }
  }

  it('routes an edge between fields from the left or right border of their tables at the middle of the fields', () => {
    const { page, cell } = open((builder) => {
      const users = builder.table('users', 400, 100, ['id uuid PK'], 200)
      const boards = builder.table('boards', 0, 0, ['id uuid PK', 'owner_id uuid FK'], 200)
      builder.edge(boards.fields[1]!, users.fields[0]!)
    })
    const input = routingInput(page)
    const [users, boards] = [cell('users').getGeometry()!, cell('boards').getGeometry()!]

    expect(input.shapes).toEqual(
      expect.arrayContaining([
        { id: cell('users').getId(), x: 400, y: 100, width: users.width, height: 56 },
        { id: cell('boards').getId(), x: 0, y: 0, width: boards.width, height: 82 },
      ]),
    )
    expect(input.shapes).toHaveLength(2)
    expect(input.connectors).toEqual([
      {
        id: expect.any(String),
        source: {
          shape: cell('boards').getId(),
          cell: cell('owner_id uuid FK').getId(),
          pins: [
            { x: 0, y: 69, side: 'left' },
            { x: boards.width, y: 69, side: 'right' },
          ],
        },
        target: {
          shape: cell('users').getId(),
          cell: cell('id uuid PK').getId(),
          pins: [
            { x: 400, y: 143, side: 'left' },
            { x: 400 + users.width, y: 143, side: 'right' },
          ],
        },
      },
    ])
  })

  it('routes an edge between shapes from the middles of their sides, or from the point its end is fixed to', () => {
    const { page } = open((builder) => {
      const a = builder.shape('rectangle', 0, 0, { value: 'a', width: 100, height: 60 })
      const b = builder.shape('rectangle', 300, 0, { value: 'b', width: 100, height: 60 })
      builder.edge(a, b, { from: 'bottom' })
    })
    const [connector] = routingInput(page).connectors

    expect(connector!.source.pins).toEqual([{ x: 50, y: 60, side: 'bottom' }])
    expect(connector!.target.pins).toEqual([
      { x: 350, y: 0, side: 'top' },
      { x: 400, y: 30, side: 'right' },
      { x: 350, y: 60, side: 'bottom' },
      { x: 300, y: 30, side: 'left' },
    ])
  })

  it('leaves out straight and curved edges, edges with bends of the participant and loops', () => {
    const { page, editor } = open((builder) => {
      const a = builder.shape('rectangle', 0, 0, { value: 'a' })
      const b = builder.shape('rectangle', 300, 0, { value: 'b' })
      builder.edge(a, b, { value: 'orthogonal', style: { edgeStyle: 'orthogonalEdgeStyle' } })
      builder.edge(a, b, { value: 'straight', style: { edgeStyle: 'none' } })
      builder.edge(a, b, { value: 'curved', style: { curved: true } })
      builder.edge(a, b, { value: 'bent' })
      builder.edge(a, a, { value: 'loop' })
    })
    const bent = page.getChildren().find((cell) => cell.getValue() === 'bent')!
    const geometry = bent.getGeometry()!.clone()
    geometry.points = [{ x: 150, y: 200 } as never]
    editor.graph.getDataModel().setGeometry(bent, geometry)

    const routed = routingInput(page).connectors.map((connector) => page.getChildren().find((cell) => cell.getId() === connector.id)!.getValue())
    expect(routed).toEqual(['orthogonal'])
  })

  it('goes around the shapes inside groups but through frames and groups', () => {
    const { page, editor, cell } = open((builder) => {
      builder.shape('rectangle', 0, 0, { value: 'a' })
      builder.shape('rectangle', 200, 0, { value: 'b' })
      builder.shape('boundary', -50, -50, { value: 'frame', width: 600, height: 400 })
    })
    editor.graph.setSelectionCells([cell('a'), cell('b')])
    editor.group()

    const shapes = routingInput(page).shapes.map((shape) => shape.id)
    expect(shapes.sort()).toEqual([cell('a').getId(), cell('b').getId()].sort())
  })
})
