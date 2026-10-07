package io.github.thescarletarrow.codraw.schemaimport

import org.postgresql.PGProperty
import org.postgresql.ssl.DefaultJavaSSLFactory
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket
import java.net.SocketAddress
import java.net.URLEncoder
import java.time.Duration
import java.util.Properties
import javax.net.SocketFactory

/** The name of the sessions of imports in `pg_stat_activity` of the database. */
const val APPLICATION_NAME = "CoDraw schema import"

/**
 * The URL of the driver: the host and the port, and the database as a name in the path, encoded, so that nothing in it
 * becomes a parameter of the URL; parameters are [driverProperties] only.
 */
fun driverUrl(target: ConnectionTarget): String {
    val host = if (':' in target.host) "[${target.host.removeSurrounding("[", "]")}]" else target.host
    val database = URLEncoder.encode(target.database, Charsets.UTF_8).replace("+", "%20")
    return "jdbc:postgresql://$host:${target.port}/$database"
}

/**
 * The properties of the driver for an import, and only these: the user and the password (an empty one too, so that the
 * driver does not look into `.pgpass`), SSL, timeouts, a read-only session, the name of the application, no GSS and
 * JAAS, a bound on the size of a result, and sockets that connect to the checked address of the target whatever host
 * the driver resolves.
 */
fun driverProperties(target: ConnectionTarget, settings: SchemaImportProperties): Properties = Properties().apply {
    PGProperty.USER.set(this, target.user)
    PGProperty.PASSWORD.set(this, target.password)
    PGProperty.SSL_MODE.set(this, target.sslMode.value)
    // The default factory of the driver wants `~/.postgresql/root.crt`; the authorities of the JVM check instead.
    if (target.sslMode == SslMode.VERIFY_FULL) PGProperty.SSL_FACTORY.set(this, DefaultJavaSSLFactory::class.java.name)
    PGProperty.CONNECT_TIMEOUT.set(this, seconds(settings.connectTimeout))
    PGProperty.SOCKET_TIMEOUT.set(this, seconds(settings.readTimeout))
    PGProperty.LOGIN_TIMEOUT.set(this, seconds(settings.readTimeout))
    PGProperty.READ_ONLY.set(this, true)
    // `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY` when connected, not only `BEGIN READ ONLY`.
    PGProperty.READ_ONLY_MODE.set(this, "always")
    PGProperty.APPLICATION_NAME.set(this, APPLICATION_NAME)
    PGProperty.GSS_ENC_MODE.set(this, "disable")
    PGProperty.JAAS_LOGIN.set(this, false)
    PGProperty.MAX_RESULT_BUFFER.set(this, (settings.maxDdlSize.toBytes() * 4).toString())
    PGProperty.SOCKET_FACTORY.set(this, PinnedSocketFactory::class.java.name)
    PGProperty.SOCKET_FACTORY_ARG.set(this, target.address.hostAddress)
}

/** Whole seconds, at least one: the driver counts its timeouts in seconds, and 0 means none. */
private fun seconds(duration: Duration): Int = duration.toSeconds().coerceIn(1, Int.MAX_VALUE.toLong()).toInt()

/**
 * Sockets that connect to one address, whatever host the driver asks for: the address that [HostGuard] checked, so
 * that a name that resolves differently by the time of the connection cannot lead elsewhere. The host stays in the URL
 * for SSL. The driver creates the factory by its name with the address as `socketFactoryArg`.
 */
class PinnedSocketFactory(address: String) : SocketFactory() {

    private val address: InetAddress = requireNotNull(Hosts.literal(address)) { "The address of a pinned socket must be an address" }

    override fun createSocket(): Socket = PinnedSocket(address)

    override fun createSocket(host: String?, port: Int): Socket = createSocket().apply { connect(InetSocketAddress(address, port)) }

    override fun createSocket(host: String?, port: Int, localHost: InetAddress?, localPort: Int): Socket =
        createSocket().apply {
            bind(InetSocketAddress(localHost, localPort))
            connect(InetSocketAddress(address, port))
        }

    override fun createSocket(host: InetAddress?, port: Int): Socket = createSocket(null as String?, port)

    override fun createSocket(host: InetAddress?, port: Int, localAddress: InetAddress?, localPort: Int): Socket =
        createSocket(null as String?, port, localAddress, localPort)
}

/** A socket that connects to its [address] at the port of whatever endpoint it is given. */
private class PinnedSocket(private val address: InetAddress) : Socket() {
    override fun connect(endpoint: SocketAddress, timeout: Int) {
        val port = (endpoint as InetSocketAddress).port
        super.connect(InetSocketAddress(address, port), timeout)
    }
}
