import { describe, expect, it } from 'vitest'
import { pictureSize } from './pictureSize.ts'

const bytes = (...parts: (number[] | string)[]) =>
  Uint8Array.from(parts.flatMap((part) => (typeof part === 'string' ? Array.from(part, (char) => char.charCodeAt(0)) : part)))
const u32 = (value: number) => [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]
const u16le = (value: number) => [value & 0xff, (value >>> 8) & 0xff]
const u24le = (value: number) => [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff]

const png = (width: number, height: number) =>
  bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], u32(13), 'IHDR', u32(width), u32(height), [8, 6, 0, 0, 0])
const riff = (chunk: string, data: number[]) => bytes('RIFF', [0, 0, 0, 0], 'WEBP', chunk, [0, 0, 0, 0], data)

describe('the size of a picture from its header', () => {
  it('reads PNG, GIF, JPEG and the three kinds of WebP', () => {
    expect(pictureSize(png(120, 45))).toEqual({ type: 'image/png', width: 120, height: 45 })
    expect(pictureSize(bytes('GIF89a', u16le(17), u16le(300)))).toEqual({ type: 'image/gif', width: 17, height: 300 })
    // A start of the image, an APP0 segment of 16 bytes, then a frame of 33 × 64.
    const jpeg = bytes([0xff, 0xd8, 0xff, 0xe0, 0, 16], new Array<number>(14).fill(0), [0xff, 0xc0, 0, 17, 8, 0, 33, 0, 64, 3])
    expect(pictureSize(jpeg)).toEqual({ type: 'image/jpeg', width: 64, height: 33 })
    expect(pictureSize(riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, ...u16le(300), ...u16le(150), 0, 0, 0, 0]))).toEqual({ type: 'image/webp', width: 300, height: 150 })
    const bits = 999 | (1 << 14)
    expect(pictureSize(riff('VP8L', [0x2f, bits & 0xff, (bits >>> 8) & 0xff, (bits >>> 16) & 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toEqual({ type: 'image/webp', width: 1000, height: 2 })
    expect(pictureSize(riff('VP8X', [0, 0, 0, 0, ...u24le(3999), ...u24le(2999), 0]))).toEqual({ type: 'image/webp', width: 4000, height: 3000 })
  })

  it('is null for SVG, text, a broken header and a picture without pixels', () => {
    expect(pictureSize(bytes('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull()
    expect(pictureSize(bytes('GIF8'))).toBeNull()
    expect(pictureSize(new Uint8Array(0))).toBeNull()
    expect(pictureSize(png(10, 10).subarray(0, 16))).toBeNull()
    expect(pictureSize(png(0, 10))).toBeNull()
    expect(pictureSize(bytes([0xff, 0xd8, 0xff, 0xda, 0, 2, 0, 0]))).toBeNull()
  })
})
