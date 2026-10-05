import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { publishEmbedImage, type Embed } from '../api/embed.ts'
import { DEFAULT_PAGE_ID, getCells, initializeDocument } from '../diagram/model.ts'
import { renderPageSvg } from './renderPage.ts'
import { PUBLISH_INTERVAL, PUBLISH_QUIET, useEmbedPublisher } from './useEmbedPublisher.ts'

vi.mock('./renderPage.ts', () => ({ renderPageSvg: vi.fn(() => '<svg/>') }))
vi.mock('../api/embed.ts', () => ({ publishEmbedImage: vi.fn(async () => {}) }))

const embed: Embed = { path: '/api/embeds/AAAAAAAAAAAAAAAAAAAAAA.svg', pageId: DEFAULT_PAGE_ID, updatedAt: null }

/** A change of a cell of the page, made here or coming from collab. */
function change(document: Y.Doc, value: string, origin?: 'remote') {
  if (origin === 'remote') {
    const other = new Y.Doc()
    Y.applyUpdate(other, Y.encodeStateAsUpdate(document))
    getCells(other).get('1')!.set('value', value)
    Y.applyUpdate(document, Y.encodeStateAsUpdate(other))
  } else {
    getCells(document).get('1')!.set('value', value)
  }
}

describe('publishing the live image', () => {
  let document: Y.Doc

  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(publishEmbedImage).mockClear()
    document = new Y.Doc()
    initializeDocument(document)
  })
  afterEach(() => vi.useRealTimers())

  it('publishes the page once it has been quiet after a change of this participant', () => {
    renderHook(() => useEmbedPublisher('board', document, embed, true))

    change(document, 'a')
    vi.advanceTimersByTime(PUBLISH_QUIET - 100)
    change(document, 'b')
    vi.advanceTimersByTime(PUBLISH_QUIET - 100)
    expect(publishEmbedImage).not.toHaveBeenCalled()

    vi.advanceTimersByTime(100)
    expect(renderPageSvg).toHaveBeenCalledWith(document, DEFAULT_PAGE_ID)
    expect(publishEmbedImage).toHaveBeenCalledExactlyOnceWith('board', DEFAULT_PAGE_ID, '<svg/>')
  })

  it('publishes at most once in the interval', () => {
    renderHook(() => useEmbedPublisher('board', document, embed, true))
    change(document, 'a')
    vi.advanceTimersByTime(PUBLISH_QUIET)

    change(document, 'b')
    vi.advanceTimersByTime(PUBLISH_QUIET)
    expect(publishEmbedImage).toHaveBeenCalledTimes(1)

    // The next picture is due an interval after the first.
    vi.advanceTimersByTime(PUBLISH_INTERVAL - PUBLISH_QUIET - 1)
    expect(publishEmbedImage).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(publishEmbedImage).toHaveBeenCalledTimes(2)
  })

  it('leaves the changes of others to their browsers, and publishes nothing for a viewer or without an image', () => {
    renderHook(() => useEmbedPublisher('board', document, embed, true))
    change(document, 'a', 'remote')
    vi.advanceTimersByTime(PUBLISH_INTERVAL)
    expect(publishEmbedImage).not.toHaveBeenCalled()

    const viewer = renderHook(() => useEmbedPublisher('board', document, embed, false))
    const without = renderHook(() => useEmbedPublisher('board', document, null, true))
    viewer.unmount()
    without.unmount()
  })

  it('stops with the page', () => {
    const { unmount } = renderHook(() => useEmbedPublisher('board', document, embed, true))
    change(document, 'a')

    unmount()
    vi.advanceTimersByTime(PUBLISH_INTERVAL)

    expect(publishEmbedImage).not.toHaveBeenCalled()
  })
})
