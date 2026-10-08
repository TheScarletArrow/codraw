import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { boardWith, edgeData, shapeData } from '../diagram/testing.ts'
import { createFakeEditor } from '../test/fakeEditor.ts'
import { DependencyAnalysis } from './DependencyAnalysis.tsx'

describe('Панель анализа', () => {
  it('shows directions, highlights personally, navigates and exits with Escape without edits', async () => {
    const doc = boardWith(shapeData('a', 'a1', { value: 'API' }), shapeData('b', 'a2', { value: 'База' }), edgeData('ab', 'a3', 'a', 'b'))
    const editor = createFakeEditor()
    editor.placeCell('a', { x: 10, y: 10, width: 100, height: 50 })
    editor.placeCell('b', { x: 150, y: 10, width: 100, height: 50 })
    const before = Y.encodeStateAsUpdate(doc)
    const show = vi.fn()
    render(<DependencyAnalysis document={doc} editor={editor} request={{ pageId: 'page-1', cellIds: ['a'] }} onShow={show} />)
    const panel = await screen.findByRole('complementary', { name: 'Анализ зависимостей' })
    expect(panel).toHaveTextContent('Зависит от: 1')
    expect(panel).toHaveTextContent('От него зависят: 0')
    expect(screen.getByTestId('dependency-marks')).toBeInTheDocument()
    await userEvent.click(within(within(panel).getByText(/^База/, { selector: 'p' }).closest('li')!).getByRole('button', { name: 'Страница 1' }))
    expect(show).toHaveBeenCalledWith('page-1', 'b')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    expect(screen.queryByTestId('dependency-marks')).not.toBeInTheDocument()
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before)
  })

  it('finds no path for disconnected selections and updates after remote changes', async () => {
    const doc = boardWith(shapeData('a', 'a1', { value: 'API' }), shapeData('b', 'a2', { value: 'База' }))
    const editor = createFakeEditor()
    const { unmount } = render(<DependencyAnalysis document={doc} editor={editor} request={{ pageId: 'page-1', cellIds: ['a', 'b'] }} onShow={vi.fn()} />)
    expect(await screen.findByText('Путь не найден')).toBeInTheDocument()
    const { getCells, writeCell } = await import('../diagram/model.ts')
    act(() => writeCell(getCells(doc), edgeData('ab', 'a3', 'a', 'b')))
    expect(await screen.findByText('Подсвечены все кратчайшие пути по направлению зависимостей.')).toBeInTheDocument()
    unmount()
  })
})
