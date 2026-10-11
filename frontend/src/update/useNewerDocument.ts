import { useEffect, useReducer } from 'react'
import type * as Y from 'yjs'
import { getMeta, SCHEMA_VERSION } from '../diagram/model.ts'
import { reportNewerDocument } from './updates.ts'

/** The document is written by a newer schema than this build knows. */
export const isNewerDocument = (document: Y.Doc): boolean => {
  const version = getMeta(document).get('schemaVersion')
  return typeof version === 'number' && version > SCHEMA_VERSION
}

/**
 * The document is written by a newer schema than this build knows: the page must not edit it, since this code could
 * write it in a form that newer tabs cannot read; the banner of a new version asks to reload the page. Read while
 * rendering, so that the page does not write the document even once before it knows.
 */
export function useNewerDocument(document: Y.Doc | null): boolean {
  const [, changed] = useReducer((count: number) => count + 1, 0)
  useEffect(() => {
    if (!document) return
    const meta = getMeta(document)
    meta.observe(changed)
    return () => meta.unobserve(changed)
  }, [document])
  const newer = document !== null && isNewerDocument(document)
  useEffect(() => (newer ? reportNewerDocument() : undefined), [newer])
  return newer
}
