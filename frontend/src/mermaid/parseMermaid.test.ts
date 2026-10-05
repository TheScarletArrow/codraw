import { describe, expect, it } from 'vitest'
import { isMermaid, MermaidError, parseMermaid, type ErDiagram, type Flowchart } from './parseMermaid.ts'

const flowchart = (text: string) => parseMermaid(text) as Flowchart
const nodes = (chart: Flowchart) => chart.nodes.map(({ id, label, shape }) => `${id}:${label}:${shape}`)
const edges = (chart: Flowchart) =>
  chart.edges.map(({ source, target, label, arrow, dashed, thick }) =>
    [`${source}->${target}`, label, arrow, dashed && 'dashed', thick && 'thick'].filter(Boolean).join(' '),
  )

describe('flowcharts of Mermaid', () => {
  it('reads nodes with their shapes and labels', () => {
    const chart = flowchart(`flowchart LR
      a[Прямоугольник] --> b(Скруглённый)
      c([Стадион]) --> d((Круг))
      e{Решение} --> f[(PostgreSQL)]
      g{{Шестиугольник}} --> h>Флаг]
      i["Текст в кавычках [со скобками]"] --> j[/Наклон/]
      k --> l[["Подпрограмма"]]`)

    expect(chart.direction).toBe('right')
    expect(nodes(chart)).toEqual([
      'a:Прямоугольник:rectangle',
      'b:Скруглённый:rounded',
      'c:Стадион:rounded',
      'd:Круг:ellipse',
      'e:Решение:rhombus',
      'f:PostgreSQL:database',
      'g:Шестиугольник:rectangle',
      'h:Флаг:rectangle',
      'i:Текст в кавычках [со скобками]:rectangle',
      'j:Наклон:rectangle',
      'k:k:rectangle',
      'l:Подпрограмма:rectangle',
    ])
  })

  it('reads edges with arrows, dashes, thickness and labels, in chains and with &', () => {
    const chart = flowchart(`graph TD
      a -->|HTTPS| b
      b -- запрос --> c
      c -.-> d
      d == события ==> e
      e --- f
      f <--> g
      h & i --> j --> k`)

    expect(chart.direction).toBe('down')
    expect(edges(chart)).toEqual([
      'a->b HTTPS end',
      'b->c запрос end',
      'c->d end dashed',
      'd->e события end thick',
      'e->f none',
      'f->g both',
      'h->j end',
      'i->j end',
      'j->k end',
    ])
  })

  it('puts nodes into the innermost subgraph that lists them, also nodes defined before', () => {
    const chart = flowchart(`flowchart TD
      lb[Балансировщик] --> api
      subgraph k8s [Кластер]
        api[API]
        subgraph data ["Данные"]
          db[(БД)]
        end
        api --> db
      end
      k8s --> lb`)

    expect(chart.subgraphs).toEqual([
      { id: 'k8s', title: 'Кластер', parent: null },
      { id: 'data', title: 'Данные', parent: 'k8s' },
    ])
    expect(chart.nodes.map(({ id, subgraph }) => `${id}:${subgraph}`)).toEqual(['lb:null', 'api:k8s', 'db:data'])
    // An edge to a subgraph is not drawn.
    expect(edges(chart)).toEqual(['lb->api end', 'api->db end'])
  })

  it('skips comments, front matter, styles, classes and clicks, and counts lines not understood', () => {
    const chart = flowchart(`---
title: Схема
---
flowchart LR
  %% комментарий
  a:::important --> b;b --> c
  style a fill:#f9f
  classDef important stroke-width:4px
  click a "https://example.com"
  ???`)

    expect(nodes(chart)).toEqual(['a:a:rectangle', 'b:b:rectangle', 'c:c:rectangle'])
    expect(chart.edges).toHaveLength(2)
    expect(chart.skipped).toBe(4)
  })

  it('turns <br> into new lines and drops the marks of Markdown', () => {
    expect(nodes(flowchart('flowchart LR\n  a["Сервис <br> **оплаты**"]'))).toEqual(['a:Сервис\nоплаты:rectangle'])
  })
})

describe('ER diagrams of Mermaid', () => {
  it('reads entities with attributes and relations with cardinalities', () => {
    const diagram = parseMermaid(`erDiagram
      CUSTOMER ||--o{ ORDER : places
      ORDER ||--|{ LINE_ITEM : contains
      "Delivery Address" |o..o| CUSTOMER : "uses"
      CUSTOMER {
        int id PK
        varchar(255) email UK "почта"
      }
      ORDER {
        int id PK
        int customer_id FK
        timestamp_with_time_zone created_at
      }`) as ErDiagram

    expect(diagram.tables.map((table) => table.name)).toEqual(['CUSTOMER', 'ORDER', 'LINE_ITEM', 'Delivery Address'])
    expect(diagram.tables[1]!.columns.map((column) => `${column.name} ${column.type}`)).toEqual([
      'id int',
      'customer_id int',
      'created_at timestamp with time zone',
    ])
    expect(diagram.tables[0]!.columns[1]).toMatchObject({ name: 'email', unique: true })
    expect(diagram.relations[0]).toEqual({
      left: 'CUSTOMER',
      leftCardinality: 'one',
      right: 'ORDER',
      rightCardinality: 'zero-or-more',
      label: 'places',
    })
    expect(diagram.relations[2]).toMatchObject({ leftCardinality: 'zero-or-one', rightCardinality: 'zero-or-one', label: 'uses' })
  })
})

describe('kinds of Mermaid', () => {
  it('tells flowcharts and ER diagrams from other text', () => {
    expect(isMermaid('flowchart LR\n a --> b')).toBe(true)
    expect(isMermaid('%% схема\ngraph TD\n a --> b')).toBe(true)
    expect(isMermaid('erDiagram\n A ||--o{ B : x')).toBe(true)
    expect(isMermaid('graphs are everywhere')).toBe(false)
    expect(isMermaid('sequenceDiagram\n A->>B: hi')).toBe(false)
  })

  it('refuses other kinds of diagrams', () => {
    expect(() => parseMermaid('sequenceDiagram\n  A->>B: hi')).toThrow(MermaidError)
  })
})
