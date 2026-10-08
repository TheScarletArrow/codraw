import { type Cell, type Graph, StackLayout } from '@maxgraph/core'

export const isGridTable = (cell: Cell | null | undefined) => cell?.getStyle().shape === 'codraw.gridTable'

function dimensions(cell: Cell) {
  const count = (value: unknown, fallback: number) => Math.max(1, Math.min(50, Math.floor(Number(value) || fallback)))
  const style = cell.getStyle() as Record<string, unknown>
  return { rows: count(style.gridRows, 4), columns: count(style.gridColumns, 3) }
}

/** Real child cells keep labels editable, collaborative and exportable. */
export function populateGridTable(graph: Graph, table: Cell) {
  if (table.getChildCount()) return
  const { rows, columns } = dimensions(table)
  const geometry = table.getGeometry()!
  graph.getDataModel().batchUpdate(() => {
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const cell = graph.insertVertex({
          parent: table,
          value: row === 0 && column === 0 ? String(table.getValue() ?? '') : '',
          position: [column * geometry.width / columns, row * geometry.height / rows],
          size: [geometry.width / columns, geometry.height / rows],
          style: {
            fillColor: 'none', strokeColor: 'none', movable: false, resizable: false,
            deletable: false, whiteSpace: 'wrap', overflow: 'hidden', align: 'left', spacing: 6,
          },
        })
        cell.setConnectable(false)
      }
    }
    graph.getDataModel().setValue(table, '')
  })
}

export class GridTableLayout extends StackLayout {
  override execute(parent: Cell) {
    const geometry = parent.getGeometry()
    if (!geometry) return
    const { rows, columns } = dimensions(parent)
    parent.getChildren().forEach((child, index) => {
      const next = child.getGeometry()!.clone()
      next.x = index % columns * geometry.width / columns
      next.y = Math.floor(index / columns) * geometry.height / rows
      next.width = geometry.width / columns
      next.height = geometry.height / rows
      const previous = child.getGeometry()!
      if (!next.equals(previous)) this.graph.getDataModel().setGeometry(child, next)
    })
  }
}
