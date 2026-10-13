import { describe, expect, it } from 'vitest'
import { crc32, isZip, openZip, zipBytes, zipFiles, ZipError } from './zip.ts'

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

const LIMITS = { entries: 100, total: 1024 * 1024 }

/** The bytes as numbers: Uint8Array of the text encoder and of the archive may come from different realms in jsdom. */
const numbers = (bytes: Uint8Array | null) => (bytes === null ? null : Array.from(bytes))

/** Bytes that deflate does not shrink. */
function noise(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  let seed = 7
  for (let index = 0; index < length; index++) {
    seed = (seed * 1103515245 + 12345) >>> 0
    bytes[index] = seed >>> 24
  }
  return bytes
}

describe('zipFiles and openZip', () => {
  it('deflates the files asked for, stores the others and reads them all back', async () => {
    const text = encoder.encode('{"cells":[' + '{"id":"a","value":"API"},'.repeat(200) + ']}')
    const picture = noise(4096)
    const bytes = await zipFiles([
      { name: 'board.json', data: text, compress: true },
      { name: 'images/1.png', data: picture },
    ])

    expect(isZip(bytes)).toBe(true)
    expect(bytes.length).toBeLessThan(text.length + picture.length)
    const archive = openZip(bytes, LIMITS)
    expect(archive.names).toEqual(['board.json', 'images/1.png'])
    expect(archive.size('board.json')).toBe(text.length)
    expect(numbers(await archive.read('board.json'))).toEqual(numbers(text))
    expect(numbers(await archive.read('images/1.png'))).toEqual(numbers(picture))
    expect(await archive.read('images/2.png')).toBeNull()
    expect(archive.size('images/2.png')).toBeNull()
  })

  it('stores a file that deflate does not make smaller', async () => {
    const picture = noise(2048)
    const bytes = await zipFiles([{ name: 'images/1.png', data: picture, compress: true }])
    const view = new DataView(bytes.buffer)
    expect(view.getUint16(8, true)).toBe(0)
    expect(numbers(await openZip(bytes, LIMITS).read('images/1.png'))).toEqual(numbers(picture))
  })

  it('reads an archive of zipBytes', async () => {
    const archive = openZip(zipBytes([{ name: 'a.md', text: '# А' }]), LIMITS)
    expect(decoder.decode((await archive.read('a.md'))!)).toBe('# А')
  })

  it('takes no files that are not an archive', () => {
    expect(isZip(encoder.encode('<mxfile/>'))).toBe(false)
    expect(isZip(new Uint8Array([0x50]))).toBe(false)
    expect(() => openZip(encoder.encode('<mxfile/>'), LIMITS)).toThrow(ZipError)
    expect(() => openZip(new Uint8Array(), LIMITS)).toThrow(ZipError)
  })

  it('finds damaged bytes by their CRC-32', async () => {
    const bytes = await zipFiles([{ name: 'a.txt', data: encoder.encode('hello, world') }])
    bytes[30 + 'a.txt'.length] ^= 0xff
    await expect(openZip(bytes, LIMITS).read('a.txt')).rejects.toThrow(ZipError)
  })

  it('takes no damaged deflate', async () => {
    const bytes = await zipFiles([{ name: 'a.txt', data: encoder.encode('hello '.repeat(100)), compress: true }])
    const start = 30 + 'a.txt'.length
    bytes.fill(0xff, start, start + 8)
    await expect(openZip(bytes, LIMITS).read('a.txt')).rejects.toThrow(ZipError)
  })

  it('takes no archive cut short', async () => {
    const bytes = await zipFiles([{ name: 'a.txt', data: encoder.encode('hello') }])
    expect(() => openZip(bytes.subarray(0, bytes.length - 10), LIMITS)).toThrow(ZipError)
  })

  it('stops a file that unpacks into more than the archive says', async () => {
    const bytes = await zipFiles([{ name: 'bomb.txt', data: new Uint8Array(100_000), compress: true }])
    // The central directory says the file holds ten bytes.
    const view = new DataView(bytes.buffer)
    const directory = view.getUint32(bytes.length - 22 + 16, true)
    view.setUint32(directory + 24, 10, true)
    await expect(openZip(bytes, LIMITS).read('bomb.txt')).rejects.toThrow(ZipError)
  })

  it('holds the limits of files and of bytes', async () => {
    const files = Array.from({ length: 3 }, (_, index) => ({ name: `${index}.txt`, data: new Uint8Array(600) }))
    const bytes = await zipFiles(files)
    expect(() => openZip(bytes, { entries: 2, total: 10_000 })).toThrow(ZipError)
    const archive = openZip(bytes, { entries: 3, total: 1000 })
    await archive.read('0.txt')
    await expect(archive.read('1.txt')).rejects.toThrow(ZipError)
  })

  it('reads no encrypted files and no unknown methods', async () => {
    const bytes = await zipFiles([{ name: 'a.txt', data: encoder.encode('secret') }])
    const view = new DataView(bytes.buffer)
    const directory = view.getUint32(bytes.length - 22 + 16, true)
    view.setUint16(directory + 8, 0x0801, true)
    await expect(openZip(bytes, LIMITS).read('a.txt')).rejects.toThrow(ZipError)
    view.setUint16(directory + 8, 0x0800, true)
    view.setUint16(directory + 10, 12, true)
    await expect(openZip(bytes, LIMITS).read('a.txt')).rejects.toThrow(ZipError)
  })
})
