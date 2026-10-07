package io.github.thescarletarrow.codraw.image

import org.junit.jupiter.api.Test
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import javax.imageio.ImageIO
import kotlin.test.assertEquals
import kotlin.test.assertNull

class ImageFormatsTest {

    @Test
    fun `PNG, JPEG and GIF files are read with their sizes in pixels`() {
        assertEquals(ImageInfo(ImageType.PNG, 120, 45), ImageFormats.sniff(encoded("png", 120, 45)))
        assertEquals(ImageInfo(ImageType.JPEG, 64, 33), ImageFormats.sniff(encoded("jpg", 64, 33)))
        assertEquals(ImageInfo(ImageType.GIF, 17, 300), ImageFormats.sniff(encoded("gif", 17, 300)))
    }

    @Test
    fun `a JPEG with metadata before its frame is read`() {
        val jpeg = encoded("jpg", 40, 20)
        // An APP1 segment of 100 bytes right after the start of the image, as cameras write Exif.
        val app1 = byteArrayOf(0xFF.toByte(), 0xE1.toByte(), 0, 102) + ByteArray(100) { 'x'.code.toByte() }
        val withExif = jpeg.copyOfRange(0, 2) + app1 + jpeg.copyOfRange(2, jpeg.size)

        assertEquals(ImageInfo(ImageType.JPEG, 40, 20), ImageFormats.sniff(withExif))
    }

    @Test
    fun `lossy, lossless and extended WebP files are read with their sizes`() {
        assertEquals(ImageInfo(ImageType.WEBP, 300, 150), ImageFormats.sniff(webpLossy(300, 150)))
        assertEquals(ImageInfo(ImageType.WEBP, 1000, 2), ImageFormats.sniff(webpLossless(1000, 2)))
        assertEquals(ImageInfo(ImageType.WEBP, 4000, 3000), ImageFormats.sniff(webpExtended(4000, 3000)))
    }

    @Test
    fun `SVG, HTML, text and broken or empty headers are no images`() {
        assertNull(ImageFormats.sniff("""<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>""".toByteArray()))
        assertNull(ImageFormats.sniff("<!doctype html><html><script>alert(1)</script></html>".toByteArray()))
        assertNull(ImageFormats.sniff("GIF8".toByteArray()))
        assertNull(ImageFormats.sniff(ByteArray(0)))
        // A PNG signature without its header chunk.
        assertNull(ImageFormats.sniff(encoded("png", 10, 10).copyOfRange(0, 16)))
        // A JPEG that starts its scan before any frame.
        assertNull(ImageFormats.sniff(byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 0xDA.toByte(), 0, 2, 0, 0)))
        // Zero pixels wide.
        assertNull(ImageFormats.sniff(png(0, 10)))
    }

    @Test
    fun `a small file may declare more pixels than the limit, which the header tells`() {
        val bomb = ImageFormats.sniff(png(20_000, 20_000))!!

        assertEquals(400_000_000L, bomb.pixels)
        assertEquals(true, bomb.pixels > ImageFormats.MAX_PIXELS)
    }

    companion object {
        /** A real image of [width] × [height] pixels in [format], as Java writes it. */
        fun encoded(format: String, width: Int, height: Int): ByteArray {
            val type = if (format == "jpg") BufferedImage.TYPE_INT_RGB else BufferedImage.TYPE_INT_ARGB
            val image = BufferedImage(width, height, type)
            val out = ByteArrayOutputStream()
            check(ImageIO.write(image, format, out)) { "No writer for $format" }
            return out.toByteArray()
        }

        /** The signature and the header of a PNG of [width] × [height], then [padding] bytes; enough for the server. */
        fun png(width: Int, height: Int, padding: ByteArray = ByteArray(0)): ByteArray {
            val signature = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)
            val header = int32(13) + "IHDR".toByteArray() + int32(width) + int32(height) + byteArrayOf(8, 6, 0, 0, 0) + int32(0)
            return signature + header + padding
        }

        private fun int32(value: Int) = byteArrayOf((value ushr 24).toByte(), (value ushr 16).toByte(), (value ushr 8).toByte(), value.toByte())

        private fun le16(value: Int) = byteArrayOf(value.toByte(), (value ushr 8).toByte())

        private fun le24(value: Int) = byteArrayOf(value.toByte(), (value ushr 8).toByte(), (value ushr 16).toByte())

        private fun riff(chunk: String, data: ByteArray) =
            "RIFF".toByteArray() + ByteArray(4) + "WEBP".toByteArray() + chunk.toByteArray() + ByteArray(4) + data

        private fun webpLossy(width: Int, height: Int) =
            riff("VP8 ", byteArrayOf(0, 0, 0) + byteArrayOf(0x9D.toByte(), 0x01, 0x2A) + le16(width) + le16(height) + ByteArray(8))

        private fun webpLossless(width: Int, height: Int): ByteArray {
            val bits = (width - 1) or ((height - 1) shl 14)
            return riff("VP8L", byteArrayOf(0x2F) + byteArrayOf(bits.toByte(), (bits ushr 8).toByte(), (bits ushr 16).toByte(), (bits ushr 24).toByte()) + ByteArray(8))
        }

        private fun webpExtended(width: Int, height: Int) = riff("VP8X", ByteArray(4) + le24(width - 1) + le24(height - 1) + ByteArray(4))
    }
}
