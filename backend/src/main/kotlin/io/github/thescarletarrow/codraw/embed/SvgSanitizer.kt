package io.github.thescarletarrow.codraw.embed

import org.w3c.dom.Element
import org.w3c.dom.Node
import org.xml.sax.InputSource
import java.io.StringReader
import java.io.StringWriter
import javax.xml.XMLConstants
import javax.xml.parsers.DocumentBuilderFactory
import javax.xml.transform.OutputKeys
import javax.xml.transform.TransformerFactory
import javax.xml.transform.dom.DOMSource
import javax.xml.transform.stream.StreamResult

/** The image is not an SVG document that can be cleaned. */
class InvalidSvgException(message: String) : RuntimeException(message)

/**
 * Keeps of an SVG image only what draws a diagram: elements and attributes of an allowlist, links within the image and
 * to embedded raster images. Scripts, handlers of events, styles with external addresses and anything unknown go.
 */
object SvgSanitizer {

    private const val SVG = "http://www.w3.org/2000/svg"
    private const val XHTML = "http://www.w3.org/1999/xhtml"
    private const val XLINK = "http://www.w3.org/1999/xlink"

    private val SVG_ELEMENTS = setOf(
        "svg", "g", "defs", "title", "desc", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text",
        "tspan", "textPath", "image", "use", "symbol", "marker", "linearGradient", "radialGradient", "stop", "clipPath",
        "mask", "pattern", "filter", "feGaussianBlur", "feOffset", "feBlend", "feFlood", "feComposite", "feMerge",
        "feMergeNode", "feColorMatrix", "switch", "foreignObject",
    )

    /** Labels of maxGraph in HTML, inside `foreignObject`. */
    private val XHTML_ELEMENTS = setOf("div", "span", "br", "b", "strong", "i", "em", "u", "font", "p", "sub", "sup")

    private val ATTRIBUTES = setOf(
        "id", "class", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "width", "height", "d", "points",
        "transform", "viewBox", "preserveAspectRatio", "version", "fill", "fill-opacity", "fill-rule", "stroke",
        "stroke-width", "stroke-opacity", "stroke-dasharray", "stroke-dashoffset", "stroke-linecap", "stroke-linejoin",
        "stroke-miterlimit", "opacity", "visibility", "display", "font-family", "font-size", "font-weight",
        "font-style", "text-decoration", "text-anchor", "dominant-baseline", "alignment-baseline", "letter-spacing",
        "word-spacing", "white-space", "xml:space", "dx", "dy", "rotate", "textLength", "lengthAdjust", "offset",
        "stop-color", "stop-opacity", "gradientUnits", "gradientTransform", "spreadMethod", "fx", "fy", "markerWidth",
        "markerHeight", "markerUnits", "refX", "refY", "orient", "clip-path", "clipPathUnits", "mask", "maskUnits",
        "maskContentUnits", "patternUnits", "patternContentUnits", "patternTransform", "filter", "filterUnits",
        "stdDeviation", "in", "in2", "result", "mode", "operator", "values", "type", "flood-color", "flood-opacity",
        "style", "pointer-events", "requiredFeatures", "overflow", "href", "color", "face", "size", "align",
        "marker-start", "marker-mid", "marker-end", "shape-rendering", "text-rendering", "image-rendering",
    )

    private val EMBEDDED_IMAGE = Regex("^data:image/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=\\s]*$")

    /** A reference in a style to anything but an element of the image, or a way to run code. */
    private val UNSAFE_STYLE = Regex("url\\(\\s*['\"]?\\s*(?!#)|expression\\s*\\(|@import|javascript:|behavior\\s*:", RegexOption.IGNORE_CASE)

    /** Attributes whose value may be a reference to an element: `url(#id)` is all they may hold. */
    private val UNSAFE_REFERENCE = Regex("url\\(\\s*['\"]?\\s*(?!#)", RegexOption.IGNORE_CASE)

    fun sanitize(svg: String): String {
        val document = try {
            factory().newDocumentBuilder().parse(InputSource(StringReader(svg)))
        } catch (exception: Exception) {
            throw InvalidSvgException("Not an XML document: ${exception.message}")
        }
        val root = document.documentElement
        if (root.namespaceURI != SVG || root.localName != "svg") throw InvalidSvgException("The root is not <svg>")
        clean(root)
        return serialize(root)
    }

    private fun factory() = DocumentBuilderFactory.newInstance().apply {
        isNamespaceAware = true
        isExpandEntityReferences = false
        isXIncludeAware = false
        setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true)
        setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)
        setFeature("http://xml.org/sax/features/external-general-entities", false)
        setFeature("http://xml.org/sax/features/external-parameter-entities", false)
        setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false)
    }

    private fun allowed(element: Element): Boolean = when (element.namespaceURI) {
        SVG -> element.localName in SVG_ELEMENTS
        XHTML -> element.localName in XHTML_ELEMENTS && hasForeignAncestor(element)
        else -> false
    }

    private fun hasForeignAncestor(element: Element): Boolean {
        var parent = element.parentNode
        while (parent is Element) {
            if (parent.namespaceURI == SVG && parent.localName == "foreignObject") return true
            parent = parent.parentNode
        }
        return false
    }

    private fun clean(element: Element) {
        cleanAttributes(element)
        for (child in element.childNodes.toList()) {
            when (child.nodeType) {
                Node.ELEMENT_NODE -> {
                    val childElement = child as Element
                    if (allowed(childElement)) clean(childElement) else element.removeChild(child)
                }
                Node.TEXT_NODE, Node.CDATA_SECTION_NODE -> Unit
                // Comments and processing instructions draw nothing.
                else -> element.removeChild(child)
            }
        }
    }

    private fun cleanAttributes(element: Element) {
        val attributes = element.attributes
        for (index in attributes.length - 1 downTo 0) {
            val attribute = attributes.item(index)
            val name = attribute.localName ?: attribute.nodeName
            val value = attribute.nodeValue
            val keep = when {
                attribute.namespaceURI == XMLConstants.XMLNS_ATTRIBUTE_NS_URI -> true
                attribute.namespaceURI == XLINK -> name == "href" && safeLink(element, value)
                attribute.namespaceURI != null && attribute.namespaceURI != XMLConstants.XML_NS_URI -> false
                attribute.nodeName == "xml:space" -> true
                name !in ATTRIBUTES -> false
                name == "href" -> safeLink(element, value)
                name == "style" -> !UNSAFE_STYLE.containsMatchIn(value)
                else -> !UNSAFE_REFERENCE.containsMatchIn(value) && !value.trim().startsWith("javascript:", ignoreCase = true)
            }
            if (!keep) element.removeAttributeNode(attribute as org.w3c.dom.Attr)
        }
    }

    /** A link within the image, or an image embedded into it. */
    private fun safeLink(element: Element, value: String): Boolean {
        val link = value.trim()
        return link.startsWith("#") || (element.localName == "image" && EMBEDDED_IMAGE.matches(link))
    }

    private fun serialize(root: Element): String {
        val transformer = TransformerFactory.newInstance().apply {
            setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true)
        }.newTransformer()
        transformer.setOutputProperty(OutputKeys.OMIT_XML_DECLARATION, "no")
        transformer.setOutputProperty(OutputKeys.ENCODING, "UTF-8")
        val writer = StringWriter()
        transformer.transform(DOMSource(root), StreamResult(writer))
        return writer.toString()
    }

    private fun org.w3c.dom.NodeList.toList(): List<Node> = (0 until length).map(::item)
}
