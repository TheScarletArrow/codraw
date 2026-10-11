import type { ComponentType } from 'react'

/**
 * A part of the app that did not load, typically a file of an earlier build that the server no longer has after a
 * deployment, or a file that did not come without a connection.
 */
export class ChunkLoadError extends Error {
  constructor(cause: unknown) {
    super(`A part of the app did not load: ${cause instanceof Error ? cause.message : String(cause)}`, { cause })
    this.name = 'ChunkLoadError'
  }
}

export const isChunkLoadError = (error: unknown): error is ChunkLoadError => error instanceof ChunkLoadError

/**
 * The `lazy` of a route whose page is a file of its own: a failed import becomes a {@link ChunkLoadError}, for which the
 * page of the error of the route reloads the page instead of saying that something went wrong.
 */
export function lazyPage<M>(load: () => Promise<M>, pick: (module: M) => ComponentType) {
  return async () => {
    let module: M
    try {
      module = await load()
    } catch (error) {
      throw new ChunkLoadError(error)
    }
    return { Component: pick(module) }
  }
}
