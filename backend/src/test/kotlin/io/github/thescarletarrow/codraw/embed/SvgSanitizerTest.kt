package io.github.thescarletarrow.codraw.embed

import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import kotlin.test.assertContains
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse

class SvgSanitizerTest {

    private fun svg(body: String) =
        """<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100" height="50">$body</svg>"""

    @Test
    fun `keeps what a diagram is drawn with`() {
        val clean = SvgSanitizer.sanitize(
            svg(
                """
                <defs><marker id="arrow"><path d="M0,0 L10,5 Z" fill="#000"/></marker></defs>
                <g transform="translate(10,10)">
                  <rect x="0" y="0" width="80" height="30" rx="4" fill="#fff" stroke="#000" stroke-dasharray="8 4"/>
                  <path d="M0 0 L50 50" marker-end="url(#arrow)" stroke-width="2"/>
                  <text x="10" y="20" font-size="12" text-anchor="middle">Платежи &amp; заказы</text>
                  <use href="#arrow"/>
                </g>
                """,
            ),
        )

        assertContains(clean, "<rect")
        assertContains(clean, "stroke-dasharray=\"8 4\"")
        assertContains(clean, "marker-end=\"url(#arrow)\"")
        assertContains(clean, "Платежи &amp; заказы")
        assertContains(clean, "href=\"#arrow\"")
    }

    @Test
    fun `keeps gradients, shadows and rounded corners of shapes as maxGraph draws them`() {
        val clean = SvgSanitizer.sanitize(
            svg(
                """
                <defs><linearGradient x1="0%" y1="0%" x2="100%" y2="0%" id="mx-gradient-ffffff-1-dae8fc-1-e-1">
                  <stop offset="0%" style="stop-color:#ffffff"/><stop offset="100%" style="stop-color:#dae8fc"/>
                </linearGradient></defs>
                <rect x="10.5" y="10.5" width="120" height="60" rx="9" ry="9" fill="#000000" stroke="#000000" transform="translate(2,3)" opacity="0.25"/>
                <rect x="10.5" y="10.5" width="120" height="60" rx="9" ry="9" fill="url(#mx-gradient-ffffff-1-dae8fc-1-e-1)" stroke="#1f2328"/>
                """,
            ),
        )

        assertContains(clean, "<linearGradient")
        assertContains(clean, "x2=\"100%\"")
        assertContains(clean, "style=\"stop-color:#dae8fc\"")
        assertContains(clean, "fill=\"url(#mx-gradient-ffffff-1-dae8fc-1-e-1)\"")
        assertContains(clean, "transform=\"translate(2,3)\"")
        assertContains(clean, "opacity=\"0.25\"")
        assertContains(clean, "rx=\"9\"")
    }

    @Test
    fun `keeps labels in HTML inside foreignObject`() {
        val clean = SvgSanitizer.sanitize(
            svg(
                """
                <switch><foreignObject width="100" height="20" requiredFeatures="http://www.w3.org/TR/SVG11/feature#Extensibility">
                  <div xmlns="http://www.w3.org/1999/xhtml" style="display: flex; color: #333">Сервис<br/>оплаты</div>
                </foreignObject><text x="0" y="10">Сервис оплаты</text></switch>
                """,
            ),
        )

        assertContains(clean, "foreignObject")
        assertContains(clean, "Сервис")
        assertContains(clean, "style=\"display: flex; color: #333\"")
    }

    @Test
    fun `drops scripts, handlers, styles, external links and unknown elements`() {
        val clean = SvgSanitizer.sanitize(
            svg(
                """
                <script>alert(1)</script>
                <style>@import url(https://evil.example/x.css);</style>
                <rect width="10" height="10" onload="alert(2)" onclick="alert(3)" fill="url(https://evil.example/p)"/>
                <image href="https://evil.example/track.png" width="1" height="1"/>
                <image xlink:href="javascript:alert(4)" width="1" height="1"/>
                <a href="https://evil.example"><text>link</text></a>
                <g style="background: url(https://evil.example/bg.png)"><circle r="3"/></g>
                <foreignObject><div xmlns="http://www.w3.org/1999/xhtml"><img src="https://evil.example/x.png"/><iframe src="https://evil.example"/></div></foreignObject>
                <!-- a comment -->
                """,
            ),
        )

        for (unsafe in listOf("script", "alert", "<style", "onload", "onclick", "evil.example", "javascript:", "<a ", "<img", "iframe", "comment")) {
            assertFalse(unsafe in clean, "$unsafe in $clean")
        }
        assertContains(clean, "<circle")
    }

    @Test
    fun `keeps raster images embedded into the image`() {
        val clean = SvgSanitizer.sanitize(svg("""<image href="data:image/png;base64,iVBORw0KGgo=" width="1" height="1"/>"""))

        assertContains(clean, "data:image/png;base64,iVBORw0KGgo=")
    }

    @ParameterizedTest
    @ValueSource(
        strings = [
            """<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg">&xxe;</svg>""",
            """<html xmlns="http://www.w3.org/1999/xhtml"><body/></html>""",
            """<svg>no namespace</svg>""",
            """not xml at all""",
        ],
    )
    fun `refuses what is not a plain SVG document`(input: String) {
        assertFailsWith<InvalidSvgException> { SvgSanitizer.sanitize(input) }
    }
}
