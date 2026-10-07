import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { downloadBlob } from '../lib/download.ts'
import { ArchitectureExport } from './ArchitectureExport.tsx'
import { c4Page } from './testPages.ts'

vi.mock('../lib/download.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/download.ts')>()),
  downloadBlob: vi.fn(),
}))

const text = () => screen.getByLabelText('Текст выгрузки').textContent

describe('ArchitectureExport', () => {
  it('shows the page in Structurizr DSL first and in the other formats on choice', async () => {
    const user = userEvent.setup()
    render(<ArchitectureExport cells={c4Page()} title="Магазин" onBack={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Structurizr DSL' })).toHaveAttribute('aria-pressed', 'true')
    expect(text()).toContain('workspace "Магазин" {')
    expect(screen.getByRole('status')).toHaveTextContent('Элементов: 5, границ: 1, связей: 4, пропущено фигур: 0')

    await user.click(screen.getByRole('button', { name: 'C4-PlantUML' }))
    expect(text()).toContain('!include <C4/C4_Component>')
    await user.click(screen.getByRole('button', { name: 'Mermaid C4' }))
    expect(text()).toMatch(/^C4Container\n/)
  })

  it('copies the text and saves it with the extension of the format', async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    render(<ArchitectureExport cells={c4Page()} title="Магазин — Контейнеры" onBack={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Скопировать' }))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('softwareSystem "Интернет-магазин"'))
    expect(screen.getByText('Скопировано')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'C4-PlantUML' }))
    await user.click(screen.getByRole('button', { name: 'Скачать .puml' }))
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'Магазин — Контейнеры.puml')
    expect(await (vi.mocked(downloadBlob).mock.lastCall![0] as Blob).text()).toContain('@startuml')
  })

  it('offers nothing to copy without elements and says what is exported', () => {
    render(<ArchitectureExport cells={[]} title="Пусто" onBack={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Скопировать' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Скачать .dsl' })).toBeDisabled()
    expect(screen.getByText(/Выгружаются фигуры C4/)).toBeInTheDocument()
  })
})
