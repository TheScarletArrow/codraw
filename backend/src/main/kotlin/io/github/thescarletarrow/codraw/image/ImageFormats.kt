package io.github.thescarletarrow.codraw.image

/** A raster format of images that browsers show and boards keep. */
enum class ImageType(val mediaType: String) {
    PNG("image/png"),
    JPEG("image/jpeg"),
    GIF("image/gif"),
    WEBP("image/webp"),
    ;

    companion object {
        fun of(mediaType: String): ImageType? = entries.find { it.mediaType == mediaType }
    }
}

/** What the header of an image file tells: its format and its size in pixels. */
data class ImageInfo(val type: ImageType, val width: Int, val height: Int) {
    val pixels: Long
        get() = width.toLong() * height
}

/**
 * Reads the format and the size in pixels of an image file from its signature and header, whatever the request says it
 * is: a file is served as the type its bytes have, so HTML or a script sent as a picture is not served as a document.
 * SVG is no raster image and is not read: it may carry scripts and external references.
 */
object ImageFormats {

    /**
     * The most pixels of an image of a board. A small file may declare huge sizes, which every browser that shows the
     * board would decode into hundreds of megabytes.
     */
    const val MAX_PIXELS = 50_000_000L

    private val PNG_SIGNATURE = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)

    /** The format and the size of the image in [bytes]; `null` for any other file or a header without sizes. */
    fun sniff(bytes: ByteArray): ImageInfo? = (png(bytes) ?: jpeg(bytes) ?: gif(bytes) ?: webp(bytes))
        ?.takeIf { it.width > 0 && it.height > 0 }

    /** The signature, then the IHDR chunk first, with the width and the height as big-endian integers. */
    private fun png(bytes: ByteArray): ImageInfo? {
        if (!bytes.startsWith(PNG_SIGNATURE) || bytes.size < 24 || bytes.ascii(12, 4) != "IHDR") return null
        val width = bytes.int32BigEndian(16)
        val height = bytes.int32BigEndian(20)
        if (width < 0 || height < 0) return null
        return ImageInfo(ImageType.PNG, width, height)
    }

    /** `GIF87a` or `GIF89a`, then the size of the logical screen as little-endian shorts. */
    private fun gif(bytes: ByteArray): ImageInfo? {
        if (bytes.size < 10 || (bytes.ascii(0, 6) != "GIF87a" && bytes.ascii(0, 6) != "GIF89a")) return null
        return ImageInfo(ImageType.GIF, bytes.int16LittleEndian(6), bytes.int16LittleEndian(8))
    }

    /**
     * A RIFF container of `WEBP` whose first chunk is a lossy frame (`VP8 `), a lossless one (`VP8L`) or the extended
     * header with the size of the canvas (`VP8X`).
     */
    private fun webp(bytes: ByteArray): ImageInfo? {
        if (bytes.size < 30 || bytes.ascii(0, 4) != "RIFF" || bytes.ascii(8, 4) != "WEBP") return null
        return when (bytes.ascii(12, 4)) {
            "VP8 " -> {
                // The frame tag, then the start code of a key frame, then 14 bits of width and of height.
                if (bytes.u8(23) != 0x9D || bytes.u8(24) != 0x01 || bytes.u8(25) != 0x2A) return null
                ImageInfo(ImageType.WEBP, bytes.int16LittleEndian(26) and 0x3FFF, bytes.int16LittleEndian(28) and 0x3FFF)
            }
            "VP8L" -> {
                if (bytes.u8(20) != 0x2F) return null
                val bits = bytes.u8(21) or (bytes.u8(22) shl 8) or (bytes.u8(23) shl 16) or (bytes.u8(24) shl 24)
                ImageInfo(ImageType.WEBP, (bits and 0x3FFF) + 1, ((bits ushr 14) and 0x3FFF) + 1)
            }
            "VP8X" -> ImageInfo(ImageType.WEBP, bytes.int24LittleEndian(24) + 1, bytes.int24LittleEndian(27) + 1)
            else -> null
        }
    }

    /**
     * `FFD8FF`, then segments up to a start of frame (`SOFn`), which holds the height and the width as big-endian
     * shorts. Markers without a length stand alone; the scan or the end of the image before a frame is no image.
     */
    private fun jpeg(bytes: ByteArray): ImageInfo? {
        if (bytes.size < 4 || bytes.u8(0) != 0xFF || bytes.u8(1) != 0xD8 || bytes.u8(2) != 0xFF) return null
        var index = 2
        while (index + 3 < bytes.size) {
            if (bytes.u8(index) != 0xFF) return null
            val marker = bytes.u8(index + 1)
            when {
                // Fill bytes before a marker.
                marker == 0xFF -> index++
                marker == 0xD8 || marker == 0x01 || marker in 0xD0..0xD7 -> index += 2
                marker == 0xD9 || marker == 0xDA -> return null
                else -> {
                    val length = bytes.int16BigEndian(index + 2)
                    if (length < 2) return null
                    if (marker in START_OF_FRAME) {
                        if (index + 8 >= bytes.size) return null
                        return ImageInfo(ImageType.JPEG, bytes.int16BigEndian(index + 7), bytes.int16BigEndian(index + 5))
                    }
                    index += 2 + length
                }
            }
        }
        return null
    }

    /** Markers that start a frame: all `SOFn` but the tables of Huffman (C4), the extension (C8) and arithmetic (CC). */
    private val START_OF_FRAME = (0xC0..0xCF).toSet() - setOf(0xC4, 0xC8, 0xCC)

    private fun ByteArray.startsWith(prefix: ByteArray) = size >= prefix.size && prefix.indices.all { this[it] == prefix[it] }

    private fun ByteArray.ascii(offset: Int, length: Int) =
        if (offset + length > size) "" else String(this, offset, length, Charsets.ISO_8859_1)

    private fun ByteArray.u8(index: Int) = this[index].toInt() and 0xFF

    private fun ByteArray.int16BigEndian(index: Int) = (u8(index) shl 8) or u8(index + 1)

    private fun ByteArray.int16LittleEndian(index: Int) = u8(index) or (u8(index + 1) shl 8)

    private fun ByteArray.int24LittleEndian(index: Int) = u8(index) or (u8(index + 1) shl 8) or (u8(index + 2) shl 16)

    private fun ByteArray.int32BigEndian(index: Int) =
        (u8(index) shl 24) or (u8(index + 1) shl 16) or (u8(index + 2) shl 8) or u8(index + 3)
}
