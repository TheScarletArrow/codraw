import { request } from './http.ts'

/** A component of a library as the panel of shapes lists it, without its content. */
export interface LibraryComponentSummary {
  id: string
  name: string
  /** A small PNG of the component as a `data:` address; `null` without one. */
  preview: string | null
  /** When its name or content last changed, ISO 8601: the content of another time is another content. */
  updatedAt: string
}

/** A component with its content: a `<mxGraphModel>` of draw.io with its pictures inside. */
export interface LibraryComponent extends LibraryComponentSummary {
  content: string
}

/** A personal library of shapes of the current user; nobody else sees it. */
export interface ShapeLibrary {
  id: string
  name: string
  /** In the order they were added. */
  components: LibraryComponentSummary[]
}

/** The room of the libraries of the user, in bytes: what they take, how much they may, the largest component and picture. */
export interface LibraryUsage {
  used: number
  quota: number
  componentSize: number
  imageSize: number
}

/** What a component is made of; a change with content replaces the preview too, with none for `null`. */
export interface ComponentDraft {
  name: string
  content: string
  preview: string | null
}

/** The longest name of a library and of a component, as the backend keeps them. */
export const LIBRARY_NAME_MAX_LENGTH = 60
export const COMPONENT_NAME_MAX_LENGTH = 80

/** Query key of the libraries of the user; the key of their room starts with it. */
export const LIBRARIES_QUERY_KEY = ['libraries'] as const
export const LIBRARY_USAGE_QUERY_KEY = ['libraries', 'usage'] as const

/**
 * Query key of the content of a component as it was at `updatedAt`: a change of the component is another content, and
 * changes of libraries leave the contents that are already there alone.
 */
export const componentQueryKey = (libraryId: string, componentId: string, updatedAt: string) =>
  ['library-component', libraryId, componentId, updatedAt] as const

const libraryPath = (id: string) => `/api/libraries/${encodeURIComponent(id)}`
const componentPath = (libraryId: string, componentId: string) =>
  `${libraryPath(libraryId)}/components/${encodeURIComponent(componentId)}`

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

/** The libraries of the current user by name, each with its components. */
export function fetchLibraries(): Promise<ShapeLibrary[]> {
  return request('/api/libraries')
}

export function fetchLibraryUsage(): Promise<LibraryUsage> {
  return request('/api/libraries/usage')
}

export function createLibrary(name: string): Promise<ShapeLibrary> {
  return request('/api/libraries', json('POST', { name }))
}

export function renameLibrary(id: string, name: string): Promise<ShapeLibrary> {
  return request(libraryPath(id), json('PATCH', { name }))
}

/** Deletes a library with its components; their copies on boards stay. */
export function deleteLibrary(id: string): Promise<void> {
  return request(libraryPath(id), { method: 'DELETE' })
}

export function addComponent(libraryId: string, draft: ComponentDraft): Promise<LibraryComponentSummary> {
  return request(`${libraryPath(libraryId)}/components`, json('POST', draft))
}

export function fetchComponent(libraryId: string, componentId: string): Promise<LibraryComponent> {
  return request(componentPath(libraryId, componentId))
}

/** Renames a component, or puts new content with its preview into it, or both; its copies on boards stay. */
export function updateComponent(
  libraryId: string,
  componentId: string,
  change: { name: string } | Omit<ComponentDraft, 'name'> | ComponentDraft,
): Promise<LibraryComponentSummary> {
  return request(componentPath(libraryId, componentId), json('PATCH', change))
}

/** Deletes a component; its copies on boards stay. */
export function deleteComponent(libraryId: string, componentId: string): Promise<void> {
  return request(componentPath(libraryId, componentId), { method: 'DELETE' })
}
