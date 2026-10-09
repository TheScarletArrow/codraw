package io.github.thescarletarrow.codraw.library

import org.xml.sax.ErrorHandler
import org.xml.sax.SAXParseException
import javax.xml.XMLConstants
import javax.xml.parsers.DocumentBuilder
import javax.xml.parsers.DocumentBuilderFactory

/**
 * A parser of XML that a user sent: no DTD, so no entities that expand into gigabytes or read files, nothing loaded
 * from elsewhere, and errors thrown instead of printed.
 */
fun secureXmlParser(namespaceAware: Boolean): DocumentBuilder = DocumentBuilderFactory.newInstance().apply {
    isNamespaceAware = namespaceAware
    isExpandEntityReferences = false
    isXIncludeAware = false
    setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true)
    setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)
    setFeature("http://xml.org/sax/features/external-general-entities", false)
    setFeature("http://xml.org/sax/features/external-parameter-entities", false)
    setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false)
}.newDocumentBuilder().apply { setErrorHandler(THROWING) }

private val THROWING = object : ErrorHandler {
    override fun warning(exception: SAXParseException) = Unit

    override fun error(exception: SAXParseException) = throw exception

    override fun fatalError(exception: SAXParseException) = throw exception
}
