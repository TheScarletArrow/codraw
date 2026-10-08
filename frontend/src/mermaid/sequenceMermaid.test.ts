import { describe, expect, it } from 'vitest'
import { readSequence, SequenceBuilder, type SequenceDiagram } from '../diagram/sequence.ts'
import { compareCells } from '../diagram/model.ts'
import { mermaidCells, mermaidSummary } from './mermaidCells.ts'
import { parseMermaid } from './parseMermaid.ts'
import { mermaidText, parseMessageLine, sequenceMermaid, type SequenceMermaid } from './sequenceMermaid.ts'

const parse = (text: string) => parseMermaid(text) as SequenceMermaid

/** The diagram with the names of participants in place of their keys, for comparing. */
function named(diagram: SequenceDiagram) {
  const name = (key: string) => diagram.participants.find((participant) => participant.key === key)?.name ?? key
  return {
    title: diagram.title,
    numbered: diagram.numbered,
    participants: diagram.participants.map((participant) => [participant.name, participant.kind]),
    steps: diagram.steps.map((step) => {
      switch (step.type) {
        case 'message':
          return ['message', name(step.from), step.arrow, name(step.to), step.text, step.activate.map(name), step.deactivate.map(name)]
        case 'note':
          return ['note', step.placement, name(step.from), name(step.to), step.text]
        case 'frame':
          return ['frame', step.kind, step.text]
        case 'else':
          return ['else', step.text]
        case 'end':
          return ['end']
      }
    }),
  }
}

const OAUTH = `sequenceDiagram
  title Вход через OAuth
  autonumber
  actor U as Пользователь
  participant App as Приложение
  participant DB@{ "type": "database" }
  U->>+App: Войти
  App-)DB: Событие входа
  alt есть сессия
    App-->>U: Страница
  else нет сессии
    App-->>-U: 302 на вход
  end
  Note over U,App: Браузер держит cookie
  Note right of DB: Журнал
  loop каждую минуту
    App->>App: Обновить токен
  end`

describe('sequence diagrams of Mermaid', () => {
  it('reads participants, their kinds and aliases, messages, activations, frames and notes', () => {
    const { diagram, skipped } = parse(OAUTH)
    expect(skipped).toBe(0)
    expect(named(diagram)).toEqual({
      title: 'Вход через OAuth',
      numbered: true,
      participants: [
        ['Пользователь', 'actor'],
        ['Приложение', 'participant'],
        ['DB', 'database'],
      ],
      steps: [
        ['message', 'Пользователь', 'sync', 'Приложение', 'Войти', ['Приложение'], []],
        ['message', 'Приложение', 'async', 'DB', 'Событие входа', [], []],
        ['frame', 'alt', 'есть сессия'],
        ['message', 'Приложение', 'reply', 'Пользователь', 'Страница', [], []],
        ['else', 'нет сессии'],
        ['message', 'Приложение', 'reply', 'Пользователь', '302 на вход', [], ['Приложение']],
        ['end'],
        ['note', 'over', 'Пользователь', 'Приложение', 'Браузер держит cookie'],
        ['note', 'right', 'DB', 'DB', 'Журнал'],
        ['frame', 'loop', 'каждую минуту'],
        ['message', 'Приложение', 'sync', 'Приложение', 'Обновить токен', [], []],
        ['end'],
      ],
    })
  })

  it('reads every arrow of Mermaid as one of three kinds and `activate` after the message it follows', () => {
    const { diagram } = parse(`sequenceDiagram
  activate A
  A->B: solid
  A-->B: dotted
  A-xB: cross
  A--xB: dotted cross
  A--)B: dotted open
  A<<->>B: both
  activate B
  deactivate A`)
    const messages = named(diagram).steps
    expect(messages.map((step) => step[2])).toEqual(['sync', 'reply', 'sync', 'reply', 'reply', 'sync'])
    // An activation before the first message starts at its arrow.
    expect(messages[0]![5]).toEqual(['A'])
    expect(messages[5]!.slice(5)).toEqual([['B'], ['A']])
  })

  it('skips groups, highlights and links without breaking the nesting of frames, and counts what it skips', () => {
    const { diagram, skipped } = parse(`sequenceDiagram
  box Aqua Клиенты
    participant A
  end
  rect rgb(200, 220, 255)
    opt есть кэш
      A->>B: get
    end
  end
  link A: Dashboard @ https://example.com
  destroy B
  что-то непонятное`)
    expect(named(diagram).steps).toEqual([['frame', 'opt', 'есть кэш'], ['message', 'A', 'sync', 'B', 'get', [], []], ['end']])
    expect(skipped).toBe(5)
  })

  it('ends a frame without an end with the diagram, and turns <br> and codes into text', () => {
    const { diagram } = parse('sequenceDiagram\n  par сразу\n    A->>B: раз<br>два #59; #35;1\n  and потом\n    A->>C: три')
    expect(named(diagram).steps).toEqual([
      ['frame', 'par', 'сразу'],
      ['message', 'A', 'sync', 'B', 'раз\nдва ; #1', [], []],
      ['else', 'потом'],
      ['message', 'A', 'sync', 'C', 'три', [], []],
      ['end'],
    ])
    expect(mermaidText('"a<br/>b"')).toBe('a\nb')
  })

  it('reads a line of a message with its activation', () => {
    expect(parseMessageLine('Клиент->>+API: POST /login')).toEqual({ from: 'Клиент', to: 'API', arrow: 'sync', activation: '+', text: 'POST /login' })
    expect(parseMessageLine('API-->>-Клиент: 200: OK')).toEqual({ from: 'API', to: 'Клиент', arrow: 'reply', activation: '-', text: '200: OK' })
    expect(parseMessageLine('Просто текст')).toBeNull()
    expect(parseMessageLine('A->>B без двоеточия')).toBeNull()
  })

  it('writes a diagram back as Mermaid, which reads as the same diagram', () => {
    const { diagram } = parse(OAUTH)
    const text = sequenceMermaid(diagram)
    expect(text).toBe(`sequenceDiagram
    title Вход через OAuth
    autonumber
    actor Пользователь
    participant Приложение
    participant DB
    Пользователь->>+Приложение: Войти
    Приложение-)DB: Событие входа
    alt есть сессия
      Приложение-->>Пользователь: Страница
    else нет сессии
      Приложение-->>-Пользователь: 302 на вход
    end
    Note over Пользователь,Приложение: Браузер держит cookie
    Note right of DB: Журнал
    loop каждую минуту
      Приложение->>Приложение: Обновить токен
    end
`)
    const back = parse(text).diagram
    expect(named(back)).toEqual({ ...named(diagram), participants: [['Пользователь', 'actor'], ['Приложение', 'participant'], ['DB', 'participant']] })
  })

  it('writes names that are no ids with aliases, texts with codes, and activations that no sign says as statements', () => {
    const builder = new SequenceBuilder()
    const a = builder.participant('Сервис заказов', 'service')
    const b = builder.participant('end')
    builder.message(a, b, 'раз; два\nтри #4', 'sync', { activate: [a], deactivate: [b] })
    builder.branch('сирота')
    builder.frame('critical', '')
    builder.branch('запасной путь')
    const text = sequenceMermaid(builder.diagram)
    expect(text).toBe(`sequenceDiagram
    participant P1 as Сервис заказов
    participant P2 as end
    P1->>P2: раз#59; два<br>три #35;4
    deactivate P2
    activate P1
    critical
    option запасной путь
    end
`)
    const back = named(parse(text).diagram)
    expect(back.steps[0]).toEqual(['message', 'Сервис заказов', 'sync', 'end', 'раз; два\nтри #4', ['Сервис заказов'], ['end']])
  })

  it('lays the cells of a sequence diagram out at a point and sums it up', async () => {
    const diagram = parseMermaid(OAUTH)
    expect(mermaidSummary(diagram)).toBe('Участников: 3, сообщений: 5, рамок: 2, заметок: 2, пропущено строк: 0')
    const cells = await mermaidCells(diagram, { x: 700, y: 40 })
    const [container, ...parts] = cells
    expect(container!.geometry).toMatchObject({ x: 700, y: 40 })
    const read = readSequence(container!, [...parts].sort(compareCells))
    expect(read.title).toBe('Вход через OAuth')
    expect(read.steps).toHaveLength(12)
  })
})
