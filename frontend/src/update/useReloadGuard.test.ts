import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prepareReload, SAVE_TIMEOUT_MS } from './reload.ts'
import { useReloadGuard } from './useReloadGuard.ts'

type Editor = NonNullable<Parameters<typeof useReloadGuard>[0]>

function fakeEditor(editing: unknown) {
  const stopEditing = vi.fn()
  const editor = { getEditing: () => editing, graph: { stopEditing } } as unknown as Editor
  return { editor, stopEditing }
}

/** What a reload would answer, once its waiting is over. */
async function reloadReady() {
  const ready = prepareReload()
  await vi.advanceTimersByTimeAsync(SAVE_TIMEOUT_MS + 200)
  return ready
}

describe('useReloadGuard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('applies the label being edited before a reload', async () => {
    const { editor, stopEditing } = fakeEditor({ cell: 'shape' })
    const { unmount } = renderHook(() => useReloadGuard(editor, false))

    expect(await reloadReady()).toBe(true)
    expect(stopEditing).toHaveBeenCalledExactlyOnceWith(false)
    unmount()
  })

  it('leaves the graph alone when no label is being edited', async () => {
    const { editor, stopEditing } = fakeEditor(null)
    const { unmount } = renderHook(() => useReloadGuard(editor, false))

    expect(await reloadReady()).toBe(true)
    expect(stopEditing).not.toHaveBeenCalled()
    unmount()
  })

  it('holds the reload back while the page has edits that only it keeps', async () => {
    const { editor } = fakeEditor(null)
    const { rerender, unmount } = renderHook(({ unsaved }) => useReloadGuard(editor, unsaved), {
      initialProps: { unsaved: false },
    })

    rerender({ unsaved: true })
    expect(await reloadReady()).toBe(false)

    rerender({ unsaved: false })
    expect(await reloadReady()).toBe(true)
    unmount()
  })

  it('tells nothing once the page is closed', async () => {
    const { editor, stopEditing } = fakeEditor({ cell: 'shape' })
    const { unmount } = renderHook(() => useReloadGuard(editor, true))

    unmount()

    expect(await reloadReady()).toBe(true)
    expect(stopEditing).not.toHaveBeenCalled()
  })

  it('works without an editor yet', async () => {
    const { unmount } = renderHook(() => useReloadGuard(null, false))

    expect(await reloadReady()).toBe(true)
    unmount()
  })
})
