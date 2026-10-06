import { Cell, Geometry } from '@maxgraph/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clipboard, readSystemClipboard, writeSystemClipboard } from './clipboard.ts'

describe('clipboard', () => {
  it('is empty until something is copied', () => {
    expect(clipboard.read()).toBeNull()
    expect(clipboard.nextPaste()).toBe(0)
  })

  it('keeps the copied cells under a holder, so that maxGraph does not take copied edges for edge labels', () => {
    const shape = new Cell('Сервис', new Geometry(0, 0, 120, 60))
    const edge = new Cell('', new Geometry())
    edge.setEdge(true)
    edge.getGeometry()!.relative = true

    clipboard.put([shape, edge])

    expect(clipboard.read()).toEqual([shape, edge])
    expect(shape.getParent()).not.toBeNull()
    expect(edge.getParent()).toBe(shape.getParent())
    expect(edge.getParent()!.isEdge()).toBe(false)
  })

  it('counts the pastes of the same content and starts over with a new copy', () => {
    clipboard.put([new Cell('Сервис')])
    expect([clipboard.nextPaste(), clipboard.nextPaste()]).toEqual([1, 2])

    clipboard.put([new Cell('База данных')])

    expect(clipboard.nextPaste()).toBe(1)
  })
})

describe('clipboard of the system', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** A clipboard of the system with the given items, which records what is written to it. */
  function stubClipboard(clipboard: Partial<Clipboard>) {
    vi.stubGlobal('navigator', { clipboard })
    vi.stubGlobal(
      'ClipboardItem',
      class {
        readonly items: Record<string, Blob>
        constructor(items: Record<string, Blob>) {
          this.items = items
        }
      },
    )
  }

  it('writes the text and the HTML as one item, or the text alone without HTML', async () => {
    const write = vi.fn(async () => {})
    const writeText = vi.fn(async () => {})
    stubClipboard({ write, writeText } as Partial<Clipboard>)

    writeSystemClipboard('CREATE TABLE users ();', '<pre data-codraw="x">CREATE TABLE users ();</pre>')
    const [[[item]]] = write.mock.calls as unknown as [[[{ items: Record<string, Blob> }]]]
    expect(await item.items['text/plain']!.text()).toBe('CREATE TABLE users ();')
    expect(await item.items['text/html']!.text()).toContain('data-codraw')

    writeSystemClipboard('%3CmxGraphModel%3E')
    expect(writeText).toHaveBeenCalledWith('%3CmxGraphModel%3E')
  })

  it('writes the text alone when the browser refuses the item', async () => {
    const writeText = vi.fn(async () => {})
    stubClipboard({ write: vi.fn(async () => Promise.reject(new Error('denied'))), writeText } as Partial<Clipboard>)

    writeSystemClipboard('text', '<p>text</p>')

    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('text'))
  })

  it('reads the text and the HTML, or the text alone when the browser refuses more', async () => {
    const item = {
      types: ['text/plain', 'text/html'],
      getType: async (type: string) => new Blob([type === 'text/html' ? '<pre data-codraw="x">sql</pre>' : 'sql']),
    }
    stubClipboard({ read: async () => [item as unknown as ClipboardItem], readText: async () => 'sql' } as Partial<Clipboard>)
    expect(await readSystemClipboard()).toEqual({ text: 'sql', html: '<pre data-codraw="x">sql</pre>' })

    stubClipboard({ read: () => Promise.reject(new Error('denied')), readText: async () => 'sql' } as Partial<Clipboard>)
    expect(await readSystemClipboard()).toEqual({ text: 'sql', html: '' })

    stubClipboard({})
    expect(await readSystemClipboard()).toBeNull()
  })
})
