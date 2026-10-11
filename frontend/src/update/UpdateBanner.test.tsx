import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockFetch } from '../test/render.tsx'
import { registerUnsavedWork, SAVE_TIMEOUT_MS } from './reload.ts'
import { UpdateBanner } from './UpdateBanner.tsx'
import { checkForUpdate, reportNewerDocument, resetUpdates } from './updates.ts'
import { currentBuild } from './version.ts'

/** The server starts giving another build, and the tab learns of it. */
async function deploy() {
  mockFetch({ 'GET /version.json': { body: { version: currentBuild.version, build: `${currentBuild.build}-next` } } })
  await act(() => checkForUpdate({ force: true }))
}

describe('UpdateBanner', () => {
  const unregister: (() => void)[] = []

  beforeEach(() => {
    resetUpdates()
  })

  afterEach(() => {
    for (const take of unregister.splice(0)) take()
    act(() => resetUpdates())
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('shows nothing while the server gives the build of the tab', async () => {
    render(<UpdateBanner reload={vi.fn()} />)
    mockFetch({ 'GET /version.json': { body: currentBuild } })
    await act(() => checkForUpdate({ force: true }))

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('tells of a new version once the server gives another build', async () => {
    render(<UpdateBanner reload={vi.fn()} />)
    await deploy()

    expect(screen.getByRole('status')).toHaveTextContent('Вышла новая версия CoDraw')
    expect(screen.getByRole('button', { name: 'Обновить' })).toBeInTheDocument()
  })

  it('hides until the page is reloaded on «Позже»', async () => {
    render(<UpdateBanner reload={vi.fn()} />)
    await deploy()

    await userEvent.click(screen.getByRole('button', { name: 'Позже' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('reloads the page on «Обновить» once the edits are saved', async () => {
    const reload = vi.fn()
    const flush = vi.fn()
    unregister.push(registerUnsavedWork({ flush, unsaved: () => false }))
    render(<UpdateBanner reload={reload} />)
    await deploy()

    await userEvent.click(screen.getByRole('button', { name: 'Обновить' }))

    expect(flush).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce())
  })

  it('warns of edits that would be lost and reloads only on «Обновить всё равно»', async () => {
    const reload = vi.fn()
    unregister.push(registerUnsavedWork({ flush: () => {}, unsaved: () => true }))
    render(<UpdateBanner reload={reload} />)
    await deploy()
    vi.useFakeTimers()

    fireEvent.click(screen.getByRole('button', { name: 'Обновить' }))
    expect(screen.getByRole('status')).toHaveTextContent('Сохраняем правки…')
    expect(screen.getByRole('button', { name: 'Обновить' })).toBeDisabled()

    await act(() => vi.advanceTimersByTimeAsync(SAVE_TIMEOUT_MS + 100))
    expect(screen.getByRole('status')).toHaveTextContent('Не все правки сохранены')
    expect(reload).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Обновить всё равно' }))
    expect(reload).toHaveBeenCalledOnce()
  })

  it('asks to reload for a board saved by a newer version, without «Позже»', () => {
    render(<UpdateBanner reload={vi.fn()} />)
    act(() => {
      unregister.push(reportNewerDocument())
    })

    expect(screen.getByRole('status')).toHaveTextContent(
      'Доска сохранена новой версией CoDraw — обновите страницу, чтобы её править',
    )
    expect(screen.getByRole('button', { name: 'Обновить' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Позже' })).not.toBeInTheDocument()
  })
})
