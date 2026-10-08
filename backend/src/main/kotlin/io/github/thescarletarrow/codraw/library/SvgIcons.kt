package io.github.thescarletarrow.codraw.library

import org.w3c.dom.Element
import org.w3c.dom.Node
import java.io.ByteArrayInputStream
import javax.xml.XMLConstants

/**
 * Tells SVG pictures that a library may keep: an SVG document without DTD that draws only itself. The browser cleans
 * a file before it adds it to a library; this refuses what a request brings uncleaned, rather than changing a picture
 * behind the back of its author. Unlike the cleaning of live images (`SvgSanitizer`), no `foreignObject`: icons have
 * no labels of maxGraph.
 */
object SvgIcons {

    private const val SVG = "http://www.w3.org/2000/svg"
    private const val XLINK = "http://www.w3.org/1999/xlink"

    /** Elements that run code, show other documents or change the picture over time. */
    private val FORBIDDEN = setOf("script", "foreignObject", "set", "animate", "animateColor", "animateMotion", "animateTransform", "discard")

    private val EMBEDDED_IMAGE = Regex("^data:image/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=\\s]*$", RegexOption.IGNORE_CASE)

    /** The spaces of CSS; other Unicode spaces are no spaces there. */
    private const val SPACE = "[ \\t\\n\\r\\f]"

    /** `url(` of anything but an element of the picture: the quantifiers give nothing back, so `url('#a')` is fine. */
    private const val OUTSIDE_URL = "url\\($SPACE*+['\"]?+$SPACE*+(?!#)"

    /**
     * A reference in a style to anything but an element of the picture, a way to run code, or an escape of CSS, which
     * could hide either.
     */
    private val UNSAFE_STYLE = Regex(
        "$OUTSIDE_URL|expression$SPACE*\\(|@import|javascript:|behavior$SPACE*:|image-set$SPACE*\\(|\\bsrc$SPACE*\\(|\\\\",
        RegexOption.IGNORE_CASE,
    )

    /** Attributes whose value may be a reference to an element: `url(#id)` is all they may hold, and no escape of CSS. */
    private val UNSAFE_REFERENCE = Regex("$OUTSIDE_URL|image-set$SPACE*\\(|\\\\", RegexOption.IGNORE_CASE)

    /**
     * The bytes are an SVG document whose root is `<svg>`, without DTD and processing instructions, of SVG elements only,
     * none of which runs code, shows another document or animates, without handlers of events, attributes of other
     * namespaces, links outside the picture but to raster pictures inside it, and styles that reach outside.
     */
    fun isSafe(svg: ByteArray): Boolean {
        val document = try {
            secureXmlParser(namespaceAware = true).parse(ByteArrayInputStream(svg))
        } catch (_: Exception) {
            return false
        }
        // E.g. <?xml-stylesheet?>, which would load a style from elsewhere.
        if (document.childNodes.toList().any { it.nodeType == Node.PROCESSING_INSTRUCTION_NODE }) return false
        val root = document.documentElement
        return root.namespaceURI == SVG && root.localName == "svg" && safe(root)
    }

    private fun safe(element: Element): Boolean {
        if (element.namespaceURI != SVG || element.localName in FORBIDDEN || !safeAttributes(element)) return false
        if (element.localName == "style" && UNSAFE_STYLE.containsMatchIn(element.textContent)) return false
        return element.childNodes.toList().all { child ->
            when (child.nodeType) {
                Node.ELEMENT_NODE -> safe(child as Element)
                Node.PROCESSING_INSTRUCTION_NODE -> false
                else -> true
            }
        }
    }

    private fun safeAttributes(element: Element): Boolean {
        val attributes = element.attributes
        return (0 until attributes.length).map(attributes::item).all { attribute ->
            val name = attribute.localName ?: attribute.nodeName
            val value = attribute.nodeValue
            when {
                attribute.namespaceURI == XMLConstants.XMLNS_ATTRIBUTE_NS_URI -> true
                name.startsWith("on", ignoreCase = true) -> false
                attribute.namespaceURI == XLINK -> name == "href" && safeLink(element, value)
                attribute.namespaceURI == XMLConstants.XML_NS_URI -> true
                attribute.namespaceURI != null -> false
                name == "href" -> safeLink(element, value)
                name == "style" -> !UNSAFE_STYLE.containsMatchIn(value)
                else -> !UNSAFE_REFERENCE.containsMatchIn(value) && !value.trim().startsWith("javascript:", ignoreCase = true)
            }
        }
    }

    /** A link within the picture, or a raster picture embedded into it. */
    private fun safeLink(element: Element, value: String): Boolean {
        val link = value.trim()
        return link.startsWith("#") || (element.localName == "image" && EMBEDDED_IMAGE.matches(link))
    }

    private fun org.w3c.dom.NodeList.toList(): List<Node> = (0 until length).map(::item)
}
