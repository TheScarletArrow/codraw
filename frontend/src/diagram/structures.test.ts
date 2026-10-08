import { CellEditorHandler } from '@maxgraph/core'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { createDiagramEditor, type DiagramEditor } from './editor.ts'
import { continueList, formatList, listKind } from './lists.ts'
import { initializeDocument } from './model.ts'
import { connect } from './testing.ts'

describe('editable tables and lists', () => {
  const editors: DiagramEditor[] = []
  afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))
  function open(doc = new Y.Doc(), readOnly = false) {
    initializeDocument(doc)
    const container = document.createElement('div')
    document.body.append(container)
    const editor = createDiagramEditor(container, doc, { readOnly })
    editors.push(editor)
    return { doc, editor }
  }

  it('fills individual grid cells and synchronizes their text with another editor', () => {
    const alice = open()
    const bob = open()
    connect(alice.doc, bob.doc)
    const table = alice.editor.addShape('grid-table', { x: 200, y: 200 })!
    expect(table.getChildCount()).toBe(12)
    const cell = table.getChildAt(5)
    alice.editor.graph.startEditingAtCell(cell)
    alice.editor.graph.getPlugin<CellEditorHandler>('CellEditorHandler')!.textarea!.textContent = 'Значение'
    alice.editor.graph.stopEditing(false)
    expect(cell.getValue()).toBe('Значение')
    expect(bob.editor.graph.getDataModel().getCell(cell.getId()!)!.getValue()).toBe('Значение')
    expect(table.getChildAt(4).getValue()).toBe('')
  })

  it('resizes the cells with their table', () => {
    const { editor } = open()
    const table = editor.addShape('grid-table')!
    const geometry = table.getGeometry()!.clone()
    geometry.width = 480
    geometry.height = 300
    editor.graph.resizeCell(table, geometry)
    expect(table.getChildAt(5).getGeometry()).toMatchObject({ x: 320, y: 75, width: 160, height: 75 })
  })

  it('makes an old grid editable without losing its label', () => {
    const { editor } = open()
    const table = editor.graph.insertVertex({ value: 'Старая таблица', position: [0, 0], size: [240, 150], style: { shape: 'codraw.gridTable' } })
    editor.graph.startEditingAtCell(table)
    expect(table.getChildCount()).toBe(12)
    expect(table.getChildAt(0).getValue()).toBe('Старая таблица')
    expect(editor.getEditing()?.cellId).toBe(table.getChildAt(0).getId())
  })

  it('continues bullets and numbering at the caret, and leaves an empty item', () => {
    expect(continueList('• Один', 6)).toEqual({ text: '• Один\n• ', caret: 9 })
    expect(continueList('9. Девять', 9)).toEqual({ text: '9. Девять\n10. ', caret: 14 })
    expect(continueList('• Один\n• ', 9)).toEqual({ text: '• Один\n', caret: 7 })
    expect(continueList('• Первый второй', 8)).toEqual({ text: '• Первый\n•  второй', caret: 11 })
    expect(continueList('Обычный текст', 13)).toBeNull()
  })

  it('adds the next marker when Enter is pressed in the label editor', () => {
    const { editor } = open()
    const list = editor.addShape('list')!
    editor.graph.startEditingAtCell(list)
    const textarea = editor.graph.getPlugin<CellEditorHandler>('CellEditorHandler')!.textarea!
    expect(textarea.style.whiteSpace).toBe('pre-wrap')
    textarea.textContent = '• Один'
    const range = document.createRange()
    range.selectNodeContents(textarea)
    range.collapse(false)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }))
    expect(textarea.innerHTML).toBe('• Один<br>• ')
    editor.graph.stopEditing(false)
    expect(list.getValue()).toBe('• Один\n• ')
  })

  it('converts lists, reports the selected mode and undoes the conversion', () => {
    const { editor } = open()
    const list = editor.addShape('list')!
    editor.setList('numbered')
    expect(list.getValue()).toBe('1. Элемент\n2. Элемент\n3. Элемент')
    expect(editor.getState().text?.list).toBe('numbered')
    editor.setList(null)
    expect(list.getValue()).toBe('Элемент\nЭлемент\nЭлемент')
    editor.undo()
    expect(list.getValue()).toBe('1. Элемент\n2. Элемент\n3. Элемент')
  })

  it('recognizes a typed list and refuses to change a read-only table or list', () => {
    const { doc, editor } = open()
    const text = editor.addShape('text')!
    editor.graph.cellLabelChanged(text, '- Один\n- Два', false)
    expect(text.getStyle()).toMatchObject({ codrawShape: 'list' })
    const table = editor.addShape('grid-table')!
    const viewer = open(doc, true).editor
    viewer.graph.setSelectionCell(viewer.graph.getDataModel().getCell(text.getId()!)!)
    viewer.setList('numbered')
    expect(text.getValue()).toBe('- Один\n- Два')
    viewer.graph.startEditingAtCell(viewer.graph.getDataModel().getCell(table.getChildAt(0).getId()!)!)
    expect(viewer.getEditing()).toBeNull()
  })

  it('formats both list types without duplicating markers', () => {
    expect(formatList('• Один\n• Два', 'numbered')).toBe('1. Один\n2. Два')
    expect(formatList('1. Один\n2. Два', 'bullet')).toBe('• Один\n• Два')
    expect(listKind('1. Один\n2. Два')).toBe('numbered')
  })
})
