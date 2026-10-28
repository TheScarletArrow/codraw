package io.github.thescarletarrow.codraw

import org.xml.sax.ErrorHandler
import org.xml.sax.SAXParseException
import javax.xml.XMLConstants
import javax.xml.parsers.DocumentBuilder
import javax.xml.parsers.DocumentBuilderFactory
import javax.xml.transform.Transformer
import javax.xml.transform.TransformerFactory

// CodeQL (java/xxe) takes a factory for safe only by calls whose receiver is a plain variable. So the factories live in
// variables, not in `apply`, and their types are declared: a variable of the platform type `DocumentBuilderFactory!`
// that `newInstance()` returns gets an implicit not-null check around every call on it, which hides the variable.

/**
 * A parser of XML that a user sent: no DTD, so no entities that expand into gigabytes or read files, nothing loaded
 * from elsewhere, and errors thrown instead of printed.
 */
fun secureXmlParser(namespaceAware: Boolean): DocumentBuilder {
    val factory: DocumentBuilderFactory = DocumentBuilderFactory.newInstance()
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
    val parser: DocumentBuilder = factory.newDocumentBuilder()
    parser.setErrorHandler(THROWING)
    return parser
}

/** A transformer that writes a document out as it is and loads no DTD or stylesheet from elsewhere. */
fun secureXmlTransformer(): Transformer {
    val factory: TransformerFactory = TransformerFactory.newInstance()
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
