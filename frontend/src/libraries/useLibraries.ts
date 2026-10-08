import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import {
  addComponent,
  componentQueryKey,
  createLibrary,
  deleteComponent,
  deleteLibrary,
  fetchComponent,
  fetchLibraries,
  fetchLibraryUsage,
  LIBRARIES_QUERY_KEY,
  LIBRARY_USAGE_QUERY_KEY,
  renameLibrary,
  updateComponent,
  type LibraryComponentSummary,
  type ShapeLibrary,
} from '../api/libraries.ts'
import type { DiagramEditor, Point } from '../diagram/editor.ts'
import { fileDraft, MissingPicturesError, selectionDraft } from './component.ts'
import { readComponentDrag } from './drag.ts'
import { COMPONENT_LOAD_FAILED, LIBRARY_CHANGE_FAILED, LIBRARY_SAVE_FAILED, libraryError } from './messages.ts'

/** The largest picture of a library when its room cannot be read; the backend checks again anyway. */
const DEFAULT_IMAGE_LIMIT = 2 * 1024 * 1024

export const MISSING_PICTURES = 'Не удалось взять изображения выделения с доски — проверьте связь'
export const NOTHING_SELECTED = 'Выделите фигуры, которые нужно сохранить'

/** Where a component is saved: a library of the user, or a new one of that name. */
export type SaveTarget = { libraryId: string } | { newLibrary: string }

/**
 * The libraries of the user on a page of a board: their list, what is being done with them, and the changes. Changes
 * that the page shows in the panel of shapes tell why they failed in {@link LibraryShelf.error}; saving from the window
 * resolves to its reason itself.
 */
export interface LibraryShelf {
  /** By name, with their components; `undefined` until they are loaded. */
  libraries: ShapeLibrary[] | undefined
  /** The list could not be loaded, e.g. without a connection. */
  unavailable: boolean
  /** Why the last change of the panel failed, in words, until it is dismissed. */
  error: string | null
  dismissError(): void
  /** What is being done now, e.g. «Сохранение…», or `null`. */
  pending: string | null
  createLibrary(name: string): Promise<ShapeLibrary | null>
  renameLibrary(libraryId: string, name: string): Promise<void>
  deleteLibrary(libraryId: string): Promise<void>
  /** Saves the selection of the editor as a component; resolves to why it was not saved, or `null` once it is. */
  saveSelection(editor: DiagramEditor, target: SaveTarget, name?: string): Promise<string | null>
  /** Saves the selection of the editor into the library with the name of the selection; a failure becomes the error. */
  addSelection(editor: DiagramEditor, libraryId: string): Promise<void>
  /** Puts the selection of the editor into the component instead of what it had; its copies on boards stay. */
  replaceWithSelection(editor: DiagramEditor, libraryId: string, componentId: string): Promise<void>
  renameComponent(libraryId: string, componentId: string, name: string): Promise<void>
  deleteComponent(libraryId: string, componentId: string): Promise<void>
  /** Makes a component of each picture file; files that do not fit are named in the error, the others are saved. */
  addFiles(libraryId: string, files: File[]): Promise<void>
  /** Adds a copy of the component to the canvas of the editor, its middle at `at` or in the middle of the view. */
  insert(editor: DiagramEditor, libraryId: string, component: LibraryComponentSummary, at?: Point): Promise<void>
  /** Adds a copy of the component that a drag of the panel carries in `data`, its middle at `at`. */
  drop(editor: DiagramEditor, data: string, at: Point): Promise<void>
  /** Gives the selected elements of the editor the look of the component. */
  applyStyle(editor: DiagramEditor, libraryId: string, component: LibraryComponentSummary): Promise<void>
}

/** Why saving failed, in words: the pictures of the board, or what the backend answered. */
const messageOf = (failure: unknown, fallback: string) =>
  failure instanceof MissingPicturesError ? MISSING_PICTURES : libraryError(failure, fallback)

/** A component as of the time it was changed: its content is the same until it changes again. */
type ComponentVersion = Pick<LibraryComponentSummary, 'id' | 'updatedAt'>

/** The content of a component as it was at its `updatedAt`, from the cache when it is there. */
function contentOf(queryClient: QueryClient, libraryId: string, component: ComponentVersion) {
  return queryClient.fetchQuery({
    queryKey: componentQueryKey(libraryId, component.id, component.updatedAt),
    queryFn: async () => (await fetchComponent(libraryId, component.id)).content,
    staleTime: Infinity,
  })
}

/** The libraries of the current user, for the panel of shapes and the window that saves the selection. */
export function useLibraries(): LibraryShelf {
  const queryClient = useQueryClient()
  const list = useQuery({ queryKey: LIBRARIES_QUERY_KEY, queryFn: fetchLibraries, staleTime: 30_000 })
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)

  const actions = useMemo(() => {
    const refresh = () => queryClient.invalidateQueries({ queryKey: LIBRARIES_QUERY_KEY })
    /** Runs a change of the panel: its failure becomes the error, in words, and the list is read again either way. */
    const change = async (run: () => Promise<unknown>, fallback = LIBRARY_CHANGE_FAILED) => {
      setError(null)
      try {
        await run()
      } catch (failure) {
        setError(messageOf(failure, fallback))
      } finally {
        await refresh()
      }
    }
    const imageLimit = () =>
      queryClient
        .fetchQuery({ queryKey: LIBRARY_USAGE_QUERY_KEY, queryFn: fetchLibraryUsage, staleTime: 60_000 })
        .then((usage) => usage.imageSize)
        .catch(() => DEFAULT_IMAGE_LIMIT)
    const insert = async (editor: DiagramEditor, libraryId: string, component: ComponentVersion, at?: Point) => {
      setError(null)
      try {
        await editor.insertComponent(await contentOf(queryClient, libraryId, component), at)
      } catch (failure) {
        setError(libraryError(failure, COMPONENT_LOAD_FAILED))
      }
    }
    const saveSelection = async (editor: DiagramEditor, target: SaveTarget, name?: string) => {
      setPending('Сохранение в библиотеку…')
      try {
        const draft = await selectionDraft(editor, name)
        if (!draft) return NOTHING_SELECTED
        const libraryId = 'libraryId' in target ? target.libraryId : (await createLibrary(target.newLibrary)).id
        await addComponent(libraryId, draft)
        return null
      } catch (failure) {
        return messageOf(failure, LIBRARY_SAVE_FAILED)
      } finally {
        setPending(null)
        await refresh()
      }
    }

    return {
      dismissError: () => setError(null),
      async createLibrary(name: string) {
        let created: ShapeLibrary | null = null
        await change(async () => {
          created = await createLibrary(name)
        })
        return created
      },
      renameLibrary: (libraryId: string, name: string) => change(() => renameLibrary(libraryId, name)),
      deleteLibrary: (libraryId: string) => change(() => deleteLibrary(libraryId)),
      saveSelection,
      async addSelection(editor: DiagramEditor, libraryId: string) {
        setError(null)
        const failure = await saveSelection(editor, { libraryId })
        if (failure) setError(failure)
      },
      async replaceWithSelection(editor: DiagramEditor, libraryId: string, componentId: string) {
        setPending('Сохранение в библиотеку…')
        try {
          await change(async () => {
            const draft = await selectionDraft(editor)
            if (!draft) {
              setError(NOTHING_SELECTED)
              return
            }
            await updateComponent(libraryId, componentId, { content: draft.content, preview: draft.preview })
          }, LIBRARY_SAVE_FAILED)
        } finally {
          setPending(null)
        }
      },
      renameComponent: (libraryId: string, componentId: string, name: string) =>
        change(() => updateComponent(libraryId, componentId, { name })),
      deleteComponent: (libraryId: string, componentId: string) => change(() => deleteComponent(libraryId, componentId)),
      async addFiles(libraryId: string, files: File[]) {
        setError(null)
        setPending(files.length > 1 ? `Добавление изображений: ${files.length}…` : 'Добавление изображения…')
        const refused: string[] = []
        try {
          const limit = await imageLimit()
          for (const file of files) {
            const draft = await fileDraft(file, limit)
            if (typeof draft === 'string') {
              refused.push(`«${file.name}»: ${draft}`)
              continue
            }
            try {
              await addComponent(libraryId, draft)
            } catch (failure) {
              refused.push(`«${file.name}»: ${libraryError(failure, LIBRARY_SAVE_FAILED)}`)
            }
          }
        } finally {
          setPending(null)
          if (refused.length > 0) setError(`Не добавлены ${refused.join('; ')}`)
          await refresh()
        }
      },
      insert,
      async drop(editor: DiagramEditor, data: string, at: Point) {
        const drag = readComponentDrag(data)
        if (!drag) return
        const libraries = queryClient.getQueryData<ShapeLibrary[]>(LIBRARIES_QUERY_KEY) ?? []
        const library = libraries.find((candidate) => candidate.id === drag.libraryId)
        const known = library?.components.find((item) => item.id === drag.componentId)
        await insert(editor, drag.libraryId, known ?? { id: drag.componentId, updatedAt: '' }, at)
      },
      async applyStyle(editor: DiagramEditor, libraryId: string, component: LibraryComponentSummary) {
        setError(null)
        try {
          await editor.applyComponentStyle(await contentOf(queryClient, libraryId, component))
        } catch (failure) {
          setError(libraryError(failure, COMPONENT_LOAD_FAILED))
        }
      },
    }
  }, [queryClient])

  return {
    ...actions,
    libraries: list.data,
    unavailable: list.isError && list.data === undefined,
    error,
    pending,
  }
}
