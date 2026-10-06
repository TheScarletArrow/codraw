import type { Cell } from '@maxgraph/core'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { DiagramBuilder } from '../templates/builder.ts'
import { readAttribution, writeAttribution } from './attribution.ts'
import { inheritedFieldId } from './baseTables.ts'
import { PageHistories } from './binding.ts'
import { snapshotPage } from './diff.ts'
import { createDiagramEditor, type DiagramEditor } from './editor.ts'
import { isLockedStyle } from './locks.ts'
import { DEFAULT_PAGE_ID, getCells, initializeDocument, readAttrs, writeAttrs, writeCell, type CellData } from './model.ts'
import { connect, shapeData } from './testing.ts'

describe('restoring cells of a version on the canvas', () => {
  const editors: DiagramEditor[] = []
  afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))

  function open(doc: Y.Doc, options: Parameters<typeof createDiagramEditor>[2] = {}) {
    const container = document.createElement('div')
    document.body.append(container)
    const editor = createDiagramEditor(container, doc, options)
    editors.push(editor)
    return editor
  }

  /** A board with these cells on its page, with their ids, open for Алиса who restores and Боб who changed it. */
  function board(cells: CellData[], options: Parameters<typeof createDiagramEditor>[2] = {}) {
    const doc = new Y.Doc()
    initializeDocument(doc)
    doc.transact(() => cells.forEach((cell) => writeCell(getCells(doc), cell)))
    const bobDoc = new Y.Doc()
    connect(doc, bobDoc)
    const histories = new PageHistories(doc)
    const alice = open(doc, { ...options, undoManager: histories.get(DEFAULT_PAGE_ID) })
    const bob = open(bobDoc)
    return { doc, bobDoc, histories, alice, bob }
  }

  /** The cells that a builder makes. */
  function built(build: (builder: DiagramBuilder) => void): CellData[] {
    const builder = new DiagramBuilder()
    build(builder)
    return builder.build()
  }

  /** The cells of the page as a version keeps them now. */
  const versionOf = (doc: Y.Doc) => snapshotPage(doc, DEFAULT_PAGE_ID)!.cells
  const cellOf = (editor: DiagramEditor, id: string): Cell | null => editor.graph.getDataModel().getCell(id) ?? null
  const childIds = (cell: Cell | null) => cell?.getChildren().filter((child) => child.isVertex()).map((child) => child.getId()) ?? []
  const texts = (cell: Cell | null) => cell?.getChildren().filter((child) => child.isVertex()).map((child) => child.getValue()) ?? []
  const selectedIds = (editor: DiagramEditor) => editor.graph.getSelectionCells().map((cell) => cell.getId())
  const remove = (editor: DiagramEditor, ...ids: string[]) => {
    editor.graph.setSelectionCells(ids.map((id) => cellOf(editor, id)!))
    editor.deleteSelection()
  }

  it('brings back a deleted table with its fields and its edge to a table that is left, as one undo step', () => {
    let users!: { id: string; fields: string[] }
    let orders!: { id: string; fields: string[] }
    let foreignKey = ''
    let api = ''
    const { doc, bobDoc, histories, alice, bob } = board(
      built((builder) => {
        users = builder.table('users', 0, 0, ['id uuid PK'])
        orders = builder.table('orders', 400, 0, ['id uuid PK', 'user_id uuid FK'])
        foreignKey = builder.edge(orders.fields[1]!, users.fields[0]!)
        api = builder.shape('rectangle', 0, 300, { value: 'API' })
      }),
    )
    const version = versionOf(doc)
    remove(bob, orders.id)
    bob.graph.getDataModel().setValue(cellOf(bob, api)!, 'Шлюз')
    expect(cellOf(alice, orders.id)).toBeNull()
    expect(cellOf(alice, foreignKey)).toBeNull()

    alice.restoreCells(version, [orders.id])

    for (const editor of [alice, bob]) {
      expect(childIds(cellOf(editor, orders.id))).toEqual(orders.fields)
      expect(texts(cellOf(editor, orders.id))).toEqual(['id uuid PK', 'user_id uuid FK'])
      const edge = cellOf(editor, foreignKey)!
      expect([edge.getTerminal(true)?.getId(), edge.getTerminal(false)?.getId()]).toEqual([orders.fields[1], users.fields[0]])
      expect(cellOf(editor, api)!.getValue()).toBe('Шлюз')
    }
    expect(getCells(bobDoc).get(orders.id)?.get('value')).toBe('orders')
    expect(selectedIds(alice)).toEqual([orders.id])
    expect(histories.get(DEFAULT_PAGE_ID).undoStack).toHaveLength(1)

    alice.undo()

    for (const editor of [alice, bob]) {
      expect(cellOf(editor, orders.id)).toBeNull()
      expect(cellOf(editor, foreignKey)).toBeNull()
      expect(cellOf(editor, api)!.getValue()).toBe('Шлюз')
    }
    expect(alice.getState().canUndo).toBe(false)
  })

  it('gives an existing shape the label, the place, the style and the properties of the version and leaves the others', () => {
    let cache = ''
    let queue = ''
    const { doc, bobDoc, alice, bob } = board(
      built((builder) => {
        cache = builder.shape('rectangle', 100, 100, { value: 'Кэш' })
        queue = builder.shape('ellipse', 400, 100, { value: 'Очередь' })
      }),
    )
    writeAttrs(getCells(doc).get(cache)!, { owner: 'payments' })
    const version = versionOf(doc)
    const model = bob.graph.getDataModel()
    model.batchUpdate(() => {
      const shape = cellOf(bob, cache)!
      model.setValue(shape, 'Redis')
      const geometry = shape.getGeometry()!.clone()
      geometry.x = 300
      model.setGeometry(shape, geometry)
      model.setStyle(shape, { ...shape.getStyle(), fillColor: '#f8cecc' })
    })
    writeAttrs(getCells(bobDoc).get(cache)!, { owner: 'search' })
    model.setValue(cellOf(bob, queue)!, 'Kafka')

    alice.restoreCells(version, [cache])

    const shape = cellOf(alice, cache)!
    expect(shape.getValue()).toBe('Кэш')
    expect(shape.getGeometry()).toMatchObject({ x: 100, y: 100 })
    expect(shape.getStyle().fillColor).toBe(version.get(cache)!.style.fillColor)
    expect(readAttrs(getCells(bobDoc).get(cache)!)).toEqual({ owner: 'payments' })
    expect(cellOf(alice, queue)!.getValue()).toBe('Kafka')
  })

  it('puts a field back in the middle of its table: the fields under it move down and the table grows', () => {
    let users!: { id: string; fields: string[] }
    const { doc, alice, bob } = board(built((builder) => (users = builder.table('users', 0, 0, ['id uuid PK', 'email text', 'name text']))))
    const version = versionOf(doc)
    const [, email, name] = users.fields as [string, string, string]
    const height = cellOf(alice, users.id)!.getGeometry()!.height
    remove(bob, email)
    expect(cellOf(alice, users.id)!.getGeometry()!.height).toBeLessThan(height)

    alice.restoreCells(version, [email])

    expect(childIds(cellOf(alice, users.id))).toEqual(users.fields)
    expect(cellOf(alice, name)!.getGeometry()!.y).toBe(version.get(name)!.geometry!.y)
    expect(cellOf(alice, users.id)!.getGeometry()!.height).toBe(height)
    // The layout is part of the change, so the document has it, not only the canvas.
    expect(getCells(doc).get(name)!.get('geometry')).toMatchObject({ y: version.get(name)!.geometry!.y })
    expect(getCells(doc).get(users.id)!.get('geometry')).toMatchObject({ height })
    expect(selectedIds(alice)).toEqual([email])
  })

  it('keeps the fields added to a restored table since the version', () => {
    let users!: { id: string; fields: string[] }
    const { doc, alice, bob } = board(built((builder) => (users = builder.table('users', 0, 0, ['id uuid PK']))))
    const version = versionOf(doc)
    const table = cellOf(bob, users.id)!
    bob.graph.getDataModel().setValue(table, 'accounts')
    bob.graph.setSelectionCell(table)
    const phone = bob.addTableField()!
    bob.graph.stopEditing(true)
    bob.graph.getDataModel().setValue(phone, 'phone text')

    alice.restoreCells(version, [users.id])

    expect(cellOf(alice, users.id)!.getValue()).toBe('users')
    expect(texts(cellOf(alice, users.id))).toEqual(['id uuid PK', 'phone text'])
  })

  describe('base tables', () => {
    /** `BaseEntity (id)` as the base of `users (email)`. */
    function inheriting() {
      let base!: { id: string; fields: string[] }
      let users!: { id: string; fields: string[] }
      const opened = board(
        built((builder) => {
          base = builder.table('BaseEntity', 0, 0, ['id uuid PK'])
          users = builder.table('users', 400, 0, ['email text'])
        }),
      )
      const { alice } = opened
      alice.graph.setSelectionCell(cellOf(alice, base.id))
      alice.setBaseTable(true)
      alice.graph.setSelectionCell(cellOf(alice, users.id))
      alice.setTableBase(base.id)
      return { ...opened, base, users, version: versionOf(opened.doc) }
    }

    it('gives a restored table the fields of its base as they are now', () => {
      const { alice, bob, base, users, version } = inheriting()
      remove(bob, users.id)
      bob.graph.getDataModel().setValue(cellOf(bob, base.fields[0]!)!, 'id bigint PK')

      alice.restoreCells(version, [users.id])

      const restored = cellOf(alice, users.id)
      expect(texts(restored)).toEqual(['id bigint PK', 'email text'])
      expect(inheritedFieldId(restored!.getChildAt(0))).toBe(base.fields[0])
      expect(texts(cellOf(bob, users.id))).toEqual(['id bigint PK', 'email text'])
    })

    it('gives the tables that inherit a base the field restored in it', () => {
      const { alice, bob, base, users, version } = inheriting()
      remove(bob, base.fields[0]!)
      expect(texts(cellOf(alice, users.id))).toEqual(['email text'])

      alice.restoreCells(version, [base.fields[0]!])

      expect(texts(cellOf(alice, base.id))).toEqual(['id uuid PK'])
      expect(texts(cellOf(alice, users.id))).toEqual(['id uuid PK', 'email text'])
      expect(texts(cellOf(bob, users.id))).toEqual(['id uuid PK', 'email text'])
      alice.undo()
      expect(texts(cellOf(bob, users.id))).toEqual(['email text'])
    })
  })

  it('puts a shape whose group is gone on the page where the group had it', () => {
    const { doc, alice, bob } = board([
      shapeData('group', 'a0', { geometry: { x: 100, y: 50, width: 300, height: 200 }, style: { fillColor: 'none', strokeColor: 'none' } }),
      shapeData('inner', 'a0', { parent: 'group', value: 'Сервис', geometry: { x: 10, y: 20, width: 120, height: 60 } }),
    ])
    const version = versionOf(doc)
    remove(bob, 'group')
    expect(cellOf(alice, 'inner')).toBeNull()

    alice.restoreCells(version, ['inner'])

    const inner = cellOf(alice, 'inner')!
    expect(inner.getParent()).toBe(alice.graph.getDefaultParent())
    expect(inner.getGeometry()).toMatchObject({ x: 110, y: 70, width: 120, height: 60 })
    expect(getCells(doc).get('inner')!.get('parent')).toBe('1')
  })

  it('puts a shape on the page rather than into a group that it holds now', () => {
    const { doc, bobDoc, alice } = board([
      shapeData('outer', 'a0', { geometry: { x: 100, y: 50, width: 300, height: 200 } }),
      shapeData('inner', 'a0', { parent: 'outer', geometry: { x: 10, y: 20, width: 120, height: 60 } }),
    ])
    const version = versionOf(doc)
    // Another participant nested them the other way round.
    bobDoc.transact(() => {
      getCells(bobDoc).get('inner')!.set('parent', '1')
      getCells(bobDoc).get('outer')!.set('parent', 'inner')
    })

    alice.restoreCells(version, ['inner'])

    const layer = alice.graph.getDefaultParent()
    expect(cellOf(alice, 'inner')!.getParent()).toBe(layer)
    expect(cellOf(alice, 'outer')!.getParent()).toBe(cellOf(alice, 'inner'))
  })

  it('marks the cells it brings back as changed by whoever restores, also those whose properties alone come back', () => {
    let cache = ''
    let queue = ''
    const { doc, bobDoc, histories, alice, bob } = board(
      built((builder) => {
        cache = builder.shape('rectangle', 100, 100, { value: 'Кэш' })
        queue = builder.shape('ellipse', 400, 100, { value: 'Очередь' })
      }),
      { participantId: 'alice', participantName: 'Алиса' },
    )
    writeAttrs(getCells(doc).get(queue)!, { owner: 'payments' })
    const version = versionOf(doc)
    remove(bob, cache)
    bobDoc.transact(() => {
      const entry = getCells(bobDoc).get(queue)!
      writeAttrs(entry, { owner: 'search' })
      writeAttribution(entry, { id: 'bob', name: 'Боб' }, 1)
    })

    alice.restoreCells(version, [cache, queue])

    for (const id of [cache, queue]) {
      expect(readAttribution(getCells(bobDoc).get(id))).toMatchObject({ by: 'alice', name: 'Алиса' })
    }
    expect(histories.get(DEFAULT_PAGE_ID).undoStack).toHaveLength(1)
    alice.undo()
    expect(readAttribution(getCells(bobDoc).get(queue))).toEqual({ by: 'bob', name: 'Боб', at: 1 })
    expect(readAttrs(getCells(bobDoc).get(queue)!)).toEqual({ owner: 'search' })
  })

  describe('locked cells of the page', () => {
    it('leaves a locked shape as it is and selects it, so that its lock shows', () => {
      let cache = ''
      const { doc, histories, alice, bob } = board(built((builder) => (cache = builder.shape('rectangle', 100, 100, { value: 'Кэш' }))))
      const version = versionOf(doc)
      bob.graph.getDataModel().setValue(cellOf(bob, cache)!, 'Redis')
      bob.graph.setSelectionCell(cellOf(bob, cache))
      bob.setLocked(true)

      alice.restoreCells(version, [cache])

      expect(cellOf(alice, cache)!.getValue()).toBe('Redis')
      expect(isLockedStyle(cellOf(alice, cache)!.getStyle())).toBe(true)
      expect(selectedIds(alice)).toEqual([cache])
      expect(histories.get(DEFAULT_PAGE_ID).undoStack).toHaveLength(0)
    })

    it('puts no field back into a locked table, and brings a table back with its edge to a locked one', () => {
      let users!: { id: string; fields: string[] }
      let orders!: { id: string; fields: string[] }
      let foreignKey = ''
      const { doc, alice, bob } = board(
        built((builder) => {
          users = builder.table('users', 0, 0, ['id uuid PK', 'email text'])
          orders = builder.table('orders', 400, 0, ['user_id uuid FK'])
          foreignKey = builder.edge(orders.fields[0]!, users.fields[0]!)
        }),
      )
      const version = versionOf(doc)
      remove(bob, users.fields[1]!, orders.id)
      bob.graph.setSelectionCell(cellOf(bob, users.id))
      bob.setLocked(true)

      alice.restoreCells(version, [users.fields[1]!])

      expect(texts(cellOf(alice, users.id))).toEqual(['id uuid PK'])
      expect(selectedIds(alice)).toEqual([])

      alice.restoreCells(version, [orders.id])

      expect(childIds(cellOf(bob, orders.id))).toEqual(orders.fields)
      expect(cellOf(bob, foreignKey)!.getTerminal(false)?.getId()).toBe(users.fields[0])
      expect(texts(cellOf(bob, users.id))).toEqual(['id uuid PK'])
      expect(isLockedStyle(cellOf(bob, users.id)!.getStyle())).toBe(true)
    })
  })

  it('changes nothing on a canvas for viewing only', () => {
    const doc = new Y.Doc()
    initializeDocument(doc)
    writeCell(getCells(doc), shapeData('a', 'a0', { value: 'A' }))
    const version = versionOf(doc)
    getCells(doc).delete('a')
    const editor = open(doc, { readOnly: true })
    const before = Y.encodeStateVector(doc)

    editor.restoreCells(version, ['a'])

    expect(Y.encodeStateVector(doc)).toEqual(before)
    expect(cellOf(editor, 'a')).toBeNull()
  })
})
