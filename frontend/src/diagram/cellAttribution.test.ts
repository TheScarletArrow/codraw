import type { Cell, TooltipHandler } from '@maxgraph/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import {
  MODIFIED_AT_KEY,
  MODIFIED_BY_KEY,
  MODIFIED_BY_NAME_KEY,
  readAttribution,
  type Author,
} from './attribution.ts'
import { clipboard } from './clipboard.ts'
import { createDiagramEditor, type DiagramEditor } from './editor.ts'
import { getCells, initializeDocument, LAYER_CELL_ID, orderBetween, writeCell } from './model.ts'
import { restoreDocument } from './restore.ts'
import { connect, REMOTE_ORIGIN } from './testing.ts'

const ALICE: Author = { id: '0199a000-0000-7000-8000-00000000000a', name: 'Алиса' }
const BOB: Author = { id: '0199a000-0000-7000-8000-00000000000b', name: 'Боб' }
const T0 = Date.UTC(2026, 9, 6, 9, 0, 0)
const MINUTE = 60_000

describe('who changed an element', () => {
  const editors: DiagramEditor[] = []
  afterEach(() => {
    editors.splice(0).forEach((editor) => editor.destroy())
    vi.restoreAllMocks()
  })

  function open(participant: Author = ALICE, doc = new Y.Doc()) {
    initializeDocument(doc)
    const container = document.createElement('div')
    document.body.append(container)
    const editor = createDiagramEditor(container, doc, {
      participantName: participant.name,
      participantId: participant.id,
    })
    editors.push(editor)
    return { doc, editor }
  }

  /** Alice and Bob on one board. */
  function participants() {
    const alice = open(ALICE)
    const bob = open(BOB)
    connect(alice.doc, bob.doc)
    return { alice, bob }
  }

  /** Changes of the participants from now on happen at `time`. */
  const at = (time: number) => vi.spyOn(Date, 'now').mockReturnValue(time)
  const attributionOf = (doc: Y.Doc, cell: Cell) => readAttribution(getCells(doc).get(cell.getId()!))
  const theirs = (editor: DiagramEditor, cell: Cell) => editor.graph.getDataModel().getCell(cell.getId()!)!

  it('names the participant in what they add and change, and tells their own changes from the others', () => {
    const { alice, bob } = participants()
    at(T0)

    const cell = alice.editor.addShape('rectangle', { x: 100, y: 100 })!

    expect(attributionOf(bob.doc, cell)).toEqual({ by: ALICE.id, name: 'Алиса', at: T0 })
    expect(alice.editor.getState().attribution).toEqual({ by: ALICE.id, name: 'Алиса', at: T0, mine: true })
    bob.editor.graph.setSelectionCell(theirs(bob.editor, cell))
    expect(bob.editor.getState().attribution).toEqual({ by: ALICE.id, name: 'Алиса', at: T0, mine: false })

    at(T0 + MINUTE)
    bob.editor.setColor('fill', '#f8cecc')

    expect(alice.editor.getState().attribution).toEqual({ by: BOB.id, name: 'Боб', at: T0 + MINUTE, mine: false })
    expect(bob.editor.getState().attribution).toMatchObject({ name: 'Боб', mine: true })
  })

  it('names the participant who pastes or duplicates in the copies, and the original keeps who changed it', () => {
    const { alice, bob } = participants()
    at(T0)
    const cell = alice.editor.addShape('rectangle', { x: 100, y: 100 })!
    at(T0 + MINUTE)
    bob.editor.graph.setSelectionCell(theirs(bob.editor, cell))

    bob.editor.copy()
    bob.editor.paste()
    const pasted = bob.editor.graph.getSelectionCell()
    bob.editor.graph.setSelectionCell(theirs(bob.editor, cell))
    bob.editor.duplicate()
    const duplicate = bob.editor.graph.getSelectionCell()

    for (const copy of [pasted, duplicate]) {
      expect(copy.getId()).not.toBe(cell.getId())
      expect(attributionOf(alice.doc, copy)).toEqual({ by: BOB.id, name: 'Боб', at: T0 + MINUTE })
    }
    expect(attributionOf(alice.doc, cell)).toEqual({ by: ALICE.id, name: 'Алиса', at: T0 })
    // Neither the clipboard nor the diagram inside an image carries who changed the elements.
    alice.editor.graph.setSelectionCell(cell)
    for (const text of [clipboard.text(), alice.editor.exportSvg()!.svg]) {
      expect(text).not.toContain(ALICE.id)
      expect(text).not.toContain('modified')
    }
  })

  it('names the participant in the elements of a template they insert', () => {
    const { doc, editor } = open(BOB)
    at(T0)

    editor.insertCells([
      {
        id: 'template-api',
        kind: 'vertex',
        parent: LAYER_CELL_ID,
        order: orderBetween(null, null),
        value: 'API',
        geometry: { x: 0, y: 0, width: 120, height: 60 },
        source: null,
        target: null,
        style: {},
      },
    ])

    const inserted = editor.graph.getDefaultParent().getChildren()
    expect(inserted).toHaveLength(1)
    expect(attributionOf(doc, inserted[0]!)).toEqual({ by: BOB.id, name: 'Боб', at: T0 })
  })

  it('keeps who changed an element when another participant locks and unlocks it', () => {
    const { alice, bob } = participants()
    at(T0)
    const cell = alice.editor.addShape('rectangle', { x: 100, y: 100 })!
    at(T0 + MINUTE)
    bob.editor.graph.setSelectionCell(theirs(bob.editor, cell))

    bob.editor.setLocked(true)
    expect(bob.editor.getState().lock?.all).toBe(true)
    bob.editor.setLocked(false)

    expect(attributionOf(alice.doc, cell)).toEqual({ by: ALICE.id, name: 'Алиса', at: T0 })
    expect(bob.editor.getState().attribution).toMatchObject({ name: 'Алиса', at: T0 })
  })

  it('shows nobody for several selected elements and for an element that keeps nobody', () => {
    const { doc, editor } = open()
    const first = editor.addShape('rectangle', { x: 100, y: 100 })!
    const second = editor.addShape('rectangle', { x: 300, y: 100 })!
    doc.transact(() => {
      writeCell(getCells(doc), {
        id: 'old',
        kind: 'vertex',
        parent: LAYER_CELL_ID,
        order: orderBetween(null, null),
        value: 'Старая',
        geometry: { x: 500, y: 100, width: 120, height: 60 },
        source: null,
        target: null,
        style: {},
      })
    }, REMOTE_ORIGIN)

    editor.graph.setSelectionCells([first, second])
    expect(editor.getState().attribution).toBeNull()
    editor.graph.setSelectionCell(editor.graph.getDataModel().getCell('old')!)
    expect(editor.getState().attribution).toBeNull()
    editor.graph.clearSelection()
    expect(editor.getState().attribution).toBeNull()
  })

  it('shows who changed the selected element when only that changes, as when a version is restored', () => {
    const { doc, editor } = open()
    at(T0)
    const cell = editor.addShape('rectangle', { x: 100, y: 100 })!
    const version = new Y.Doc()
    Y.applyUpdate(version, Y.encodeStateAsUpdate(doc))
    version.transact(() => {
      const stored = getCells(version).get(cell.getId()!)!
      stored.set(MODIFIED_BY_KEY, BOB.id)
      stored.set(MODIFIED_BY_NAME_KEY, BOB.name)
      stored.set(MODIFIED_AT_KEY, T0 - MINUTE)
    })

    restoreDocument(doc, version)

    expect(editor.getState().attribution).toEqual({ by: BOB.id, name: 'Боб', at: T0 - MINUTE, mine: false })
  })

  it('tells who changed an element in a tooltip over it, but not over the selected one or with the laser on', () => {
    const { alice, bob } = participants()
    at(T0)
    const cell = alice.editor.addShape('rectangle', { x: 100, y: 100 })!
    at(T0 + 5 * MINUTE)
    const tooltips = bob.editor.graph.getPlugin<TooltipHandler>('TooltipHandler')!
    const tooltip = (editor: DiagramEditor, of: Cell) => {
      const state = editor.graph.getView().getState(of)!
      const tip = tooltips.getTooltip(state, state.shape!.node, 0, 0)
      return tip instanceof HTMLElement ? tip.textContent : tip
    }

    expect(tooltips.isEnabled()).toBe(true)
    expect(tooltips.delay).toBe(1000)
    expect(tooltip(bob.editor, theirs(bob.editor, cell))).toBe('Изменено: Алиса, 5 минут назад')
    bob.editor.graph.setSelectionCell(theirs(bob.editor, cell))
    expect(tooltip(bob.editor, theirs(bob.editor, cell))).toBeNull()
    bob.editor.graph.clearSelection()
    bob.editor.setLaser(true)
    expect(tooltip(bob.editor, theirs(bob.editor, cell))).toBeNull()
  })

  it('shows names in the tooltip as text', () => {
    const { editor } = open({ id: BOB.id, name: '<img src=x onerror=alert(1)>' })
    const cell = editor.addShape('rectangle', { x: 100, y: 100 })!
    editor.graph.clearSelection()
    const state = editor.graph.getView().getState(cell)!

    const tip = editor.graph.getPlugin<TooltipHandler>('TooltipHandler')!.getTooltip(state, state.shape!.node, 0, 0)

    expect(tip).toBeInstanceOf(HTMLElement)
    expect((tip as HTMLElement).textContent).toBe('Изменено: <img src=x onerror=alert(1)> (вы), только что')
    expect((tip as HTMLElement).children).toHaveLength(0)
  })
})
