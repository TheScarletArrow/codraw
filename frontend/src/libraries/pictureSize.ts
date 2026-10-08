/** The size in pixels of a raster picture, from the header of its file. */
export interface PictureSize {
  width: number
  height: number
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** Markers that start a frame of a JPEG: all `SOFn` but the tables of Huffman (C4), the extension (C8) and arithmetic (CC). */
const START_OF_FRAME = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])

/**
 * The size of a PNG, JPEG, GIF or WebP from the header of its file, as the backend reads it (`ImageFormats`): no need to
 * decode the picture, which a test without a canvas could not. `null` for any other file or a header without sizes.
 */
export function pictureSize(bytes: Uint8Array): PictureSize | null {
  const size = png(bytes) ?? gif(bytes) ?? webp(bytes) ?? jpeg(bytes)
  return size && size.width > 0 && size.height > 0 ? size : null
}

const ascii = (bytes: Uint8Array, offset: number, length: number) =>
  offset + length > bytes.length ? '' : String.fromCharCode(...bytes.subarray(offset, offset + length))
const u16be = (bytes: Uint8Array, index: number) => (bytes[index]! << 8) | bytes[index + 1]!
const u16le = (bytes: Uint8Array, index: number) => bytes[index]! | (bytes[index + 1]! << 8)
const u24le = (bytes: Uint8Array, index: number) => bytes[index]! | (bytes[index + 1]! << 8) | (bytes[index + 2]! << 16)
const u32be = (bytes: Uint8Array, index: number) =>
  ((bytes[index]! << 24) | (bytes[index + 1]! << 16) | (bytes[index + 2]! << 8) | bytes[index + 3]!) >>> 0

function png(bytes: Uint8Array): PictureSize | null {
  if (bytes.length < 24 || PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte) || ascii(bytes, 12, 4) !== 'IHDR') return null
  return { width: u32be(bytes, 16), height: u32be(bytes, 20) }
}

function gif(bytes: Uint8Array): PictureSize | null {
  const signature = ascii(bytes, 0, 6)
  if (bytes.length < 10 || (signature !== 'GIF87a' && signature !== 'GIF89a')) return null
  return { width: u16le(bytes, 6), height: u16le(bytes, 8) }
}

function webp(bytes: Uint8Array): PictureSize | null {
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return null
  switch (ascii(bytes, 12, 4)) {
    case 'VP8 ':
      if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null
      return { width: u16le(bytes, 26) & 0x3fff, height: u16le(bytes, 28) & 0x3fff }
    case 'VP8L': {
      if (bytes[20] !== 0x2f) return null
      const bits = (bytes[21]! | (bytes[22]! << 8) | (bytes[23]! << 16) | (bytes[24]! << 24)) >>> 0
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
    }
    case 'VP8X':
      return { width: u24le(bytes, 24) + 1, height: u24le(bytes, 27) + 1 }
    default:
      return null
  }
}

/** Segments up to a start of frame, which holds the height and the width; the scan or the end before one is no image. */
function jpeg(bytes: Uint8Array): PictureSize | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null
  let index = 2
  while (index + 3 < bytes.length) {
    if (bytes[index] !== 0xff) return null
    const marker = bytes[index + 1]!
    if (marker === 0xff) index++
    else if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) index += 2
    else if (marker === 0xd9 || marker === 0xda) return null
    else {
      const length = u16be(bytes, index + 2)
      if (length < 2) return null
      if (START_OF_FRAME.has(marker)) {
        if (index + 8 >= bytes.length) return null
        return { width: u16be(bytes, index + 7), height: u16be(bytes, index + 5) }
      }
      index += 2 + length
    }
  }
  return null
}
