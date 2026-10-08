package io.github.thescarletarrow.codraw.library

import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class SvgIconsTest {

    private fun safe(svg: String) = SvgIcons.isSafe(svg.toByteArray())

    @Test
    fun `an icon with paths, gradients, styles, links inside it and an embedded raster picture is safe`() {
        assertTrue(
            safe(
                """
                <?xml version="1.0" encoding="UTF-8"?>
                <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="24" height="24"
                     viewBox="0 0 24 24" xml:space="preserve">
                  <title>Логотип</title>
                  <defs>
                    <linearGradient id="g"><stop offset="0" stop-color="#f00"/></linearGradient>
                    <style>.a { fill: url(#g); }</style>
                    <path id="p" d="M0 0h24v24H0z"/>
                  </defs>
                  <use xlink:href="#p" class="a"/>
                  <use href="#p" style="fill: url('#g')"/>
                  <use href="#p" fill="url( '#g')" stroke="url(  #g)"/>
                  <image width="4" height="4" href="data:image/png;base64,iVBORw0KGgo="/>
                </svg>
                """.trimIndent(),
            ),
        )
    }

    @ParameterizedTest
    @ValueSource(
        strings = [
            """<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>""",
            """<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>""",
            """<svg xmlns="http://www.w3.org/2000/svg"><rect ONCLICK="alert(1)"/></svg>""",
            """<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml"/></foreignObject></svg>""",
            """<svg xmlns="http://www.w3.org/2000/svg"><set attributeName="fill" to="red"/></svg>""",
            """<svg xmlns="http://www.w3.org/2000/svg"><animate attributeName="x" to="1"/></svg>""",
            """<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/a.png"/></svg>""",
            """<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="other.svg#a"/></svg>""",
            """<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><rect/></a></svg>""",
            """<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/svg+xml;base64,PHN2Zz4="/></svg>""",
            """<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill: url(https://example.com/x)"/></svg>""",
            """<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(https://example.com/a.css);</style></svg>""",
            """<svg xmlns="http://www.w3.org/2000/svg"><rect fill="url(https://example.com/#g)"/></svg>""",
            """<svg xmlns="http://www.w3.org/2000/svg"><rect style="background-image: u\72l(https://example.com/x)"/></svg>""",
            """<svg xmlns="http://www.w3.org/2000/svg"><style>@\69mport "https://example.com/a.css";</style></svg>""",
            """<svg xmlns="http://www.w3.org/2000/svg"><rect style="cursor: -webkit-image-set('https://example.com/x' 1x)"/></svg>""",
            """<svg xmlns="http://www.w3.org/2000/svg"><rect fill="u\72l(https://example.com/x)"/></svg>""",
            "<svg xmlns=\"http://www.w3.org/2000/svg\"><rect fill=\"url(\u00A0#g)\"/></svg>",
            """<svg xmlns="http://www.w3.org/2000/svg" xmlns:i="https://inkscape.org"><i:meta/></svg>""",
            """<svg xmlns="http://www.w3.org/2000/svg" xmlns:i="https://inkscape.org" i:label="x"/>""",
            """<?xml-stylesheet href="https://example.com/a.css"?><svg xmlns="http://www.w3.org/2000/svg"/>""",
            """<!DOCTYPE svg [<!ENTITY a "aaaa">]><svg xmlns="http://www.w3.org/2000/svg"><text>&a;</text></svg>""",
            """<svg><rect/></svg>""",
            """<html xmlns="http://www.w3.org/1999/xhtml"/>""",
            """<svg xmlns="http://www.w3.org/2000/svg">""",
        ],
    )
    fun `scripts, handlers, other documents, animations, outside references, other namespaces and DTD are not safe`(svg: String) {
        assertFalse(safe(svg))
    }
}
