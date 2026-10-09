import { describe, expect, it } from 'vitest'
import { loadDocument, MAX_DOCUMENT_SIZE, position } from './loadDocument.ts'

const load = (text: string, name = 'api.yaml') => loadDocument({ name, text })

describe('loadDocument', () => {
  it('reads YAML and JSON into the same value', async () => {
    const yaml = await load('openapi: 3.0.0\ninfo:\n  title: Petstore\n  version: 1.0.0\n')
    const json = await load('\uFEFF{ "openapi": "3.0.0", "info": { "title": "Petstore", "version": "1.0.0" } }', 'api.json')

    expect(yaml).toEqual({ openapi: '3.0.0', info: { title: 'Petstore', version: '1.0.0' } })
    expect(json).toEqual(yaml)
  })

  it('tells the line and the column of an error of YAML in the words of the interface', async () => {
    await expect(load('openapi: 3.0.0\ninfo:\n  title: Petstore\n version: 1.0.0\n', 'petstore.yaml')).rejects.toThrow(
      /^petstore\.yaml: строка 4, столбец \d+ — /,
    )
    await expect(load('paths:\n  /a: 1\n  /a: 2\n')).rejects.toThrow('api.yaml: строка 3, столбец 3 — ключ повторяется')
    await expect(load('a: 1\n---\nb: 2\n')).rejects.toThrow(/в файле несколько документов$/)
  })

  it('tells the line of an error of JSON, which JSON.parse does not', async () => {
    await expect(load('{\n  "openapi": "3.0.0",\n  "info": {"title": "A",}\n  "paths": {}\n}', 'api.json')).rejects.toThrow(
      /^api\.json: строка [34], столбец \d+ — /,
    )
  })

  it('refuses a document too large and one that expands its anchors too often', async () => {
    await expect(loadDocument({ name: 'big.yaml', text: '', size: MAX_DOCUMENT_SIZE + 1 })).rejects.toThrow('big.yaml: файл больше 5 МБ')
    await expect(loadDocument({ name: 'plan.json', text: '{}', size: MAX_DOCUMENT_SIZE + 1 }, 4 * MAX_DOCUMENT_SIZE)).resolves.toEqual({})
    await expect(loadDocument({ name: 'plan.json', text: '', size: 4 * MAX_DOCUMENT_SIZE + 1 }, 4 * MAX_DOCUMENT_SIZE)).rejects.toThrow(
      'plan.json: файл больше 20 МБ',
    )
    // Each anchor holds the previous one twice: the last one expands into 2^12 copies of the first.
    const lines = ['a0: &a0 [x, x]']
    for (let index = 1; index <= 12; index++) lines.push(`a${index}: &a${index} [*a${index - 1}, *a${index - 1}]`)
    await expect(load(lines.join('\n'))).rejects.toThrow('api.yaml: слишком много ссылок на якоря YAML')
  })

  it('keeps anchors within the limit', async () => {
    expect(await load('base: &base {type: string}\nname: *base\n')).toEqual({ base: { type: 'string' }, name: { type: 'string' } })
  })
})

describe('position', () => {
  it('counts lines and columns from 1', () => {
    expect(position('ab\ncd\nef', 0)).toEqual({ line: 1, column: 1 })
    expect(position('ab\ncd\nef', 4)).toEqual({ line: 2, column: 2 })
    expect(position('ab\ncd\nef', 100)).toEqual({ line: 3, column: 3 })
  })
})
