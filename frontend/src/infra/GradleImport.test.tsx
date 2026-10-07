import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CellData } from '../diagram/model.ts'
import { downloadBlob } from '../lib/download.ts'
import { GradleImport } from './GradleImport.tsx'
import { SHOP_FOLDER, SHOP_GRAPH } from './testGradle.ts'

vi.mock('../lib/download.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/download.ts')>()),
  downloadBlob: vi.fn(),
}))

function renderImport() {
  const onAdd = vi.fn<(cells: (origin: { x: number; y: number }) => Promise<CellData[]>) => void>()
  render(<GradleImport busy={false} error={null} onAdd={onAdd} onBack={vi.fn()} />)
  return { onAdd, user: userEvent.setup() }
}

const add = () => screen.getByRole('button', { name: 'Добавить на страницу' })
const status = () => screen.getByRole('status')
const shapes = (cells: CellData[]) => cells.filter((cell) => cell.kind === 'vertex' && cell.parent === '1')

/** The files of a chosen folder, with their paths in it, as a browser gives them. */
const folderFiles = (files: { path: string; text: string }[]) =>
  files.map(({ path, text }) => {
    const file = new File([text], path.split('/').pop()!)
    Object.defineProperty(file, 'webkitRelativePath', { value: path })
    return file
  })

describe('GradleImport', () => {
  it('tells the command of the script, saves the script and adds nothing before a build is given', async () => {
    const { user } = renderImport()

    expect(screen.getByText('./gradlew -q -I codraw.gradle codrawGraph > modules.json')).toBeInTheDocument()
    expect(status()).toHaveTextContent('Граф из codraw.gradle или папка проекта Gradle')
    expect(add()).toBeDisabled()
    expect(screen.getByLabelText('Папка проекта Gradle')).toHaveAttribute('webkitdirectory')

    await user.click(screen.getByRole('button', { name: 'Скачать codraw.gradle' }))
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'codraw.gradle')
    const script = await (vi.mocked(downloadBlob).mock.lastCall![0] as Blob).text()
    expect(script).toContain("tasks.register('codrawGraph')")
  })

  it('sums up a pasted graph and adds the modules from top to bottom', async () => {
    const { onAdd, user } = renderImport()

    await user.click(screen.getByRole('textbox', { name: 'Граф модулей' }))
    await user.paste(SHOP_GRAPH)
    expect(status()).toHaveTextContent('Модулей: 4, связей: 4, групп: 1, пропущено: 0')
    await user.click(screen.getByRole('checkbox', { name: 'Тестовые зависимости' }))
    expect(status()).toHaveTextContent('Модулей: 4, связей: 5, групп: 1, пропущено: 0')
    await user.click(add())

    const cells = await onAdd.mock.lastCall![0]({ x: 0, y: 0 })
    expect(shapes(cells).map((cell) => cell.value)).toEqual([':services', ':app\nJava', ':core\nJava', ':services:billing\nJava', ':services:orders\nJava'])
  })

  it('reads the files of the build of a chosen folder, and a graph opened later replaces them', async () => {
    const { user } = renderImport()

    await user.upload(screen.getByLabelText('Папка проекта Gradle'), folderFiles([...SHOP_FOLDER, { path: 'shop/README.md', text: '# Shop' }]))
    await waitFor(() => expect(status()).toHaveTextContent('Модулей: 4, связей: 4, групп: 1, пропущено: 0'))
    expect(screen.getByText('Папка shop: файлов сборки 5')).toBeInTheDocument()

    await user.upload(screen.getByLabelText('Файлы графа Gradle'), [new File(['{"name": "shop"}'], 'package.json')])
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'package.json: это не граф модулей из codraw.gradle — выполните ./gradlew -q -I codraw.gradle codrawGraph',
      ),
    )
    expect(screen.queryByText(/Папка shop/)).toBeNull()
    expect(add()).toBeDisabled()
  })

  it('names a folder without settings', async () => {
    const { user } = renderImport()

    await user.upload(screen.getByLabelText('Папка проекта Gradle'), folderFiles([{ path: 'app/build.gradle.kts', text: '' }]))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'В папке нет settings.gradle или settings.gradle.kts — выберите корень сборки или откройте граф из скрипта codraw.gradle',
      ),
    )
    expect(add()).toBeDisabled()
  })
})
