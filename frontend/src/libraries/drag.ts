/** The type of the data of a component of a library dragged from the panel of shapes onto the canvas. */
export const COMPONENT_DRAG_TYPE = 'application/x-codraw-component'

/** A component of a library, as a drag carries it. */
export interface ComponentDrag {
  libraryId: string
  componentId: string
}

export const componentDragData = (drag: ComponentDrag) => JSON.stringify(drag)

/** The component that the data of a drag names; `null` for anything else. */
export function readComponentDrag(data: string): ComponentDrag | null {
  if (!data) return null
  try {
    const value = JSON.parse(data) as Partial<ComponentDrag>
    return typeof value.libraryId === 'string' && typeof value.componentId === 'string'
      ? { libraryId: value.libraryId, componentId: value.componentId }
      : null
  } catch {
    return null
  }
}
