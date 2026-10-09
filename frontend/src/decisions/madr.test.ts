import { describe, expect, it } from 'vitest'
import type { Decision } from '../api/decisions.ts'
import { fileNumber, madrFileName, parseMadr, recordFiles, slug, toMadr } from './madr.ts'

const decision = (changes: Partial<Decision> = {}): Decision => ({
  id: 'kafka',
  number: 8,
  title: 'Kafka для событий',
  status: 'accepted',
  supersededBy: null,
  decidedOn: '2026-10-09',
  author: { id: 'alice', name: 'Алиса "А." Смирнова', avatarUrl: null },
  context: 'Нужна очередь событий заказов.',
  options: '* Kafka\n* RabbitMQ',
  outcome: 'Kafka: она уже есть в компании.',
  consequences: '* Нужен кластер\n* Нужен Schema Registry',
  elements: [],
  createdAt: '2026-10-09T10:00:00Z',
  updatedAt: '2026-10-09T10:00:00Z',
  ...changes,
})

describe('slug', () => {
  it('makes a part of a name of a file of Latin letters and digits', () => {
    expect(slug('Kafka for events')).toBe('kafka-for-events')
    expect(slug('Kafka для событий')).toBe('kafka-dlya-sobytiy')
    expect(slug('  Щи, ёж и подъезд!  ')).toBe('shchi-ezh-i-podezd')
    expect(slug('Événements à traiter')).toBe('evenements-a-traiter')
    expect(slug('!!!')).toBe('decision')
  })

  it('cuts a long title between words', () => {
    expect(slug('a'.repeat(58) + ' bc', 60)).toBe('a'.repeat(58))
    expect(slug('ab cd ef', 5)).toBe('ab-cd')
    expect(slug('a'.repeat(70), 60)).toBe('a'.repeat(60))
  })
})

describe('madrFileName', () => {
  it('names a file by the number of the decision and its title', () => {
    expect(madrFileName({ number: 8, title: 'Kafka for events' })).toBe('0008-kafka-for-events.md')
    expect(madrFileName({ number: 12345, title: 'Шардирование' })).toBe('12345-shardirovanie.md')
  })
})

describe('toMadr', () => {
  it('writes a file of MADR 4: the front matter, the title and the sections under the headings of the template', () => {
    expect(toMadr(decision(), [])).toBe(
      [
        '---',
        'status: "accepted"',
        'date: 2026-10-09',
        'decision-makers: "Алиса \\"А.\\" Смирнова"',
        '---',
        '',
        '# Kafka для событий',
        '',
        '## Context and Problem Statement',
        '',
        'Нужна очередь событий заказов.',
        '',
        '## Considered Options',
        '',
        '* Kafka',
        '* RabbitMQ',
        '',
        '## Decision Outcome',
        '',
        'Kafka: она уже есть в компании.',
        '',
        '### Consequences',
        '',
        '* Нужен кластер',
        '* Нужен Schema Registry',
        '',
      ].join('\n'),
    )
  })

  it('links the file of the decision that superseded it and leaves empty sections out', () => {
    const successor = decision({ id: 'pulsar', number: 9, title: 'Pulsar' })
    const superseded = decision({
      status: 'superseded',
      supersededBy: 'pulsar',
      author: null,
      options: '',
      outcome: '',
      consequences: '',
    })

    expect(toMadr(superseded, [superseded, successor])).toBe(
      [
        '---',
        'status: "superseded by [ADR-0009](0009-pulsar.md)"',
        'date: 2026-10-09',
        '---',
        '',
        '# Kafka для событий',
        '',
        '## Context and Problem Statement',
        '',
        'Нужна очередь событий заказов.',
        '',
      ].join('\n'),
    )
  })
})

describe('parseMadr', () => {
  it('reads back what toMadr writes', () => {
    const successor = decision({ id: 'pulsar', number: 9, title: 'Pulsar' })
    const written = decision({ status: 'superseded', supersededBy: 'pulsar' })

    expect(parseMadr('0008-kafka-dlya-sobytiy.md', toMadr(written, [written, successor]))).toEqual({
      number: 8,
      content: {
        title: 'Kafka для событий',
        status: 'superseded',
        decidedOn: '2026-10-09',
        context: written.context,
        options: written.options,
        outcome: written.outcome,
        consequences: written.consequences,
      },
      supersededByNumber: 9,
    })
  })

  it('reads a record of MADR 4, keeping the sections the board has no field for with their headings', () => {
    const text = [
      '---',
      'status: accepted',
      "date: '2024-03-01'",
      'decision-makers: Alice, Bob',
      '---',
      '',
      '# Use PostgreSQL for orders',
      '',
      '## Context and Problem Statement',
      '',
      'Orders need transactions.',
      '',
      '## Decision Drivers',
      '',
      '* ACID',
      '',
      '## Considered Options',
      '',
      '* PostgreSQL',
      '* MongoDB',
      '',
      '## Decision Outcome',
      '',
      'Chosen option: "PostgreSQL", because ACID.',
      '',
      '### Consequences',
      '',
      '* Good, because we know it',
      '',
      '### Confirmation',
      '',
      'A review of the schema.',
      '',
      '## Pros and Cons of the Options',
      '',
      '### MongoDB',
      '',
      '* Bad, because no joins',
    ].join('\r\n')

    expect(parseMadr('docs/adr/0003-use-postgresql-for-orders.md', text)).toEqual({
      number: 3,
      content: {
        title: 'Use PostgreSQL for orders',
        status: 'accepted',
        decidedOn: '2024-03-01',
        context: 'Orders need transactions.\n\n### Decision Drivers\n\n* ACID',
        options:
          '* PostgreSQL\n* MongoDB\n\n### Pros and Cons of the Options\n\n### MongoDB\n\n* Bad, because no joins',
        outcome: 'Chosen option: "PostgreSQL", because ACID.',
        consequences: '* Good, because we know it\n\n### Confirmation\n\nA review of the schema.',
      },
      supersededByNumber: null,
    })
  })

  it('reads a record of MADR 2 with the status and the day in a list under the title', () => {
    const text = [
      '# 5. Use Markdown Architectural Decision Records',
      '',
      '* Status: rejected',
      '* Deciders: Alice',
      '* Date: 2020-01-02',
      '',
      'Technical Story: #12',
      '',
      '## Context and Problem Statement',
      '',
      'We want to record decisions.',
      '',
      '## Decision Outcome',
      '',
      'Chosen option: MADR.',
      '',
      '### Positive Consequences',
      '',
      '* Easy',
      '',
      '### Negative Consequences',
      '',
      '* None',
    ].join('\n')

    expect(parseMadr('use-markdown.md', text)).toEqual({
      number: 5,
      content: {
        title: 'Use Markdown Architectural Decision Records',
        status: 'rejected',
        decidedOn: '2020-01-02',
        context: 'Technical Story: #12\n\nWe want to record decisions.',
        options: '',
        outcome: 'Chosen option: MADR.',
        consequences: '### Positive Consequences\n\n* Easy\n\n### Negative Consequences\n\n* None',
      },
      supersededByNumber: null,
    })
  })

  it('reads a record in Russian like those of CoDraw itself', () => {
    const text = [
      '# ADR-0007: Схема из живой базы',
      '',
      '- **Статус:** принято',
      '- **Дата:** 2026-10-07',
      '',
      '## Контекст',
      '',
      '«Импорт SQL» разбирает DDL в браузере.',
      '',
      '## Решение',
      '',
      '| Что | Выбор |',
      '|---|---|',
      '| Основной путь | дамп |',
      '',
      '## Обоснование',
      '',
      '- Дамп не требует сетевого доступа.',
      '',
      'Отклонённые альтернативы:',
      '',
      '- **CLI-утилита** — ещё один артефакт.',
    ].join('\n')

    expect(parseMadr('0007-live-schema-import.md', text)).toEqual({
      number: 7,
      content: {
        title: 'Схема из живой базы',
        status: 'accepted',
        decidedOn: '2026-10-07',
        context: '«Импорт SQL» разбирает DDL в браузере.',
        options: '',
        outcome:
          '| Что | Выбор |\n|---|---|\n| Основной путь | дамп |\n\n### Обоснование\n\n- Дамп не требует сетевого доступа.\n\n' +
          'Отклонённые альтернативы:\n\n- **CLI-утилита** — ещё один артефакт.',
        consequences: '',
      },
      supersededByNumber: null,
    })
  })

  it('reads the status of a section and the decision that superseded it in Russian', () => {
    const text = '# Монолит\n\n## Статус\n\nЗаменено решением ADR-0012\n\n## Контекст\n\nНачало.'

    expect(parseMadr('monolit.md', text)).toMatchObject({
      number: null,
      content: { title: 'Монолит', status: 'superseded', decidedOn: null, context: 'Начало.' },
      supersededByNumber: 12,
    })
  })

  it('reads an unknown status as a proposal and a deprecated decision as superseded by none', () => {
    expect(parseMadr('a.md', '---\nstatus: "{proposed | rejected}"\n---\n# A')?.content.status).toBe('proposed')
    expect(parseMadr('a.md', '# A\n\n* Status: deprecated')).toMatchObject({
      content: { status: 'superseded' },
      supersededByNumber: null,
    })
  })

  it('takes no heading from inside a block of code', () => {
    const text = '# A\n\n## Context\n\n```md\n## Consequences\n# Title\n```\n\nAfter.'

    expect(parseMadr('a.md', text)?.content).toMatchObject({
      context: '```md\n## Consequences\n# Title\n```\n\nAfter.',
      consequences: '',
    })
  })

  it('takes a number from the title only with a mark after it, and the number of the file first', () => {
    expect(parseMadr('a.md', '# 2026 roadmap')).toMatchObject({ number: null, content: { title: '2026 roadmap' } })
    expect(parseMadr('a.md', '# [ADR-3] Kafka')).toMatchObject({ number: 3, content: { title: 'Kafka' } })
    expect(parseMadr('0004-kafka.md', '# 3. Kafka')).toMatchObject({ number: 4, content: { title: 'Kafka' } })
  })

  it('reads no decision from a file without a title', () => {
    expect(parseMadr('a.md', 'Just text\n\n## Context\n\nMore.')).toBeNull()
    expect(parseMadr('a.md', '')).toBeNull()
  })
})

describe('recordFiles', () => {
  const files = ['0001-kafka.md', 'README.md', 'adr-template.md', 'index.md', 'notes.md', '0002-b.markdown', 'logo.png']
    .map((name) => ({ name }))

  it('takes the records of a folder: the files of Markdown whose names start with a number', () => {
    expect(recordFiles(files, true).map((file) => file.name)).toEqual(['0001-kafka.md', '0002-b.markdown'])
  })

  it('takes the files chosen one by one but an index or a template', () => {
    expect(recordFiles(files, false).map((file) => file.name)).toEqual(['0001-kafka.md', 'notes.md', '0002-b.markdown'])
  })

  it('reads the number of a file without its folders', () => {
    expect(fileNumber('docs/adr/0012-x.md')).toBe(12)
    expect(fileNumber('docs/0012/x.md')).toBeNull()
  })
})
