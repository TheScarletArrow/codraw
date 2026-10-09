import { describe, expect, it } from 'vitest'
import { crc32, zipBytes } from './zip.ts'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** The files of an archive, read the way an archiver does: from the end, through the central directory. */
function unzip(bytes: Uint8Array): { name: string; text: string; crc: number }[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = bytes.length - 22
  expect(view.getUint32(end, true)).toBe(0x06054b50)
  const count = view.getUint16(end + 10, true)
  let record = view.getUint32(end + 16, true)
  const files = []
  for (let index = 0; index < count; index++) {
    expect(view.getUint32(record, true)).toBe(0x02014b50)
    expect(view.getUint16(record + 8, true) & 0x0800).toBe(0x0800)
    const crc = view.getUint32(record + 16, true)
    const size = view.getUint32(record + 20, true)
    const nameLength = view.getUint16(record + 28, true)
    const offset = view.getUint32(record + 42, true)
    const name = decoder.decode(bytes.subarray(record + 46, record + 46 + nameLength))
    expect(view.getUint32(offset, true)).toBe(0x04034b50)
    const data = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true)
    files.push({ name, text: decoder.decode(bytes.subarray(data, data + size)), crc })
    record += 46 + nameLength
  }
  return files
}

describe('crc32', () => {
  it('checks bytes as ZIP does', () => {
    expect(crc32(encoder.encode('hello'))).toBe(0x3610a686)
    expect(crc32(new Uint8Array())).toBe(0)
  })
})

describe('zipBytes', () => {
  it('stores files of text with names in UTF-8 that an archiver reads back', () => {
    const bytes = zipBytes(
      [
        { name: '0001-kafka.md', text: '# Kafka\n' },
        { name: '0002-postgresql-dlya-zakazov.md', text: '# PostgreSQL для заказов\n' },
        { name: 'адр/пусто.md', text: '' },
      ],
      new Date(2026, 9, 9, 12, 30, 10),
    )

    expect(unzip(bytes)).toEqual([
      { name: '0001-kafka.md', text: '# Kafka\n', crc: crc32(encoder.encode('# Kafka\n')) },
      {
        name: '0002-postgresql-dlya-zakazov.md',
        text: '# PostgreSQL для заказов\n',
        crc: crc32(encoder.encode('# PostgreSQL для заказов\n')),
      },
      { name: 'адр/пусто.md', text: '', crc: 0 },
    ])
  })

  it('dates the files in the local time as ZIP keeps it', () => {
    const view = new DataView(zipBytes([{ name: 'a.md', text: 'a' }], new Date(2026, 9, 9, 12, 30, 10)).buffer)
    expect(view.getUint16(10, true)).toBe((12 << 11) | (30 << 5) | 5)
    expect(view.getUint16(12, true)).toBe(((2026 - 1980) << 9) | (10 << 5) | 9)
  })

  it('makes an empty archive of no files', () => {
    expect(unzip(zipBytes([]))).toEqual([])
  })
})
