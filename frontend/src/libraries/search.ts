import type { LibraryComponentSummary, ShapeLibrary } from '../api/libraries.ts'
import { matches, words } from '../diagram/shapeSearch.ts'

/** A component that a search found, with its library. */
export interface FoundComponent {
  library: ShapeLibrary
  component: LibraryComponentSummary
}

/**
 * Components of the libraries for a query, as the search of shapes finds shapes: those where every word of the query
 * starts a word of their name or of the name of their library, the ones whose name matches first, each part in the
 * order of the panel. Empty for an empty query.
 */
export function searchComponents(query: string, libraries: readonly ShapeLibrary[]): FoundComponent[] {
  const parts = words(query)
  if (parts.length === 0) return []
  const entries = libraries.flatMap((library) =>
    library.components.map((component) => ({
      found: { library, component },
      name: words(component.name),
      all: [...words(component.name), ...words(library.name)],
    })),
  )
  const found = entries.filter((entry) => matches(parts, entry.all))
  return [...found.filter((entry) => matches(parts, entry.name)), ...found.filter((entry) => !matches(parts, entry.name))].map(
    (entry) => entry.found,
  )
}
