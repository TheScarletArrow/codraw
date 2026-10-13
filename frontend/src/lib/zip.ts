const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

/** The CRC-32 of the bytes, as ZIP and PNG check them. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** A file of text in an archive: its name, folders separated by `/`, and its text, stored as UTF-8. */
export interface ZipEntry {
  name: string
  text: string
}

/** A file of bytes in an archive; `compress` deflates it, which pays for text and not for pictures, compressed already. */
export interface ZipFile {
  name: string
  data: Uint8Array
  compress?: boolean
}

/** Names in UTF-8 (bit 11 of the flags), as every archiver reads them. */
const UTF8_NAMES = 0x0800

const STORED = 0
const DEFLATED = 8

const LOCAL_HEADER = 0x04034b50
const CENTRAL_RECORD = 0x02014b50
const END_OF_CENTRAL_DIRECTORY = 0x06054b50

/** A file as the archive keeps it: its bytes as written, the method that wrote them and what they hold. */
interface Packed {
  name: Uint8Array
  method: number
  crc: number
  size: number
  data: Uint8Array
}

/**
 * The files in a ZIP archive, stored without compression: a few files of text want no library, and every archiver,
 * system and repository opens it. `date` is the time of the files, in the local time as ZIP keeps it.
 */
export function zipBytes(entries: readonly ZipEntry[], date = new Date()): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder()
  return assemble(
    entries.map((entry) => {
      const data = encoder.encode(entry.text)
      return { name: encoder.encode(entry.name), method: STORED, crc: crc32(data), size: data.length, data }
    }),
    date,
  )
}

/** The files in a ZIP archive, those with `compress` deflated, as {@link zipBytes} writes it otherwise. */
export async function zipFiles(files: readonly ZipFile[], date = new Date()): Promise<Uint8Array<ArrayBuffer>> {
  const encoder = new TextEncoder()
  const packed = await Promise.all(
    files.map(async (file): Promise<Packed> => {
      const deflated = file.compress ? await transform(file.data, new CompressionStream('deflate-raw')) : null
      // Deflate that does not make the file smaller is not worth the time of the one who opens it.
      const compressed = deflated !== null && deflated.length < file.data.length
      return {
        name: encoder.encode(file.name),
        method: compressed ? DEFLATED : STORED,
        crc: crc32(file.data),
        size: file.data.length,
        data: compressed ? deflated : file.data,
      }
    }),
  )
  return assemble(packed, date)
}

function assemble(files: readonly Packed[], date: Date): Uint8Array<ArrayBuffer> {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)
  const day = ((Math.max(date.getFullYear(), 1980) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  const local: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const { name, method, crc, size, data } of files) {
    const header = new DataView(new ArrayBuffer(30))
    header.setUint32(0, LOCAL_HEADER, true)
    header.setUint16(4, 20, true)
    header.setUint16(6, UTF8_NAMES, true)
    header.setUint16(8, method, true)
    header.setUint16(10, time, true)
    header.setUint16(12, day, true)
    header.setUint32(14, crc, true)
    header.setUint32(18, data.length, true)
    header.setUint32(22, size, true)
    header.setUint16(26, name.length, true)
    local.push(new Uint8Array(header.buffer), name, data)
    const record = new DataView(new ArrayBuffer(46))
    record.setUint32(0, CENTRAL_RECORD, true)
    record.setUint16(4, 20, true)
    record.setUint16(6, 20, true)
    record.setUint16(8, UTF8_NAMES, true)
    record.setUint16(10, method, true)
    record.setUint16(12, time, true)
    record.setUint16(14, day, true)
    record.setUint32(16, crc, true)
    record.setUint32(20, data.length, true)
    record.setUint32(24, size, true)
    record.setUint16(28, name.length, true)
    record.setUint32(42, offset, true)
    central.push(new Uint8Array(record.buffer), name)
    offset += 30 + name.length + data.length
  }
  const centralSize = central.reduce((size, part) => size + part.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, END_OF_CENTRAL_DIRECTORY, true)
  end.setUint16(8, files.length, true)
  end.setUint16(10, files.length, true)
  end.setUint32(12, centralSize, true)
  end.setUint32(16, offset, true)
  const parts = [...local, ...central, new Uint8Array(end.buffer)]
  const bytes = new Uint8Array(offset + centralSize + 22)
  let position = 0
  for (const part of parts) {
    bytes.set(part, position)
    position += part.length
  }
  return bytes
}

/** The archive cannot be read: it is not ZIP, it is broken, or it holds more than the reader takes. */
export class ZipError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ZipError'
  }
}

/** How much an archive from outside may hold. */
export interface ZipLimits {
  /** Files in the archive. */
  entries: number
  /** Bytes of all files read from it, once unpacked. */
  total: number
}

/** A ZIP archive whose files are read one at a time, each when it is needed. */
export interface ZipArchive {
  /** The names of its files, each once. */
  readonly names: readonly string[]
  /** The size of a file once unpacked, as the archive says it; `null` when there is no such file. */
  size(name: string): number | null
  /**
   * The bytes of a file, unpacked and checked against their CRC-32; `null` when there is no such file. Unpacking stops as
   * soon as it gives more than the archive says the file holds, so a small archive cannot unpack into a huge file.
   */
  read(name: string): Promise<Uint8Array | null>
}

interface CentralRecord {
  flags: number
  method: number
  crc: number
  packedSize: number
  size: number
  offset: number
}

/** The archive starts with the header of a file, as a ZIP archive written by CoDraw or an archiver does. */
export function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true) === LOCAL_HEADER
}

/**
 * Opens a ZIP archive from outside: reads its central directory and returns the archive whose files can be read. Throws
 * {@link ZipError} for anything that is not an archive of at most `limits.entries` files with `stored` or `deflate`
 * files; ZIP64 and encryption are not read.
 */
export function openZip(bytes: Uint8Array, limits: ZipLimits): ZipArchive {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const broken = (what: string): never => {
    throw new ZipError(`Broken ZIP archive: ${what}`)
  }
  const u16 = (at: number) => (at + 2 <= bytes.length ? view.getUint16(at, true) : broken('out of bounds'))
  const u32 = (at: number) => (at + 4 <= bytes.length ? view.getUint32(at, true) : broken('out of bounds'))

  // The end of the central directory is the last thing in the archive, before a comment of at most 64 KiB.
  let end = -1
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 22 - 0xffff); at--) {
    if (view.getUint32(at, true) === END_OF_CENTRAL_DIRECTORY) {
      end = at
      break
    }
  }
  if (end < 0) broken('no central directory')
  const count = u16(end + 10)
  const directorySize = u32(end + 12)
  const directory = u32(end + 16)
  if (count === 0xffff || directory === 0xffffffff) broken('ZIP64')
  if (count > limits.entries) throw new ZipError(`The archive has more than ${limits.entries} files`)
  if (directory + directorySize > end) broken('central directory out of bounds')

  const decoder = new TextDecoder()
  const records = new Map<string, CentralRecord>()
  let at = directory
  for (let index = 0; index < count; index++) {
    if (u32(at) !== CENTRAL_RECORD) broken('central record')
    const nameLength = u16(at + 28)
    const next = at + 46 + nameLength + u16(at + 30) + u16(at + 32)
    if (next > end) broken('central record out of bounds')
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength))
    // An archiver keeps the first of two files of one name, and so does the reader.
    if (!records.has(name)) {
      records.set(name, {
        flags: u16(at + 8),
        method: u16(at + 10),
        crc: u32(at + 16),
        packedSize: u32(at + 20),
        size: u32(at + 24),
        offset: u32(at + 42),
      })
    }
    at = next
  }

  let unpacked = 0
  return {
    names: [...records.keys()],
    size: (name) => records.get(name)?.size ?? null,
    async read(name) {
      const record = records.get(name)
      if (!record) return null
      if (record.flags & 1) broken('encrypted file')
      if (record.method !== STORED && record.method !== DEFLATED) broken(`method ${record.method}`)
      unpacked += record.size
      if (unpacked > limits.total) throw new ZipError(`The archive holds more than ${limits.total} bytes`)
      if (u32(record.offset) !== LOCAL_HEADER) broken('local header')
      const start = record.offset + 30 + u16(record.offset + 26) + u16(record.offset + 28)
      if (start + record.packedSize > bytes.length) broken('file out of bounds')
      const packed = bytes.subarray(start, start + record.packedSize)
      const data =
        record.method === STORED
          ? packed
          : await transform(packed, new DecompressionStream('deflate-raw'), record.size).catch((cause: unknown) => {
              throw cause instanceof ZipError ? cause : new ZipError('Broken ZIP archive: deflate', { cause })
            })
      if (data.length !== record.size) broken(`size of ${name}`)
      if (crc32(data) !== record.crc) broken(`CRC-32 of ${name}`)
      return data
    },
  }
}

/** The bytes through a stream of compression; with `limit`, more than that many bytes out stop it with {@link ZipError}. */
async function transform(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, limit?: number): Promise<Uint8Array<ArrayBuffer>> {
  const output = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  }).pipeThrough(stream as unknown as ReadableWritablePair<Uint8Array, Uint8Array>)
  const reader = output.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    length += value.length
    if (limit !== undefined && length > limit) {
      await reader.cancel()
      throw new ZipError('Broken ZIP archive: a file unpacks into more than it says')
    }
    chunks.push(value)
  }
  const result = new Uint8Array(length)
  let position = 0
  for (const chunk of chunks) {
    result.set(chunk, position)
    position += chunk.length
  }
  return result
}
