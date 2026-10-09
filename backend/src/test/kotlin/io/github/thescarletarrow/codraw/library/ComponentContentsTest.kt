package io.github.thescarletarrow.codraw.library

import io.github.thescarletarrow.codraw.image.ImageFormats
import io.github.thescarletarrow.codraw.image.ImageFormatsTest.Companion.encoded
import io.github.thescarletarrow.codraw.image.ImageFormatsTest.Companion.png
import java.net.URLEncoder
import java.util.Base64
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class ComponentContentsTest {

    private val limit = 1024L

    @Test
    fun `a diagram of draw io with shapes, an edge, objects with properties and pictures inside or at other sites is fit`() {
        val logo = base64(png(10, 10))
        val icon = base64("""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><rect width="2" height="2"/></svg>""")
        val encodedIcon = URLEncoder.encode("""<svg xmlns="http://www.w3.org/2000/svg"><path d="M0+0"/></svg>""", "UTF-8").replace("+", "%20")

        ComponentContents.check(
            model(
                cell("2", "rounded=1;fillColor=#dae8fc;"),
                """<object id="3" label="API" codrawKind="container"><mxCell style="shape=image;image=data:image/png,$logo;" vertex="1" parent="1"><mxGeometry width="10" height="10" as="geometry"/></mxCell></object>""",
                cell("4", "shape=image;image=data:image/svg+xml,$icon;aspect=fixed;"),
                cell("5", "shape=image;image=data:image/svg+xml,$encodedIcon;"),
                cell("6", "shape=image;image=https://example.com/logo.png;"),
                """<mxCell id="7" edge="1" parent="1" source="2" target="4" style="endArrow=classic;"><mxGeometry relative="1" as="geometry"/></mxCell>""",
            ),
            limit,
        )
    }

    @Test
    fun `content that is no diagram of draw io, or a diagram without shapes and edges, is refused`() {
        for (content in listOf(
            "",
            "not xml",
            "<mxGraphModel><root>",
            "<svg/>",
            "<mxGraphModel/>",
            """<mxfile><diagram><mxGraphModel><root><mxCell id="2" vertex="1"/></root></mxGraphModel></diagram></mxfile>""",
            model(),
            """<!DOCTYPE m [<!ENTITY e SYSTEM "file:///etc/passwd">]><mxGraphModel><root><mxCell id="2" vertex="1" value="&e;"/></root></mxGraphModel>""",
        )) {
            assertFailsWith<InvalidComponentException>(content) { ComponentContents.check(content, limit) }
        }
    }

    @Test
    fun `a picture of a board or of the site, or another address, is refused as outside the component`() {
        for (image in listOf(
            "/api/boards/0199a000-0000-7000-8000-000000000001/images/0199a000-0000-7000-8000-000000000002",
            "https://codraw.example/api/boards/0199a000-0000-7000-8000-000000000001/images/0199a000-0000-7000-8000-000000000002",
            "blob:https://codraw.example/1",
            "javascript:alert(1)",
            "img/lib/logo.svg",
        )) {
            assertFailsWith<InvalidComponentException>(image) { ComponentContents.check(model(cell("2", "shape=image;image=$image;")), limit) }
        }
        // The picture of the indicator of a label is a picture too.
        assertFailsWith<InvalidComponentException> {
            ComponentContents.check(model(cell("2", "shape=label;indicatorImage=img/lib/logo.svg;")), limit)
        }
    }

    @Test
    fun `a picture that is not what its type says, of another type, or an unsafe SVG is unsupported`() {
        val html = base64("<!doctype html><script>alert(1)</script>")
        val script = base64("""<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>""")
        for (image in listOf(
            "data:image/png,$html",
            "data:image/jpeg,${base64(png(4, 4))}",
            "data:image/bmp,${base64(png(4, 4))}",
            "data:text/html,$html",
            "data:image/svg+xml,$script",
            "data:image/png",
        )) {
            assertFailsWith<UnsupportedComponentImageException>(image) { ComponentContents.check(model(cell("2", "image=$image;")), limit) }
        }
    }

    @Test
    fun `every picture of a style is checked, a key given twice too, whose last value the browser reads`() {
        val script = base64("""<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>""")

        assertFailsWith<UnsupportedComponentImageException> {
            ComponentContents.check(model(cell("2", "shape=image;image=https://example.com/a.png;image=data:image/svg+xml,$script;")), limit)
        }
        assertFailsWith<UnsupportedComponentImageException> {
            ComponentContents.check(model(cell("2", "shape=label;indicatorImage=data:image/svg+xml,$script;")), limit)
        }
    }

    @Test
    fun `a picture above the limit of bytes or of pixels is too large`() {
        val large = assertFailsWith<ComponentImageTooLargeException> {
            ComponentContents.check(model(cell("2", "image=data:image/png,${base64(png(4, 4, ByteArray(2000)))};")), limit)
        }
        assertEquals(limit, large.limit)
        assertEquals(false, large.pixels)

        val bomb = assertFailsWith<ComponentImageTooLargeException> {
            ComponentContents.check(model(cell("2", "image=data:image/png,${base64(png(20_000, 20_000))};")), limit)
        }
        assertEquals(ImageFormats.MAX_PIXELS, bomb.limit)
        assertEquals(true, bomb.pixels)

        val svg = """<svg xmlns="http://www.w3.org/2000/svg"><desc>${"x".repeat(2000)}</desc></svg>"""
        assertFailsWith<ComponentImageTooLargeException> { ComponentContents.check(model(cell("2", "image=data:image/svg+xml,${base64(svg)};")), limit) }
    }

    @Test
    fun `a preview is a small PNG as a data address`() {
        ComponentContents.checkPreview("data:image/png;base64,${base64(encoded("png", 192, 144))}")

        for (preview in listOf(
            "data:image/png;base64,${base64(encoded("png", 300, 10))}",
            "data:image/jpeg;base64,${base64(encoded("jpg", 10, 10))}",
            "data:image/png;base64,${base64("<svg/>")}",
            "data:image/png;base64,${base64(png(10, 10, ByteArray(ComponentContents.PREVIEW_MAX_BYTES)))}",
            "data:image/png;base64,not base64!",
            "data:image/png;base64,A",
            "data:image/png;base64,AB=",
            "https://example.com/preview.png",
        )) {
            assertFailsWith<InvalidComponentException>(preview.take(60)) { ComponentContents.checkPreview(preview) }
        }
    }

    private fun base64(bytes: ByteArray) = Base64.getEncoder().encodeToString(bytes)

    private fun base64(text: String) = base64(text.toByteArray())

    private fun cell(id: String, style: String) =
        """<mxCell id="$id" value="" style="$style" vertex="1" parent="1"><mxGeometry width="10" height="10" as="geometry"/></mxCell>"""

    private fun model(vararg cells: String) =
        """<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells.joinToString("")}</root></mxGraphModel>"""
}
