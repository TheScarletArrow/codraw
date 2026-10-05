import { describe, expect, it } from 'vitest'
import { LAYER_CELL_ID, type CellData } from '../diagram/model.ts'
import { mermaidCells, mermaidSummary } from './mermaidCells.ts'
import { parseMermaid } from './parseMermaid.ts'

const byValue = (cells: CellData[], value: string) => cells.find((cell) => cell.value === value)!
const box = (cell: CellData) => cell.geometry!
const inside = (outer: CellData, inner: CellData) =>
  box(inner).x >= box(outer).x &&
  box(inner).y >= box(outer).y &&
  box(inner).x + box(inner).width <= box(outer).x + box(outer).width &&
  box(inner).y + box(inner).height <= box(outer).y + box(outer).height

describe('cells of a flowchart', () => {
  it('draws nodes with the shapes of the palette and edges with their labels and looks, left to right', async () => {
    const cells = await mermaidCells(
      parseMermaid(`flowchart LR
        client[Клиент] -->|HTTPS| api(API)
        api -.-> db[(PostgreSQL)]
        api --- log{Журнал}
        api ==> bus((Шина))`),
      { x: 100, y: 50 },
    )

    const [client, api, db] = ['Клиент', 'API', 'PostgreSQL'].map((value) => byValue(cells, value))
    expect(client!.style.codrawShape).toBe('rectangle')
    expect(api!.style.codrawShape).toBe('rounded')
    expect(db!.style.codrawShape).toBe('database')
    expect(byValue(cells, 'Журнал').style.codrawShape).toBe('rhombus')
    expect(byValue(cells, 'Шина').style.codrawShape).toBe('ellipse')
    expect(box(client!).x + box(client!).width).toBeLessThanOrEqual(box(api!).x)
    expect(box(api!).x + box(api!).width).toBeLessThanOrEqual(box(db!).x)
    expect(Math.min(...cells.filter((cell) => cell.kind === 'vertex').map((cell) => box(cell).x))).toBe(100)

    const edges = cells.filter((cell) => cell.kind === 'edge')
    expect(edges.find((edge) => edge.source === client!.id)).toMatchObject({ value: 'HTTPS', target: api!.id })
    expect(edges.find((edge) => edge.target === db!.id)!.style).toMatchObject({ dashed: true })
    expect(edges.find((edge) => edge.target === byValue(cells, 'Журнал').id)!.style).toMatchObject({ endArrow: 'none' })
    expect(edges.find((edge) => edge.target === byValue(cells, 'Шина').id)!.style).toMatchObject({ strokeWidth: 3 })
  })

  it('widens a shape for a long label and makes it taller for more lines', async () => {
    const cells = await mermaidCells(parseMermaid('flowchart TD\n  a["Очень длинное название сервиса заказов"]\n  b["Две<br>строки"]'), { x: 0, y: 0 })

    expect(box(byValue(cells, 'Очень длинное название сервиса заказов')).width).toBeGreaterThan(120)
    expect(box(byValue(cells, 'Две\nстроки')).height).toBeGreaterThan(60)
  })

  it('puts the nodes of a subgraph inside its frame, top to bottom', async () => {
    const cells = await mermaidCells(
      parseMermaid(`flowchart TD
        lb[Балансировщик] --> a
        subgraph k8s [Кластер]
          a[Под A] --> b[Под B]
        end`),
      { x: 0, y: 0 },
    )

    const frame = byValue(cells, 'Кластер')
    expect(frame.style.codrawShape).toBe('boundary')
    expect(inside(frame, byValue(cells, 'Под A'))).toBe(true)
    expect(inside(frame, byValue(cells, 'Под B'))).toBe(true)
    expect(inside(frame, byValue(cells, 'Балансировщик'))).toBe(false)
    expect(box(byValue(cells, 'Балансировщик')).y + 60).toBeLessThanOrEqual(box(frame).y)
    // The frame comes first, so that it is drawn under its nodes.
    expect(cells.filter((cell) => cell.parent === LAYER_CELL_ID)[0]).toBe(frame)
  })
})

describe('cells of an ER diagram', () => {
  it('draws entities as tables, a relation with an FK column as a reference between fields, others between tables', async () => {
    const cells = await mermaidCells(
      parseMermaid(`erDiagram
        CUSTOMER ||--o{ ORDER : places
        ORDER }o--o{ PRODUCT : contains
        CUSTOMER { int id PK }
        ORDER {
          int id PK
          int customer_id FK
        }
        PRODUCT { int id PK }`),
      { x: 0, y: 0 },
    )

    const customerId = cells.find((cell) => cell.value === 'id int PK' && cell.parent === byValue(cells, 'CUSTOMER').id)!
    const reference = cells.find((cell) => cell.kind === 'edge' && cell.target === customerId.id)!
    expect(cells.find((cell) => cell.id === reference.source)!.value).toBe('customer_id int FK NOT NULL')
    expect(reference.style).toMatchObject({ startArrow: 'ERzeroToMany', endArrow: 'ERmandOne' })
    const manyToMany = cells.find((cell) => cell.kind === 'edge' && cell.target === byValue(cells, 'ORDER').id)!
    expect(manyToMany).toMatchObject({ source: byValue(cells, 'PRODUCT').id, value: 'contains' })
    expect(manyToMany.style).toMatchObject({ startArrow: 'ERzeroToMany', endArrow: 'ERzeroToMany' })
  })

  it('sums up what a diagram adds', () => {
    expect(mermaidSummary(parseMermaid('flowchart LR\n  a --> b\n  style a fill:#fff'))).toBe(
      'Узлов: 2, связей: 1, рамок: 0, пропущено строк: 1',
    )
    expect(mermaidSummary(parseMermaid('erDiagram\n  A ||--o{ B : x'))).toBe('Таблиц: 2, связей: 1, пропущено строк: 0')
  })
})
