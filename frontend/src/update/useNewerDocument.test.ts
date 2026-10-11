import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { getMeta, SCHEMA_VERSION } from '../diagram/model.ts'
import { resetUpdates, updateState } from './updates.ts'
import { useNewerDocument } from './useNewerDocument.ts'

function documentOf(schemaVersion: number) {
  const document = new Y.Doc()
  getMeta(document).set('schemaVersion', schemaVersion)
  return document
}

describe('useNewerDocument', () => {
  beforeEach(() => {
    resetUpdates()
  })

  afterEach(() => {
    act(() => resetUpdates())
  })

  it('tells of a document written by a newer schema and asks for a reload', () => {
    const { result } = renderHook(() => useNewerDocument(documentOf(SCHEMA_VERSION + 1)))

    expect(result.current).toBe(true)
    expect(updateState().newerDocument).toBe(true)
  })

  it('lets the page edit a document of its own schema, an older one, or none yet', () => {
    for (const document of [documentOf(SCHEMA_VERSION), documentOf(1), new Y.Doc(), null]) {
      const { result, unmount } = renderHook(() => useNewerDocument(document))
      expect(result.current).toBe(false)
      unmount()
    }
    expect(updateState().newerDocument).toBe(false)
  })

  it('learns of a newer schema that a later change brings', () => {
    const document = documentOf(SCHEMA_VERSION)
    const { result } = renderHook(() => useNewerDocument(document))
    expect(result.current).toBe(false)

    act(() => getMeta(document).set('schemaVersion', SCHEMA_VERSION + 1))

    expect(result.current).toBe(true)
    expect(updateState().newerDocument).toBe(true)
  })

  it('takes the banner back once the page is closed', () => {
    const { unmount } = renderHook(() => useNewerDocument(documentOf(SCHEMA_VERSION + 1)))

    act(() => unmount())

    expect(updateState().newerDocument).toBe(false)
  })
})
