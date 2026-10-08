package io.github.thescarletarrow.codraw.library

import io.github.thescarletarrow.codraw.image.ImageFormats
import io.github.thescarletarrow.codraw.image.ImageType
import org.w3c.dom.Element
import org.xml.sax.InputSource
import java.io.ByteArrayOutputStream
import java.io.StringReader
import java.util.Base64

/** The content of a component is no diagram of draw.io, refers to pictures outside it, or its preview is no small PNG. */
class InvalidComponentException(message: String) : RuntimeException(message)

/** A picture of the component is no PNG, JPEG, GIF or WebP by its signature, nor a safe SVG. */
class UnsupportedComponentImageException(message: String) : RuntimeException(message)

/** A picture of the component is larger than the [limit] of bytes, or of pixels when [pixels]. */
class ComponentImageTooLargeException(val limit: Long, val pixels: Boolean) : RuntimeException(
    if (pixels) "A picture of the component has more than $limit pixels" else "A picture of the component has more than $limit bytes",
)

/**
 * Checks what a browser sends as a component of a library: a `<mxGraphModel>` of draw.io, as CoDraw copies cells, whose
 * pictures are inside it. The backend keeps it as it came and gives it back for pasting onto boards, so nothing in it
 * may reach outside: the pictures of boards are not the library's, and a picture is shown to whoever pastes it.
 */
object ComponentContents {

    /** The largest preview, in bytes of the PNG. */
    const val PREVIEW_MAX_BYTES = 128 * 1024

    /** The largest width and height of a preview, in pixels. */
    const val PREVIEW_MAX_SIDE = 256

    /** A picture written into a style as draw.io writes it, `data:image/png,<base64>`, or with `;base64` elsewhere. */
    private val DATA_IMAGE = Regex("^data:image/([a-z0-9.+-]+)(;base64)?,(.*)$", setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL))

    private val BASE64 = Regex("^[A-Za-z0-9+/=\\s]*$")

    private val PREVIEW = Regex("^data:image/png;base64,([A-Za-z0-9+/]*={0,2})$")

    private val RASTER_TYPES = mapOf(
        "png" to ImageType.PNG,
        "jpeg" to ImageType.JPEG,
        "jpg" to ImageType.JPEG,
        "gif" to ImageType.GIF,
        "webp" to ImageType.WEBP,
    )

    /**
     * Throws [InvalidComponentException] unless [content] is a `<mxGraphModel>` with a `<root>` and at least one shape or
     * edge, and for a picture of a style (`image=`) that is neither inside it nor at an address of another site.
     * Throws [UnsupportedComponentImageException] for a picture inside it that is no raster image of the type it claims
     * nor a safe SVG ([SvgIcons]), and [ComponentImageTooLargeException] for one larger than [imageLimit] bytes or
     * [ImageFormats.MAX_PIXELS].
     */
    fun check(content: String, imageLimit: Long) {
        val document = try {
            secureXmlParser(namespaceAware = false).parse(InputSource(StringReader(content)))
        } catch (_: Exception) {
            throw InvalidComponentException("The content is no XML document without DTD")
        }
        val model = document.documentElement
        if (model.tagName != "mxGraphModel" || model.childElements().none { it.tagName == "root" }) {
            throw InvalidComponentException("The content is no <mxGraphModel> of draw.io")
        }
        val elements = model.descendants()
        if (elements.none { it.tagName == "mxCell" && (it.getAttribute("vertex") == "1" || it.getAttribute("edge") == "1") }) {
            throw InvalidComponentException("The component has no shapes and no edges")
        }
        val pictures = elements.filter { it.hasAttribute("style") }.mapNotNull { imageOf(it.getAttribute("style")) }.toSet()
        pictures.forEach { checkPicture(it, imageLimit) }
    }

    /** Throws [InvalidComponentException] unless [preview] is a PNG as a `data:` address, small in bytes and pixels. */
    fun checkPreview(preview: String) {
        val data = PREVIEW.matchEntire(preview)?.groupValues?.get(1)
            ?.takeIf { it.length <= (PREVIEW_MAX_BYTES + 2) / 3 * 4 }
            ?: throw InvalidComponentException("The preview is no small PNG as a data: address")
        val bytes = Base64.getDecoder().decode(data)
        val info = ImageFormats.sniff(bytes)
        if (bytes.size > PREVIEW_MAX_BYTES || info?.type != ImageType.PNG || info.width > PREVIEW_MAX_SIDE || info.height > PREVIEW_MAX_SIDE) {
            throw InvalidComponentException("The preview is no PNG of at most $PREVIEW_MAX_SIDE × $PREVIEW_MAX_SIDE pixels")
        }
    }

    /** The value of the key `image` of a style of draw.io, `key=value` pairs separated by `;`. */
    private fun imageOf(style: String): String? = style.split(';').firstNotNullOfOrNull { entry ->
        val separator = entry.indexOf('=')
        if (separator > 0 && entry.substring(0, separator).trim() == "image") entry.substring(separator + 1).trim() else null
    }?.takeIf { it.isNotEmpty() }

    private fun checkPicture(url: String, imageLimit: Long) {
        // Addresses of other sites stay, as in files of draw.io: browsers do not show them on CoDraw, nobody fetches them.
        if (url.startsWith("https://", ignoreCase = true) || url.startsWith("http://", ignoreCase = true)) return
        if (!url.startsWith("data:", ignoreCase = true)) {
            throw InvalidComponentException("A picture of the component is not inside it: ${url.take(100)}")
        }
        val match = DATA_IMAGE.matchEntire(url) ?: throw UnsupportedComponentImageException("A picture of the component is no image")
        val type = match.groupValues[1].lowercase()
        val payload = match.groupValues[3]
        val base64 = match.groupValues[2].isNotEmpty() || BASE64.matches(payload)
        if (type == "svg+xml") {
            val bytes = (if (base64) decodeBase64(payload) else percentDecode(payload))
                ?: throw UnsupportedComponentImageException("An SVG picture of the component cannot be decoded")
            if (bytes.size > imageLimit) throw ComponentImageTooLargeException(imageLimit, pixels = false)
            if (!SvgIcons.isSafe(bytes)) throw UnsupportedComponentImageException("An SVG picture of the component is not safe")
            return
        }
        val expected = RASTER_TYPES[type] ?: throw UnsupportedComponentImageException("A picture of the component is image/$type")
        val bytes = (if (base64) decodeBase64(payload) else null)
            ?: throw UnsupportedComponentImageException("A picture of the component cannot be decoded")
        if (bytes.size > imageLimit) throw ComponentImageTooLargeException(imageLimit, pixels = false)
        val info = ImageFormats.sniff(bytes)
        if (info?.type != expected) throw UnsupportedComponentImageException("A picture of the component is no image/$type")
        if (info.pixels > ImageFormats.MAX_PIXELS) throw ComponentImageTooLargeException(ImageFormats.MAX_PIXELS, pixels = true)
    }

    private fun decodeBase64(text: String): ByteArray? = try {
        Base64.getMimeDecoder().decode(text)
    } catch (_: IllegalArgumentException) {
        null
    }

    /** `%XX` as bytes, anything else as its UTF-8; unlike decoding a form, `+` stays `+`. `null` for a broken `%`. */
    private fun percentDecode(text: String): ByteArray? {
        val out = ByteArrayOutputStream(text.length)
        var index = 0
        while (index < text.length) {
            val char = text[index]
            if (char == '%') {
                val byte = text.substring(index + 1, minOf(index + 3, text.length)).takeIf { it.length == 2 }?.toIntOrNull(16) ?: return null
                out.write(byte)
                index += 3
            } else {
                val end = text.indexOf('%', index).let { if (it < 0) text.length else it }
                out.writeBytes(text.substring(index, end).toByteArray(Charsets.UTF_8))
                index = end
            }
        }
        return out.toByteArray()
    }

    private fun Element.childElements(): List<Element> =
        (0 until childNodes.length).map(childNodes::item).filterIsInstance<Element>()

    private fun Element.descendants(): List<Element> {
        val nodes = getElementsByTagName("*")
        return (0 until nodes.length).map { nodes.item(it) as Element }
    }
}
