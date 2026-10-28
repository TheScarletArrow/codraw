package io.github.thescarletarrow.codraw

import org.xml.sax.ErrorHandler
import org.xml.sax.SAXParseException
import javax.xml.XMLConstants
import javax.xml.parsers.DocumentBuilder
import javax.xml.parsers.DocumentBuilderFactory
import javax.xml.transform.Transformer
import javax.xml.transform.TransformerFactory

// The factories are set up through local variables, not in `apply`: CodeQL (java/xxe) takes a factory for safe only by
// calls on a variable, and reports a parser set up in a lambda as resolving external entities.

/**
 * A parser of XML that a user sent: no DTD, so no entities that expand into gigabytes or read files, nothing loaded
 * from elsewhere, and errors thrown instead of printed.
 */
fun secureXmlParser(namespaceAware: Boolean): DocumentBuilder {
    val factory = DocumentBuilderFactory.newInstance()
    factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)
    factory.setFeature("http://xml.org/sax/features/external-general-entities", false)
    factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false)
    factory.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false)
    factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true)
    factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "")
    factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "")
    factory.isNamespaceAware = namespaceAware
    factory.isExpandEntityReferences = false
    factory.isXIncludeAware = false
    val parser = factory.newDocumentBuilder()
    parser.setErrorHandler(THROWING)
    return parser
}

/** A transformer that writes a document out as it is and loads no DTD or stylesheet from elsewhere. */
fun secureXmlTransformer(): Transformer {
    val factory = TransformerFactory.newInstance()
    factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true)
    factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "")
    factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_STYLESHEET, "")
    return factory.newTransformer()
}

private val THROWING = object : ErrorHandler {
    override fun warning(exception: SAXParseException) = Unit

    override fun error(exception: SAXParseException) = throw exception

    override fun fatalError(exception: SAXParseException) = throw exception
}
