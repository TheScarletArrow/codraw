package io.github.thescarletarrow.codraw.notification

import com.sun.net.httpserver.HttpServer
import java.net.InetAddress
import java.net.InetSocketAddress
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.CopyOnWriteArrayList

/**
 * An incoming webhook of a chat on this machine: it keeps the bodies of the requests and answers with the statuses
 * that a test queues, 200 when none is queued.
 */
class TestWebhook : AutoCloseable {

    private val server = HttpServer.create(InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0)
    private val statuses = ConcurrentLinkedQueue<Int>()

    /** The bodies of the requests, oldest first. */
    val bodies = CopyOnWriteArrayList<String>()

    init {
        server.createContext("/hooks/") { exchange ->
            exchange.requestBody.use { bodies += it.readAllBytes().toString(Charsets.UTF_8) }
            val status = statuses.poll() ?: 200
            exchange.sendResponseHeaders(status, -1)
            exchange.close()
        }
        server.start()
    }

    /** The address of the webhook, under a host that the tests allow. */
    val url: String
        get() = "http://localhost:${server.address.port}/hooks/T000/B000/secret-token-1234"

    /** The next requests get these statuses, one each. */
    fun answer(vararg status: Int) {
        statuses += status.toList()
    }

    override fun close() = server.stop(0)
}
