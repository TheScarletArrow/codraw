package io.github.thescarletarrow.codraw.issue

import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import tools.jackson.databind.json.JsonMapper
import java.net.InetAddress
import java.net.InetSocketAddress
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

class GitHubClientTest {

    /** A server on this machine that answers each request with the next of [answers] and keeps what it got. */
    private class Server(vararg answers: (HttpExchange) -> Unit) : AutoCloseable {
        private val queue = ArrayDeque(answers.toList())
        val paths = CopyOnWriteArrayList<String>()
        val tokens = CopyOnWriteArrayList<String?>()
        private val server = HttpServer.create(InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0).apply {
            createContext("/") { exchange ->
                paths += exchange.requestURI.path
                tokens += exchange.requestHeaders.getFirst("Authorization")
                exchange.use {
                    val answer = synchronized(queue) { queue.removeFirstOrNull() }
                    if (answer != null) answer(it) else it.sendResponseHeaders(404, -1)
                }
            }
            start()
        }
        val url: String
            get() = "http://localhost:${server.address.port}"

        override fun close() = server.stop(0)
    }

    private val servers = mutableListOf<Server>()

    @AfterEach
    fun stop() = servers.forEach(Server::close)

    @Test
    fun `a redirect is followed only within the API, so the token goes nowhere else`() {
        val elsewhere = server({ respond(it, 200, """{"login": "mallory"}""") })
        val api = server({
            it.responseHeaders.add("Location", "${elsewhere.url}/user")
            it.sendResponseHeaders(301, -1)
        })
        assertFailsWith<TrackerUnavailableException> { client(api.url).login("secret-token") }
        assertTrue(elsewhere.paths.isEmpty())
    }

    @Test
    fun `GitHub Enterprise Server keeps its path, and its site is the host of the API`() {
        val api = server(
            {
                it.responseHeaders.add("Location", "/api/v3/user/moved")
                it.sendResponseHeaders(301, -1)
            },
            { respond(it, 200, """{"login": "alice"}""") },
        )
        val client = client("${api.url}/api/v3/")
        assertEquals("alice", client.login("secret-token"))
        assertEquals(listOf("/api/v3/user", "/api/v3/user/moved"), api.paths.toList())
        assertEquals(listOf<String?>("Bearer secret-token", "Bearer secret-token"), api.tokens.toList())
        assertEquals(api.url, client.webUrl)
        assertEquals("https://github.com", client("https://api.github.com").webUrl)
    }

    @Test
    fun `a limit of requests passes, while another refusal is the answer to the token`() {
        val api = server(
            {
                it.responseHeaders.add("x-ratelimit-remaining", "0")
                respond(it, 403, """{"message": "API rate limit exceeded"}""")
            },
            { respond(it, 429, "{}") },
            { respond(it, 403, """{"message": "Resource not accessible by personal access token"}""") },
            { respond(it, 401, "{}") },
            { respond(it, 410, "{}") },
            { respond(it, 200, "not json") },
        )
        val client = client(api.url)
        assertFailsWith<TrackerUnavailableException> { client.issue("token", "acme/shop", 1) }
        assertFailsWith<TrackerUnavailableException> { client.issue("token", "acme/shop", 1) }
        assertFailsWith<TrackerForbiddenException> { client.create("token", "acme/shop", "Кэш", "") }
        assertFailsWith<TokenRejectedException> { client.issue("token", "acme/shop", 1) }
        assertFailsWith<IssueGoneException> { client.issue("token", "acme/shop", 1) }
        assertFailsWith<TrackerUnavailableException> { client.issue("token", "acme/shop", 1) }
    }

    @Test
    fun `an issue whose page is no web address is not taken`() {
        val issue = """
            {"id": 1, "number": 1, "title": "x", "state": "open", "html_url": "javascript:alert(1)",
             "updated_at": "2026-01-01T00:00:00Z", "repository_url": "https://api.github.com/repos/acme/shop"}
        """
        val api = server({ respond(it, 200, issue) })
        assertFailsWith<TrackerUnavailableException> { client(api.url).issue("token", "acme/shop", 1) }
        assertNull(client(api.url).issueOf(JsonMapper.builder().build().readTree("""{"id": "1"}""")))
    }

    @Test
    fun `an empty address of the API turns the tracker off, and a wrong one stops the start`() {
        val off = client("")
        assertEquals(false, off.available)
        assertNull(off.webUrl)
        assertFailsWith<TrackerUnavailableException> { off.login("token") }
        assertFailsWith<IllegalArgumentException> { client("ftp://github.example.com") }
    }

    @Test
    fun `names of repositories go into paths as they are`() {
        assertTrue(Repositories.isName("acme/shop.web-2_0"))
        for (wrong in listOf("acme", "acme/", "/shop", "acme/shop/issues", "acme/..", "-acme/shop", "acme/shop?x", "a b/c")) {
            assertEquals(false, Repositories.isName(wrong), wrong)
        }
    }

    @Test
    fun `the text of an issue created from CoDraw reads as written and links back`() {
        val body = IssueLinkService.issueBody(
            "  Нужен **Redis**  ",
            BackLink("элемент «API [v2] @team #12» на доске «Платежи»", "https://codraw.example.com/boards/1?page=p&cell=c"),
        )
        assertEquals(
            "Нужен **Redis**\n\n---\nСоздано в CoDraw: [элемент «API \\[v2\\] @​team #​12» на доске «Платежи»]" +
                "(https://codraw.example.com/boards/1?page=p&cell=c)",
            body,
        )
        assertEquals("Создано в CoDraw: [обсуждение](https://x)", IssueLinkService.issueBody(" ", BackLink("обсуждение", "https://x")))
    }

    private fun server(vararg answers: (HttpExchange) -> Unit) = Server(*answers).also { servers += it }

    private fun client(apiUrl: String) = GitHubClient(IssueProperties(IssueProperties.GitHub(apiUrl = apiUrl)), JsonMapper.builder().build())

    private fun respond(exchange: HttpExchange, status: Int, body: String) {
        val bytes = body.toByteArray()
        exchange.sendResponseHeaders(status, bytes.size.toLong())
        exchange.responseBody.use { it.write(bytes) }
    }
}
